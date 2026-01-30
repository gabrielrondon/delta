#!/usr/bin/env bun

import { Worker, Job, Queue } from 'bullmq';
import { redis } from '../lib/rate-limit.js';
import { createSnapshot } from '../services/snapshot.service.js';

// ============================================================================
// Polling Worker (Future Enhancement)
// ============================================================================

interface PollingJobData {
  endpoint_id: string;
  project_id: string;
  url: string;
  headers?: Record<string, string>;
  interval_seconds: number;
}

const pollingQueue = new Queue('api-polling', {
  connection: redis,
});

const worker = new Worker<PollingJobData>(
  'api-polling',
  async (job: Job<PollingJobData>) => {
    const { endpoint_id, project_id, url, headers } = job.data;

    console.log(`[Polling Worker] Fetching data from ${url}`);

    try {
      // Fetch data from external API
      const response = await fetch(url, {
        headers: headers || {},
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Create snapshot
      const result = await createSnapshot({
        endpoint_id,
        project_id,
        data,
        source: 'polling',
        metadata: {
          url,
          status: response.status,
          polled_at: new Date().toISOString(),
        },
      });

      console.log(
        `[Polling Worker] Snapshot created: ${result.snapshot.id}, ` +
          `duplicate: ${result.isDuplicate}`
      );

      return {
        snapshot_id: result.snapshot.id,
        is_duplicate: result.isDuplicate,
      };
    } catch (error) {
      console.error('[Polling Worker] Error fetching data:', error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

// ============================================================================
// Event Handlers
// ============================================================================

worker.on('completed', (job) => {
  console.log(`[Polling Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Polling Worker] Job ${job?.id} failed:`, err);
});

worker.on('error', (err) => {
  console.error('[Polling Worker] Worker error:', err);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown() {
  console.log('[Polling Worker] Shutting down...');
  await worker.close();
  await pollingQueue.close();
  await redis.quit();
  console.log('[Polling Worker] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[Polling Worker] Started and waiting for jobs...');

// Note: This is a placeholder for future polling functionality.
// In the MVP, we focus on SDK and webhook ingestion.
