import { Hono } from 'hono';
import { validateBody, validateQuery } from '../lib/validation.js';
import { createSnapshotSchema, listSnapshotsSchema } from '../types/index.js';
import * as snapshotService from '../services/snapshot.service.js';
import * as storage from '../services/storage.service.js';
import type { AuthContext } from '../types/index.js';

const app = new Hono();

// ============================================================================
// Snapshot Routes
// ============================================================================

// Create snapshot
app.post('/', validateBody(createSnapshotSchema), async (c) => {
  const auth = c.get('auth') as AuthContext;
  const body = c.get('validatedBody') as {
    endpoint_id: string;
    data: Record<string, any>;
    metadata?: Record<string, any>;
  };

  try {
    // Verify endpoint belongs to project
    const endpoint = await storage.getEndpoint(body.endpoint_id);
    if (!endpoint) {
      return c.json(
        {
          success: false,
          error: {
            code: 'ENDPOINT_NOT_FOUND',
            message: 'Endpoint not found',
          },
        },
        404
      );
    }

    if (endpoint.project_id !== auth.project_id) {
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

    const result = await snapshotService.createSnapshot({
      endpoint_id: body.endpoint_id,
      project_id: auth.project_id,
      data: body.data,
      source: 'sdk',
      metadata: body.metadata,
    });

    return c.json({
      success: true,
      data: {
        snapshot: {
          id: result.snapshot.id,
          endpoint_id: result.snapshot.endpoint_id,
          timestamp: result.snapshot.timestamp,
          data_hash: result.snapshot.data_hash,
          size_bytes: result.snapshot.size_bytes,
          source: result.snapshot.source,
        },
        is_duplicate: result.isDuplicate,
        queued_for_delta: result.queuedForDelta,
      },
    });
  } catch (error) {
    console.error('Error creating snapshot:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'SNAPSHOT_CREATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create snapshot',
        },
      },
      500
    );
  }
});

// List snapshots
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

    const result = await snapshotService.listSnapshots({
      endpoint_id: query.endpoint_id,
      project_id: auth.project_id,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json({
      success: true,
      data: result.snapshots.map((s) => ({
        id: s.id,
        endpoint_id: s.endpoint_id,
        timestamp: s.timestamp,
        data_hash: s.data_hash,
        size_bytes: s.size_bytes,
        source: s.source,
      })),
      meta: {
        total: result.total,
        limit: query.limit || 100,
        offset: query.offset || 0,
      },
    });
  } catch (error) {
    console.error('Error listing snapshots:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'SNAPSHOT_LIST_FAILED',
          message: 'Failed to list snapshots',
        },
      },
      500
    );
  }
});

// Get snapshot by ID
app.get('/:id', async (c) => {
  const auth = c.get('auth') as AuthContext;
  const snapshotId = c.req.param('id');
  const endpointId = c.req.query('endpoint_id');

  if (!endpointId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'MISSING_ENDPOINT_ID',
          message: 'endpoint_id query parameter is required',
        },
      },
      400
    );
  }

  try {
    // Verify endpoint access
    const endpoint = await storage.getEndpoint(endpointId);
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

    const snapshot = await snapshotService.getSnapshot(endpointId, snapshotId);

    if (!snapshot) {
      return c.json(
        {
          success: false,
          error: {
            code: 'SNAPSHOT_NOT_FOUND',
            message: 'Snapshot not found',
          },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error('Error getting snapshot:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'SNAPSHOT_GET_FAILED',
          message: 'Failed to get snapshot',
        },
      },
      500
    );
  }
});

// Get latest snapshot for endpoint
app.get('/latest/:endpoint_id', async (c) => {
  const auth = c.get('auth') as AuthContext;
  const endpointId = c.req.param('endpoint_id');

  try {
    // Verify endpoint access
    const endpoint = await storage.getEndpoint(endpointId);
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

    const snapshot = await snapshotService.getLatestSnapshot(endpointId);

    if (!snapshot) {
      return c.json(
        {
          success: false,
          error: {
            code: 'SNAPSHOT_NOT_FOUND',
            message: 'No snapshots found for this endpoint',
          },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error('Error getting latest snapshot:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'SNAPSHOT_GET_FAILED',
          message: 'Failed to get latest snapshot',
        },
      },
      500
    );
  }
});

export default app;
