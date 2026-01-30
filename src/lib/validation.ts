import { Context } from 'hono';
import { z, ZodSchema } from 'zod';

/**
 * Validate request body against Zod schema
 * @param schema - Zod schema
 * @returns Validation middleware
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: () => Promise<void>) => {
    try {
      const body = await c.req.json();
      const validated = schema.parse(body);
      c.set('validatedBody', validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              details: error.errors,
            },
          },
          400
        );
      }
      throw error;
    }
  };
}

/**
 * Validate query parameters against Zod schema
 * @param schema - Zod schema
 * @returns Validation middleware
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: () => Promise<void>) => {
    try {
      const query = c.req.query();
      const validated = schema.parse(query);
      c.set('validatedQuery', validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid query parameters',
              details: error.errors,
            },
          },
          400
        );
      }
      throw error;
    }
  };
}

/**
 * Check if JSON size exceeds limit
 * @param data - JSON data
 * @param maxSizeMB - Maximum size in megabytes
 * @returns True if within limit
 */
export function checkJsonSize(data: any, maxSizeMB: number = 10): boolean {
  const sizeBytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
  const sizeMB = sizeBytes / (1024 * 1024);
  return sizeMB <= maxSizeMB;
}

/**
 * Get JSON size in bytes
 * @param data - JSON data
 * @returns Size in bytes
 */
export function getJsonSize(data: any): number {
  return Buffer.byteLength(JSON.stringify(data), 'utf8');
}
