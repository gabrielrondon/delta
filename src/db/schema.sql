-- ============================================================================
-- Delta Platform - TimescaleDB Schema
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

CREATE INDEX idx_projects_user_id ON projects(user_id);

-- Endpoints (APIs being tracked)
CREATE TABLE IF NOT EXISTS endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_project_endpoint UNIQUE(project_id, name)
);

CREATE INDEX idx_endpoints_project_id ON endpoints(project_id);

-- Snapshots (hypertable - time-series partitioned)
CREATE TABLE IF NOT EXISTS snapshots (
  id UUID DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL,
  data_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('sdk', 'webhook', 'polling')),
  metadata JSONB DEFAULT '{}',
  PRIMARY KEY (endpoint_id, timestamp, id)
);

-- Convert to hypertable (only if not already a hypertable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'snapshots'
  ) THEN
    PERFORM create_hypertable('snapshots', 'timestamp',
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
  END IF;
END $$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_snapshots_endpoint_id ON snapshots(endpoint_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_project_id ON snapshots(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_hash ON snapshots(data_hash);

-- Compression policy (compress after 7 days)
DO $$
BEGIN
  -- Enable compression
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.compression_settings
    WHERE hypertable_name = 'snapshots'
  ) THEN
    ALTER TABLE snapshots SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'endpoint_id',
      timescaledb.compress_orderby = 'timestamp DESC'
    );
  END IF;

  -- Add compression policy if not exists
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_compression'
    AND hypertable_name = 'snapshots'
  ) THEN
    PERFORM add_compression_policy('snapshots', INTERVAL '7 days');
  END IF;
END $$;

-- Deltas (computed diffs) - hypertable
CREATE TABLE IF NOT EXISTS deltas (
  id UUID DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_snapshot_id UUID NOT NULL,
  to_snapshot_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diff JSONB NOT NULL,
  changes_count INTEGER NOT NULL,
  similarity_score FLOAT,
  PRIMARY KEY (endpoint_id, timestamp, id)
);

-- Convert to hypertable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'deltas'
  ) THEN
    PERFORM create_hypertable('deltas', 'timestamp',
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deltas_endpoint_id ON deltas(endpoint_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_deltas_snapshots ON deltas(from_snapshot_id, to_snapshot_id);

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
  id UUID DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  PRIMARY KEY (project_id, timestamp, id)
);

-- Convert to hypertable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'usage_events'
  ) THEN
    PERFORM create_hypertable('usage_events', 'timestamp',
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_usage_events_project ON usage_events(project_id, timestamp DESC);

-- ============================================================================
-- Continuous Aggregates (for analytics)
-- ============================================================================

-- Hourly snapshot counts per endpoint
CREATE MATERIALIZED VIEW IF NOT EXISTS snapshots_hourly
WITH (timescaledb.continuous) AS
SELECT
  endpoint_id,
  project_id,
  time_bucket('1 hour', timestamp) AS bucket,
  COUNT(*) as snapshot_count,
  SUM(size_bytes) as total_bytes,
  COUNT(DISTINCT data_hash) as unique_snapshots
FROM snapshots
GROUP BY endpoint_id, project_id, bucket
WITH NO DATA;

-- Refresh policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_refresh_continuous_aggregate'
    AND hypertable_name = 'snapshots_hourly'
  ) THEN
    PERFORM add_continuous_aggregate_policy('snapshots_hourly',
      start_offset => INTERVAL '2 hours',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour'
    );
  END IF;
END $$;

-- ============================================================================
-- Retention Policies (optional - for production)
-- ============================================================================

-- Uncomment to auto-delete old data
-- SELECT add_retention_policy('snapshots', INTERVAL '90 days');
-- SELECT add_retention_policy('deltas', INTERVAL '90 days');
-- SELECT add_retention_policy('usage_events', INTERVAL '30 days');

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
