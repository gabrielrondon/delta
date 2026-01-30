#!/usr/bin/env bun

import { Worker, Job } from 'bullmq';
import { redis } from '../lib/rate-limit.js';
import { computeDelta } from '../services/delta.service.js';

// ============================================================================
// Delta Computation Worker
// ============================================================================

interface DeltaComputeJobData {
  snapshot_id: string;
  endpoint_id: string;
  project_id: string;
  previous_snapshot_id: string;
}

const worker = new Worker<DeltaComputeJobData>(
  'delta-computation',
  async (job: Job<DeltaComputeJobData>) => {
    const { snapshot_id, endpoint_id, previous_snapshot_id } = job.data;

    console.log(`[Delta Worker] Computing delta for snapshot ${snapshot_id}`);

    try {
      const delta = await computeDelta(
        previous_snapshot_id,
        snapshot_id,
        endpoint_id
      );

      console.log(
        `[Delta Worker] Delta computed: ${delta.changes_count} changes, ` +
          `similarity: ${delta.similarity_score.toFixed(2)}`
      );

      return {
        delta_id: delta.id,
        changes_count: delta.changes_count,
        similarity_score: delta.similarity_score,
      };
    } catch (error) {
      console.error('[Delta Worker] Error computing delta:', error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5, // Process 5 jobs concurrently
    limiter: {
      max: 100, // Max 100 jobs
      duration: 1000, // per second
    },
  }
);

// ============================================================================
// Event Handlers
// ============================================================================

worker.on('completed', (job) => {
  console.log(`[Delta Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Delta Worker] Job ${job?.id} failed:`, err);
});

worker.on('error', (err) => {
  console.error('[Delta Worker] Worker error:', err);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown() {
  console.log('[Delta Worker] Shutting down...');
  await worker.close();
  await redis.quit();
  console.log('[Delta Worker] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[Delta Worker] Started and waiting for jobs...');
