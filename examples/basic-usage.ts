#!/usr/bin/env bun

/**
 * Delta SDK - Basic Usage Example
 *
 * This example demonstrates how to use the Delta SDK to:
 * 1. Create a project and endpoint
 * 2. Create snapshots
 * 3. Query snapshots and deltas
 */

import { DeltaClient } from '../sdk/index.js';

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = process.env.DELTA_API_URL || 'http://localhost:3000';
const API_KEY = process.env.DELTA_API_KEY || '';

if (!API_KEY) {
  console.error('Error: DELTA_API_KEY environment variable is required');
  console.error('Usage: DELTA_API_KEY=your_key bun run examples/basic-usage.ts');
  process.exit(1);
}

// ============================================================================
// Main Example
// ============================================================================

async function main() {
  console.log('Delta SDK - Basic Usage Example\n');

  // Initialize client
  const delta = new DeltaClient({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
  });

  try {
    // 1. Create snapshots
    console.log('1. Creating snapshots...');

    const snapshot1 = await delta.snapshot(
      'example-endpoint',
      {
        users: [
          { id: 1, name: 'Alice', email: 'alice@example.com', age: 30 },
          { id: 2, name: 'Bob', email: 'bob@example.com', age: 25 },
        ],
        timestamp: new Date().toISOString(),
      },
      { source: 'example-script' }
    );

    console.log('✓ Snapshot 1 created:', snapshot1.snapshot.id);

    // Wait 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create second snapshot with changes
    const snapshot2 = await delta.snapshot('example-endpoint', {
      users: [
        { id: 1, name: 'Alice', email: 'alice@newdomain.com', age: 31 }, // Changed email and age
        { id: 2, name: 'Bob', email: 'bob@example.com', age: 25 },
        { id: 3, name: 'Charlie', email: 'charlie@example.com', age: 28 }, // New user
      ],
      timestamp: new Date().toISOString(),
    });

    console.log('✓ Snapshot 2 created:', snapshot2.snapshot.id);
    console.log('  Queued for delta:', snapshot2.queued_for_delta);

    // 2. Get latest snapshot
    console.log('\n2. Getting latest snapshot...');

    const latest = await delta.getLatest('example-endpoint');
    console.log('✓ Latest snapshot:', {
      id: latest.id,
      timestamp: latest.timestamp,
      data_hash: latest.data_hash,
    });

    // 3. List snapshots
    console.log('\n3. Listing snapshots...');

    const snapshots = await delta.getSnapshots({
      endpoint_id: 'example-endpoint',
      limit: 10,
    });

    console.log(`✓ Found ${snapshots.data.length} snapshots`);
    snapshots.data.forEach((s) => {
      console.log(`  - ${s.id} (${s.timestamp})`);
    });

    // 4. Wait for delta computation (worker needs to process)
    console.log('\n4. Waiting for delta computation...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 5. Get delta
    console.log('\n5. Getting deltas...');

    const deltas = await delta.getDeltas({
      endpoint_id: 'example-endpoint',
    });

    if (deltas.data.length > 0) {
      console.log(`✓ Found ${deltas.data.length} deltas`);
      const latestDelta = deltas.data[0];
      console.log('  Latest delta:', {
        id: latestDelta.id,
        changes: latestDelta.changes_count,
        similarity: latestDelta.similarity_score.toFixed(2),
      });
    } else {
      console.log('⚠ No deltas found yet (worker may still be processing)');
    }

    // 6. Compare specific snapshots
    if (snapshot1.snapshot.id && snapshot2.snapshot.id) {
      console.log('\n6. Comparing snapshots on-demand...');

      const comparison = await delta.getDelta(
        'example-endpoint',
        snapshot1.snapshot.id,
        snapshot2.snapshot.id
      );

      console.log('✓ Comparison results:');
      console.log(`  Changes: ${comparison.changes_count}`);
      console.log(`  Similarity: ${comparison.similarity_score.toFixed(2)}`);
      console.log(`  Diff operations: ${comparison.diff.length}`);
      console.log('\n  Sample diff operations:');
      comparison.diff.slice(0, 3).forEach((op) => {
        console.log(`    ${op.op} at ${op.path}`);
      });
    }

    // 7. Batch create snapshots
    console.log('\n7. Batch creating snapshots...');

    await delta.batch([
      {
        endpoint: 'example-endpoint',
        data: { counter: 1, timestamp: new Date().toISOString() },
      },
      {
        endpoint: 'example-endpoint',
        data: { counter: 2, timestamp: new Date().toISOString() },
      },
    ]);

    console.log('✓ Batch snapshots created');

    console.log('\n✓ Example completed successfully!');
  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

// Run example
main();
