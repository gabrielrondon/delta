import { computeDiff, countChanges, calculateSimilarity } from '../lib/diff.js';
import * as storage from './storage.service.js';
import type { Delta, Snapshot } from '../types/index.js';

// ============================================================================
// Delta Computation
// ============================================================================

/**
 * Compute delta between two snapshots
 * @param fromSnapshotId - Previous snapshot ID
 * @param toSnapshotId - Current snapshot ID
 * @param endpointId - Endpoint ID
 * @returns Computed delta
 */
export async function computeDelta(
  fromSnapshotId: string,
  toSnapshotId: string,
  endpointId: string
): Promise<Delta> {
  // Fetch both snapshots
  const [fromSnapshot, toSnapshot] = await Promise.all([
    storage.getSnapshot(endpointId, fromSnapshotId),
    storage.getSnapshot(endpointId, toSnapshotId),
  ]);

  if (!fromSnapshot || !toSnapshot) {
    throw new Error('One or both snapshots not found');
  }

  // Compute diff
  const diff = computeDiff(fromSnapshot.data, toSnapshot.data);
  const changesCount = countChanges(diff);
  const similarityScore = calculateSimilarity(
    fromSnapshot.data,
    toSnapshot.data
  );

  // Store delta
  const delta = await storage.createDelta({
    endpoint_id: endpointId,
    project_id: toSnapshot.project_id,
    from_snapshot_id: fromSnapshotId,
    to_snapshot_id: toSnapshotId,
    diff,
    changes_count: changesCount,
    similarity_score: similarityScore,
    timestamp: toSnapshot.timestamp,
  });

  return delta;
}

/**
 * Compute delta on-demand between any two snapshots
 * @param endpointId - Endpoint ID
 * @param fromSnapshotId - Previous snapshot ID
 * @param toSnapshotId - Current snapshot ID
 * @returns Delta (not stored)
 */
export async function computeDeltaOnDemand(
  endpointId: string,
  fromSnapshotId: string,
  toSnapshotId: string
): Promise<{
  from_snapshot: Snapshot;
  to_snapshot: Snapshot;
  diff: any[];
  changes_count: number;
  similarity_score: number;
}> {
  // Fetch both snapshots
  const [fromSnapshot, toSnapshot] = await Promise.all([
    storage.getSnapshot(endpointId, fromSnapshotId),
    storage.getSnapshot(endpointId, toSnapshotId),
  ]);

  if (!fromSnapshot || !toSnapshot) {
    throw new Error('One or both snapshots not found');
  }

  // Compute diff
  const diff = computeDiff(fromSnapshot.data, toSnapshot.data);
  const changesCount = countChanges(diff);
  const similarityScore = calculateSimilarity(
    fromSnapshot.data,
    toSnapshot.data
  );

  return {
    from_snapshot: fromSnapshot,
    to_snapshot: toSnapshot,
    diff,
    changes_count: changesCount,
    similarity_score: similarityScore,
  };
}

/**
 * List deltas with filters
 * @param params - Query parameters
 * @returns Deltas and total count
 */
export async function listDeltas(params: {
  endpoint_id?: string;
  project_id?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ deltas: Delta[]; total: number }> {
  return storage.listDeltas(params);
}

/**
 * Get delta statistics for an endpoint
 * @param endpointId - Endpoint ID
 * @returns Statistics
 */
export async function getDeltaStats(endpointId: string): Promise<{
  total_count: number;
  avg_changes: number;
  avg_similarity: number;
  max_changes: number;
  min_changes: number;
}> {
  const { deltas } = await storage.listDeltas({
    endpoint_id: endpointId,
    limit: 1000,
  });

  if (deltas.length === 0) {
    return {
      total_count: 0,
      avg_changes: 0,
      avg_similarity: 0,
      max_changes: 0,
      min_changes: 0,
    };
  }

  const totalChanges = deltas.reduce((sum, d) => sum + d.changes_count, 0);
  const totalSimilarity = deltas.reduce((sum, d) => sum + d.similarity_score, 0);
  const changes = deltas.map((d) => d.changes_count);

  return {
    total_count: deltas.length,
    avg_changes: totalChanges / deltas.length,
    avg_similarity: totalSimilarity / deltas.length,
    max_changes: Math.max(...changes),
    min_changes: Math.min(...changes),
  };
}
