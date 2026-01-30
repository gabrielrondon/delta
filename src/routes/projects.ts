import { Hono } from 'hono';
import { validateBody } from '../lib/validation.js';
import { createProjectSchema } from '../types/index.js';
import * as storage from '../services/storage.service.js';
import * as authService from '../services/auth.service.js';
import type { AuthContext } from '../types/index.js';

const app = new Hono();

// ============================================================================
// Project Routes
// ============================================================================

// Create project
app.post('/', validateBody(createProjectSchema), async (c) => {
  const auth = c.get('auth') as AuthContext;
  const body = c.get('validatedBody') as { name: string };

  try {
    const project = await storage.createProject(
      auth.user_id || 'anonymous',
      body.name,
      'free'
    );

    // Generate initial API key
    const { apiKey, rawKey } = await authService.createApiKey(project.id);

    return c.json({
      success: true,
      data: {
        project,
        api_key: {
          id: apiKey.id,
          key: rawKey, // Only shown once
          preview: apiKey.key_preview,
        },
      },
    });
  } catch (error) {
    console.error('Error creating project:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'PROJECT_CREATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create project',
        },
      },
      500
    );
  }
});

// List projects
app.get('/', async (c) => {
  const auth = c.get('auth') as AuthContext;

  try {
    const projects = await storage.listProjects(auth.user_id || 'anonymous');

    return c.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error('Error listing projects:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'PROJECT_LIST_FAILED',
          message: 'Failed to list projects',
        },
      },
      500
    );
  }
});

// Get project by ID
app.get('/:id', async (c) => {
  const auth = c.get('auth') as AuthContext;
  const projectId = c.req.param('id');

  // Verify project belongs to user
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
    const project = await storage.getProject(projectId);

    if (!project) {
      return c.json(
        {
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: 'Project not found',
          },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error('Error getting project:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'PROJECT_GET_FAILED',
          message: 'Failed to get project',
        },
      },
      500
    );
  }
});

// Delete project
app.delete('/:id', async (c) => {
  const auth = c.get('auth') as AuthContext;
  const projectId = c.req.param('id');

  // Verify project belongs to user
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
    const deleted = await storage.deleteProject(projectId);

    if (!deleted) {
      return c.json(
        {
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: 'Project not found',
          },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'PROJECT_DELETE_FAILED',
          message: 'Failed to delete project',
        },
      },
      500
    );
  }
});

export default app;
