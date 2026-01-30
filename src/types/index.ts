import { z } from 'zod';

// ============================================================================
// Core Domain Types
// ============================================================================

export interface Project {
  id: string;
  user_id: string;
  name: string;
  tier: 'free' | 'pro' | 'enterprise';
  created_at: Date;
}

export interface Endpoint {
  id: string;
  project_id: string;
  name: string;
  created_at: Date;
}

export interface Snapshot {
  id: string;
  endpoint_id: string;
  project_id: string;
  timestamp: Date;
  data: Record<string, any>;
  data_hash: string;
  size_bytes: number;
  source: 'sdk' | 'webhook' | 'polling';
  metadata: Record<string, any>;
}

export interface Delta {
  id: string;
  endpoint_id: string;
  from_snapshot_id: string;
  to_snapshot_id: string;
  timestamp: Date;
  diff: any[]; // JSON Patch operations
  changes_count: number;
  similarity_score: number;
}

export interface ApiKey {
  id: string;
  project_id: string;
  key_hash: string;
  key_preview: string;
  created_at: Date;
}

// ============================================================================
// Validation Schemas (Zod)
// ============================================================================

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
});

export const createEndpointSchema = z.object({
  name: z.string().min(1).max(255),
  project_id: z.string().uuid(),
});

export const createSnapshotSchema = z.object({
  endpoint_id: z.string().uuid(),
  data: z.record(z.any()),
  metadata: z.record(z.any()).optional().default({}),
});

export const listSnapshotsSchema = z.object({
  endpoint_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const compareDeltaSchema = z.object({
  endpoint_id: z.string().uuid(),
  from_snapshot_id: z.string().uuid(),
  to_snapshot_id: z.string().uuid(),
});

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
}

export interface SnapshotResponse {
  id: string;
  endpoint_id: string;
  timestamp: string;
  data_hash: string;
  size_bytes: number;
  source: string;
}

export interface DeltaResponse {
  id: string;
  endpoint_id: string;
  from_snapshot_id: string;
  to_snapshot_id: string;
  timestamp: string;
  diff: any[];
  changes_count: number;
  similarity_score: number;
}

// ============================================================================
// Authentication & Authorization
// ============================================================================

export interface AuthContext {
  project_id: string;
  tier: 'free' | 'pro' | 'enterprise';
  user_id?: string;
}

export interface RateLimitConfig {
  free: number;
  pro: number;
  enterprise: number;
}

// ============================================================================
// Worker Job Types
// ============================================================================

export interface DeltaComputeJob {
  snapshot_id: string;
  endpoint_id: string;
  project_id: string;
}

export interface PollingJob {
  endpoint_id: string;
  project_id: string;
  url: string;
  headers?: Record<string, string>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isValidTier(tier: string): tier is 'free' | 'pro' | 'enterprise' {
  return ['free', 'pro', 'enterprise'].includes(tier);
}

export function isValidSource(source: string): source is 'sdk' | 'webhook' | 'polling' {
  return ['sdk', 'webhook', 'polling'].includes(source);
}
