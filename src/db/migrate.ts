#!/usr/bin/env bun

import { readFileSync } from 'fs';
import { join } from 'path';
import { query, closePool } from './client.js';

// ============================================================================
// Database Migration Script
// ============================================================================

async function migrate() {
  console.log('Starting database migration...\n');

  try {
    // Read schema file
    const schemaPath = join(import.meta.dir, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Execute schema
    console.log('Executing schema.sql...');
    await query(schema);
    console.log('✓ Schema executed successfully\n');

    // Verify hypertables
    console.log('Verifying hypertables...');
    const hypertables = await query(`
      SELECT hypertable_name, num_dimensions
      FROM timescaledb_information.hypertables;
    `);

    if (hypertables.rows.length > 0) {
      console.log('✓ Hypertables created:');
      hypertables.rows.forEach((row: any) => {
        console.log(`  - ${row.hypertable_name}`);
      });
    } else {
      console.log('⚠ No hypertables found (TimescaleDB may not be enabled)');
    }

    console.log('\n✓ Migration completed successfully!');
  } catch (error) {
    console.error('\n✗ Migration failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run migration
migrate();
