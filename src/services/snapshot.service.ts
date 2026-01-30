import { hashData } from '../lib/hash.js';
import { getJsonSize, checkJsonSize } from '../lib/validation.js';
import * as storage from './storage.service.js';
import type { Snapshot } from '../types/index.js';
import { Queue } from 'bullmq';
import { redis } from '../lib/rate-limit.js';

// ============================================================================
// BullMQ Queue for Delta Computation
// ============================================================================

const deltaQueue = new Queue('delta-computation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000,
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
});

// ============================================================================
// Snapshot Ingestion
// ============================================================================

export interface CreateSnapshotParams {
  endpoint_id: string;
  project_id: string;
  data: Record<string, any>;
  source: 'sdk' | 'webhook' | 'polling';
  metadata?: Record<string, any>;
}

export interface CreateSnapshotResult {
  snapshot: Snapshot;
  isDuplicate: boolean;
  queuedForDelta: boolean;
}

/**
 * Create a new snapshot
 * @param params - Snapshot parameters
 * @returns Created snapshot and metadata
 */
export async function createSnapshot(
  params: CreateSnapshotParams
): Promise<CreateSnapshotResult> {
  // Validate size
  const maxSizeMB = parseInt(process.env.MAX_SNAPSHOT_SIZE_MB || '10', 10);
  if (!checkJsonSize(params.data, maxSizeMB)) {
    throw new Error(
      `Snapshot data exceeds maximum size of ${maxSizeMB}MB`
    );
  }

  // Compute hash
  const dataHash = hashData(params.data);
  const sizeBytes = getJsonSize(params.data);

  // Check for duplicate (same hash within last hour)
  const latestSnapshot = await storage.getLatestSnapshot(params.endpoint_id);
  const isDuplicate =
    latestSnapshot !== null &&
    latestSnapshot.data_hash === dataHash &&
    Date.now() - latestSnapshot.timestamp.getTime() < 3600000; // 1 hour

  if (isDuplicate) {
    return {
      snapshot: latestSnapshot,
      isDuplicate: true,
      queuedForDelta: false,
    };
  }

  // Create snapshot
  const snapshot = await storage.createSnapshot({
    endpoint_id: params.endpoint_id,
    project_id: params.project_id,
    data: params.data,
    data_hash: dataHash,
    size_bytes: sizeBytes,
    source: params.source,
    metadata: params.metadata || {},
  });

  // Queue delta computation job
  let queuedForDelta = false;
  if (latestSnapshot) {
    try {
      await deltaQueue.add('compute-delta', {
        snapshot_id: snapshot.id,
        endpoint_id: snapshot.endpoint_id,
        project_id: snapshot.project_id,
        previous_snapshot_id: latestSnapshot.id,
      });
      queuedForDelta = true;
    } catch (error) {
      console.error('Failed to queue delta computation:', error);
    }
  }

  return {
    snapshot,
    isDuplicate: false,
    queuedForDelta,
  };
}

/**
 * Get snapshot by ID
 * @param endpointId - Endpoint ID
 * @param snapshotId - Snapshot ID
 * @returns Snapshot or null
 */
export async function getSnapshot(
  endpointId: string,
  snapshotId: string
): Promise<Snapshot | null> {
  return storage.getSnapshot(endpointId, snapshotId);
}

/**
 * List snapshots with filters
 * @param params - Query parameters
 * @returns Snapshots and total count
 */
export async function listSnapshots(params: {
  endpoint_id?: string;
  project_id?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ snapshots: Snapshot[]; total: number }> {
  return storage.listSnapshots(params);
}

/**
 * Get latest snapshot for an endpoint
 * @param endpointId - Endpoint ID
 * @returns Latest snapshot or null
 */
export async function getLatestSnapshot(
  endpointId: string
): Promise<Snapshot | null> {
  return storage.getLatestSnapshot(endpointId);
}

/**
 * Get snapshot statistics for an endpoint
 * @param endpointId - Endpoint ID
 * @returns Statistics
 */
export async function getSnapshotStats(endpointId: string): Promise<{
  total_count: number;
  total_bytes: number;
  unique_hashes: number;
  oldest_timestamp: Date | null;
  latest_timestamp: Date | null;
}> {
  const { snapshots, total } = await storage.listSnapshots({
    endpoint_id: endpointId,
    limit: 1000, // Get more for stats
  });

  if (snapshots.length === 0) {
    return {
      total_count: 0,
      total_bytes: 0,
      unique_hashes: 0,
      oldest_timestamp: null,
      latest_timestamp: null,
    };
  }

  const totalBytes = snapshots.reduce((sum, s) => sum + s.size_bytes, 0);
  const uniqueHashes = new Set(snapshots.map((s) => s.data_hash)).size;
  const timestamps = snapshots.map((s) => s.timestamp.getTime());

  return {
    total_count: total,
    total_bytes: totalBytes,
    unique_hashes: uniqueHashes,
    oldest_timestamp: new Date(Math.min(...timestamps)),
    latest_timestamp: new Date(Math.max(...timestamps)),
  };
}

// ============================================================================
// Cleanup
// ============================================================================

export async function closeDeltaQueue(): Promise<void> {
  await deltaQueue.close();
  console.log('Delta queue closed');
}

process.on('SIGTERM', closeDeltaQueue);
process.on('SIGINT', closeDeltaQueue);
