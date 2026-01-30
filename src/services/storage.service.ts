import { query, transaction } from '../db/client.js';
import type { Project, Endpoint, Snapshot, Delta } from '../types/index.js';

// ============================================================================
// Project Storage
// ============================================================================

export async function createProject(
  userId: string,
  name: string,
  tier: 'free' | 'pro' | 'enterprise' = 'free'
): Promise<Project> {
  const result = await query<Project>(
    `INSERT INTO projects (user_id, name, tier)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, name, tier]
  );

  return result.rows[0];
}

export async function getProject(projectId: string): Promise<Project | null> {
  const result = await query<Project>(
    `SELECT * FROM projects WHERE id = $1`,
    [projectId]
  );

  return result.rows[0] || null;
}

export async function listProjects(userId: string): Promise<Project[]> {
  const result = await query<Project>(
    `SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const result = await query(`DELETE FROM projects WHERE id = $1`, [projectId]);
  return result.rowCount !== null && result.rowCount > 0;
}

// ============================================================================
// Endpoint Storage
// ============================================================================

export async function createEndpoint(
  projectId: string,
  name: string,
  metadata?: Record<string, any>
): Promise<Endpoint> {
  const result = await query<Endpoint>(
    `INSERT INTO endpoints (project_id, name)
     VALUES ($1, $2)
     RETURNING *`,
    [projectId, name]
  );

  return result.rows[0];
}

export async function getEndpoint(endpointId: string): Promise<Endpoint | null> {
  const result = await query<Endpoint>(
    `SELECT * FROM endpoints WHERE id = $1`,
    [endpointId]
  );

  return result.rows[0] || null;
}

export async function listEndpoints(projectId: string): Promise<Endpoint[]> {
  const result = await query<Endpoint>(
    `SELECT * FROM endpoints WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId]
  );

  return result.rows;
}

export async function deleteEndpoint(endpointId: string): Promise<boolean> {
  const result = await query(`DELETE FROM endpoints WHERE id = $1`, [endpointId]);
  return result.rowCount !== null && result.rowCount > 0;
}

// ============================================================================
// Snapshot Storage
// ============================================================================

export async function createSnapshot(snapshot: {
  endpoint_id: string;
  project_id: string;
  data: Record<string, any>;
  data_hash: string;
  size_bytes: number;
  source: 'sdk' | 'webhook' | 'polling';
  metadata?: Record<string, any>;
  timestamp?: Date;
}): Promise<Snapshot> {
  const result = await query<Snapshot>(
    `INSERT INTO snapshots (
      endpoint_id, project_id, timestamp, data, data_hash,
      size_bytes, source, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      snapshot.endpoint_id,
      snapshot.project_id,
      snapshot.timestamp || new Date(),
      JSON.stringify(snapshot.data),
      snapshot.data_hash,
      snapshot.size_bytes,
      snapshot.source,
      JSON.stringify(snapshot.metadata || {}),
    ]
  );

  const row = result.rows[0];
  return {
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  };
}

export async function getSnapshot(
  endpointId: string,
  snapshotId: string
): Promise<Snapshot | null> {
  const result = await query<Snapshot>(
    `SELECT * FROM snapshots WHERE endpoint_id = $1 AND id = $2`,
    [endpointId, snapshotId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  };
}

export async function listSnapshots(params: {
  endpoint_id?: string;
  project_id?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ snapshots: Snapshot[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (params.endpoint_id) {
    conditions.push(`endpoint_id = $${paramIndex++}`);
    values.push(params.endpoint_id);
  }

  if (params.project_id) {
    conditions.push(`project_id = $${paramIndex++}`);
    values.push(params.project_id);
  }

  if (params.from) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    values.push(params.from);
  }

  if (params.to) {
    conditions.push(`timestamp <= $${paramIndex++}`);
    values.push(params.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM snapshots ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get paginated results
  const limit = params.limit || 100;
  const offset = params.offset || 0;

  const result = await query<Snapshot>(
    `SELECT * FROM snapshots ${whereClause}
     ORDER BY timestamp DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, limit, offset]
  );

  const snapshots = result.rows.map((row) => ({
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  }));

  return { snapshots, total };
}

export async function getLatestSnapshot(
  endpointId: string
): Promise<Snapshot | null> {
  const result = await query<Snapshot>(
    `SELECT * FROM snapshots
     WHERE endpoint_id = $1
     ORDER BY timestamp DESC
     LIMIT 1`,
    [endpointId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  };
}

export async function getPreviousSnapshot(
  endpointId: string,
  beforeTimestamp: Date
): Promise<Snapshot | null> {
  const result = await query<Snapshot>(
    `SELECT * FROM snapshots
     WHERE endpoint_id = $1 AND timestamp < $2
     ORDER BY timestamp DESC
     LIMIT 1`,
    [endpointId, beforeTimestamp]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  };
}

// ============================================================================
// Delta Storage
// ============================================================================

export async function createDelta(delta: {
  endpoint_id: string;
  project_id: string;
  from_snapshot_id: string;
  to_snapshot_id: string;
  diff: any[];
  changes_count: number;
  similarity_score: number;
  timestamp?: Date;
}): Promise<Delta> {
  const result = await query<Delta>(
    `INSERT INTO deltas (
      endpoint_id, project_id, from_snapshot_id, to_snapshot_id,
      timestamp, diff, changes_count, similarity_score
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      delta.endpoint_id,
      delta.project_id,
      delta.from_snapshot_id,
      delta.to_snapshot_id,
      delta.timestamp || new Date(),
      JSON.stringify(delta.diff),
      delta.changes_count,
      delta.similarity_score,
    ]
  );

  const row = result.rows[0];
  return {
    ...row,
    diff: typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff,
  };
}

export async function listDeltas(params: {
  endpoint_id?: string;
  project_id?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ deltas: Delta[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (params.endpoint_id) {
    conditions.push(`endpoint_id = $${paramIndex++}`);
    values.push(params.endpoint_id);
  }

  if (params.project_id) {
    conditions.push(`project_id = $${paramIndex++}`);
    values.push(params.project_id);
  }

  if (params.from) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    values.push(params.from);
  }

  if (params.to) {
    conditions.push(`timestamp <= $${paramIndex++}`);
    values.push(params.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM deltas ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get paginated results
  const limit = params.limit || 100;
  const offset = params.offset || 0;

  const result = await query<Delta>(
    `SELECT * FROM deltas ${whereClause}
     ORDER BY timestamp DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, limit, offset]
  );

  const deltas = result.rows.map((row) => ({
    ...row,
    diff: typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff,
  }));

  return { deltas, total };
}
