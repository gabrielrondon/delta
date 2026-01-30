import pg from 'pg';

const { Pool } = pg;

// ============================================================================
// Database Connection Pool
// ============================================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// ============================================================================
// Query Helper Functions
// ============================================================================

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development') {
      console.log('Query executed:', {
        text: text.substring(0, 100),
        duration: `${duration}ms`,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (error) {
    console.error('Database query error:', {
      text,
      params,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export async function getClient() {
  const client = await pool.connect();

  // Add query method to client for consistency
  const originalQuery = client.query.bind(client);
  client.query = async (text: any, params?: any) => {
    const start = Date.now();
    try {
      const result = await originalQuery(text, params);
      const duration = Date.now() - start;

      if (process.env.NODE_ENV === 'development') {
        console.log('Client query executed:', {
          text: typeof text === 'string' ? text.substring(0, 100) : 'complex query',
          duration: `${duration}ms`,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      console.error('Database client query error:', {
        text: typeof text === 'string' ? text : 'complex query',
        params,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  };

  return client;
}

export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// Health Check
// ============================================================================

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}

// Handle process termination
process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);

export default pool;
