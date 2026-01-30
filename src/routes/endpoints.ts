import { Hono } from 'hono';
import { validateBody } from '../lib/validation.js';
import { createEndpointSchema } from '../types/index.js';
import * as storage from '../services/storage.service.js';
import type { AuthContext } from '../types/index.js';

const app = new Hono();

// ============================================================================
// Endpoint Routes
// ============================================================================

// Create endpoint
app.post('/', validateBody(createEndpointSchema), async (c) => {
  const auth = c.get('auth') as AuthContext;
  const body = c.get('validatedBody') as { project_id: string; name: string };

  // Verify project access
  if (body.project_id !== auth.project_id) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You do not have access to this project',
        },
      },
      403
    );
  }

  try {
    const endpoint = await storage.createEndpoint(body.project_id, body.name);

    return c.json({
      success: true,
      data: endpoint,
    });
  } catch (error) {
    console.error('Error creating endpoint:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'ENDPOINT_CREATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create endpoint',
        },
      },
      500
    );
  }
});

// List endpoints for a project
app.get('/', async (c) => {
  const auth = c.get('auth') as AuthContext;
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'project_id query parameter is required',
        },
      },
      400
    );
  }

  // Verify project access
  if (projectId !== auth.project_id) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You do not have access to this project',
        },
      },
      403
    );
  }

  try {
    const endpoints = await storage.listEndpoints(projectId);

    return c.json({
      success: true,
      data: endpoints,
    });
  } catch (error) {
    console.error('Error listing endpoints:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'ENDPOINT_LIST_FAILED',
          message: 'Failed to list endpoints',
        },
      },
      500
    );
  }
});

// Get endpoint by ID
app.get('/:id', async (c) => {
  const auth = c.get('auth') as AuthContext;
  const endpointId = c.req.param('id');

  try {
    const endpoint = await storage.getEndpoint(endpointId);

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

    // Verify project access
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

    return c.json({
      success: true,
      data: endpoint,
    });
  } catch (error) {
    console.error('Error getting endpoint:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'ENDPOINT_GET_FAILED',
          message: 'Failed to get endpoint',
        },
      },
      500
    );
  }
});

// Delete endpoint
app.delete('/:id', async (c) => {
  const auth = c.get('auth') as AuthContext;
  const endpointId = c.req.param('id');

  try {
    const endpoint = await storage.getEndpoint(endpointId);

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

    // Verify project access
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

    const deleted = await storage.deleteEndpoint(endpointId);

    return c.json({
      success: true,
      data: { deleted },
    });
  } catch (error) {
    console.error('Error deleting endpoint:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'ENDPOINT_DELETE_FAILED',
          message: 'Failed to delete endpoint',
        },
      },
      500
    );
  }
});

export default app;
