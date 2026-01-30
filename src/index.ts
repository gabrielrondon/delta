import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { healthCheck } from './db/client.js';
import { validateApiKey } from './services/auth.service.js';
import { rateLimitMiddleware } from './lib/rate-limit.js';
import type { AuthContext } from './types/index.js';

// Import routes
import projectsRouter from './routes/projects.js';
import endpointsRouter from './routes/endpoints.js';
import snapshotsRouter from './routes/snapshots.js';
import deltasRouter from './routes/deltas.js';
import webhooksRouter from './routes/webhooks.js';

// ============================================================================
// Main Application
// ============================================================================

const app = new Hono();

// ============================================================================
// Global Middleware
// ============================================================================

// CORS
app.use('*', cors());

// Logging
app.use('*', logger());

// Pretty JSON in development
if (process.env.NODE_ENV === 'development') {
  app.use('*', prettyJSON());
}

// ============================================================================
// Public Routes (no auth required)
// ============================================================================

app.get('/', (c) => {
  return c.json({
    name: 'Delta API',
    version: '0.1.0',
    description: 'Data Versioning & Temporal Analytics Platform',
    docs: '/v1/docs',
  });
});

app.get('/health', async (c) => {
  const dbHealthy = await healthCheck();

  return c.json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

// Temporary migration endpoint (remove in production)
app.post('/setup', async (c) => {
  try {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const { query } = await import('./db/client.js');

    // Use simplified PostgreSQL schema (Railway doesn't have TimescaleDB)
    const schemaPath = join(import.meta.dir, 'db', 'schema-postgres.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    await query(schema);

    return c.json({
      success: true,
      message: 'Database schema created successfully (PostgreSQL mode - without TimescaleDB features)',
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Migration failed',
    }, 500);
  }
});

// ============================================================================
// Authentication Middleware
// ============================================================================

async function authMiddleware(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid Authorization header. Expected: Bearer {api_key}',
        },
      },
      401
    );
  }

  const apiKey = authHeader.substring(7); // Remove 'Bearer '
  const auth = await validateApiKey(apiKey);

  if (!auth) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
        },
      },
      401
    );
  }

  c.set('auth', auth);
  await next();
}

// ============================================================================
// Protected API Routes (v1)
// ============================================================================

const v1 = new Hono<{ Variables: { auth: AuthContext } }>();

// Apply auth middleware to all v1 routes except webhooks
v1.use('/projects/*', authMiddleware);
v1.use('/endpoints/*', authMiddleware);
v1.use('/snapshots/*', authMiddleware);
v1.use('/deltas/*', authMiddleware);

// Apply rate limiting after auth
v1.use('/projects/*', rateLimitMiddleware);
v1.use('/endpoints/*', rateLimitMiddleware);
v1.use('/snapshots/*', rateLimitMiddleware);
v1.use('/deltas/*', rateLimitMiddleware);

// Mount routers
v1.route('/projects', projectsRouter);
v1.route('/endpoints', endpointsRouter);
v1.route('/snapshots', snapshotsRouter);
v1.route('/deltas', deltasRouter);
v1.route('/webhooks', webhooksRouter); // Webhooks have their own auth

// Mount v1 to app
app.route('/v1', v1);

// ============================================================================
// Error Handling
// ============================================================================

app.onError((err, c) => {
  console.error('Unhandled error:', err);

  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
      },
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
    },
    404
  );
});

// ============================================================================
// Server
// ============================================================================

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   Δ Delta - Data Versioning & Temporal Analytics Platform   ║
║                                                              ║
║   Version: 0.1.0                                            ║
║   Port: ${port}                                              ║
║   Environment: ${process.env.NODE_ENV || 'development'}                                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
