import { Hono } from 'hono';
import { validateBody, validateQuery } from '../lib/validation.js';
import { compareDeltaSchema, listSnapshotsSchema } from '../types/index.js';
import * as deltaService from '../services/delta.service.js';
import * as storage from '../services/storage.service.js';
import type { AuthContext } from '../types/index.js';

const app = new Hono();

// ============================================================================
// Delta Routes
// ============================================================================

// List deltas
app.get('/', validateQuery(listSnapshotsSchema), async (c) => {
  const auth = c.get('auth') as AuthContext;
  const query = c.get('validatedQuery') as {
    endpoint_id?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  };

  try {
    // If endpoint_id provided, verify access
    if (query.endpoint_id) {
      const endpoint = await storage.getEndpoint(query.endpoint_id);
      if (!endpoint || endpoint.project_id !== auth.project_id) {
        return c.json(
          {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'You do not have access to this endpoint',
            },
          },
          403
        );
      }
    }

    const result = await deltaService.listDeltas({
      endpoint_id: query.endpoint_id,
      project_id: auth.project_id,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json({
      success: true,
      data: result.deltas,
      meta: {
        total: result.total,
        limit: query.limit || 100,
        offset: query.offset || 0,
      },
    });
  } catch (error) {
    console.error('Error listing deltas:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DELTA_LIST_FAILED',
          message: 'Failed to list deltas',
        },
      },
      500
    );
  }
});

// Compare two snapshots on-demand
app.post('/compare', validateBody(compareDeltaSchema), async (c) => {
  const auth = c.get('auth') as AuthContext;
  const body = c.get('validatedBody') as {
    endpoint_id: string;
    from_snapshot_id: string;
    to_snapshot_id: string;
  };

  try {
    // Verify endpoint access
    const endpoint = await storage.getEndpoint(body.endpoint_id);
    if (!endpoint || endpoint.project_id !== auth.project_id) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You do not have access to this endpoint',
          },
        },
        403
      );
    }

    const result = await deltaService.computeDeltaOnDemand(
      body.endpoint_id,
      body.from_snapshot_id,
      body.to_snapshot_id
    );

    return c.json({
      success: true,
      data: {
        from_snapshot: {
          id: result.from_snapshot.id,
          timestamp: result.from_snapshot.timestamp,
          data_hash: result.from_snapshot.data_hash,
        },
        to_snapshot: {
          id: result.to_snapshot.id,
          timestamp: result.to_snapshot.timestamp,
          data_hash: result.to_snapshot.data_hash,
        },
        diff: result.diff,
        changes_count: result.changes_count,
        similarity_score: result.similarity_score,
      },
    });
  } catch (error) {
    console.error('Error comparing snapshots:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DELTA_COMPARE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to compare snapshots',
        },
      },
      500
    );
  }
});

export default app;
