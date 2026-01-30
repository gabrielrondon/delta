import { Hono } from 'hono';
import * as snapshotService from '../services/snapshot.service.js';
import * as storage from '../services/storage.service.js';

const app = new Hono();

// ============================================================================
// Webhook Routes
// ============================================================================

// Receive webhook data
app.post('/:project_id/:endpoint_id/:token', async (c) => {
  const projectId = c.req.param('project_id');
  const endpointId = c.req.param('endpoint_id');
  const token = c.req.param('token');

  try {
    // Verify endpoint exists and belongs to project
    const endpoint = await storage.getEndpoint(endpointId);
    if (!endpoint || endpoint.project_id !== projectId) {
      return c.json(
        {
          success: false,
          error: {
            code: 'ENDPOINT_NOT_FOUND',
            message: 'Endpoint not found or does not belong to project',
          },
        },
        404
      );
    }

    // Validate webhook token (for MVP, we'll accept any token)
    // In production, implement proper token validation
    if (!token || token.length < 8) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid webhook token',
          },
        },
        401
      );
    }

    // Parse webhook data
    const body = await c.req.json();
    const data = body.data || body;

    if (!data || typeof data !== 'object') {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_DATA',
            message: 'Webhook data must be a valid JSON object',
          },
        },
        400
      );
    }

    // Create snapshot
    const result = await snapshotService.createSnapshot({
      endpoint_id: endpointId,
      project_id: projectId,
      data,
      source: 'webhook',
      metadata: {
        webhook_token: token,
        received_at: new Date().toISOString(),
        headers: {
          'user-agent': c.req.header('user-agent'),
          'content-type': c.req.header('content-type'),
        },
      },
    });

    return c.json({
      success: true,
      data: {
        snapshot_id: result.snapshot.id,
        timestamp: result.snapshot.timestamp,
        is_duplicate: result.isDuplicate,
      },
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'WEBHOOK_PROCESSING_FAILED',
          message: error instanceof Error ? error.message : 'Failed to process webhook',
        },
      },
      500
    );
  }
});

export default app;
