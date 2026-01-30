-- ============================================================================
-- Delta Platform - PostgreSQL Schema (without TimescaleDB)
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Core Tables
-- ============================================================================

-- Projects (tenant isolation)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_project UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Endpoints (APIs being tracked)
CREATE TABLE IF NOT EXISTS endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_project_endpoint UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_endpoints_project_id ON endpoints(project_id);

-- Snapshots (regular table - without hypertable)
CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL,
  data_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('sdk', 'webhook', 'polling')),
  metadata JSONB DEFAULT '{}'
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_snapshots_endpoint_id ON snapshots(endpoint_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_project_id ON snapshots(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_hash ON snapshots(data_hash);
CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp DESC);

-- Deltas (computed diffs - regular table)
CREATE TABLE IF NOT EXISTS deltas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_snapshot_id UUID NOT NULL,
  to_snapshot_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diff JSONB NOT NULL,
  changes_count INTEGER NOT NULL,
  similarity_score FLOAT
);

CREATE INDEX IF NOT EXISTS idx_deltas_endpoint_id ON deltas(endpoint_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_deltas_snapshots ON deltas(from_snapshot_id, to_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_deltas_timestamp ON deltas(timestamp DESC);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_preview TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_project_id ON api_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Usage Events (for rate limiting and billing)
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_usage_events_project ON usage_events(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp DESC);

-- ============================================================================
-- Functions & Triggers
-- ============================================================================

-- Function to log usage events
CREATE OR REPLACE FUNCTION log_usage_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO usage_events (project_id, event_type, metadata)
  VALUES (
    NEW.project_id,
    TG_TABLE_NAME || '_created',
    jsonb_build_object('id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic usage logging
DROP TRIGGER IF EXISTS snapshots_usage_trigger ON snapshots;
CREATE TRIGGER snapshots_usage_trigger
  AFTER INSERT ON snapshots
  FOR EACH ROW
  EXECUTE FUNCTION log_usage_event();

-- ============================================================================
-- Views
-- ============================================================================

-- Latest snapshots per endpoint
CREATE OR REPLACE VIEW latest_snapshots AS
SELECT DISTINCT ON (endpoint_id)
  id,
  endpoint_id,
  project_id,
  timestamp,
  data,
  data_hash,
  size_bytes,
  source,
  metadata
FROM snapshots
ORDER BY endpoint_id, timestamp DESC;

-- Project statistics
CREATE OR REPLACE VIEW project_stats AS
SELECT
  p.id as project_id,
  p.name as project_name,
  p.tier,
  COUNT(DISTINCT e.id) as endpoint_count,
  COUNT(DISTINCT s.id) as snapshot_count,
  COALESCE(SUM(s.size_bytes), 0) as total_bytes,
  MAX(s.timestamp) as last_snapshot_at
FROM projects p
LEFT JOIN endpoints e ON e.project_id = p.id
LEFT JOIN snapshots s ON s.project_id = p.id
GROUP BY p.id, p.name, p.tier;
