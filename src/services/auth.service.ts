import { query } from '../db/client.js';
import { hashApiKey, generateApiKey, getKeyPreview } from '../lib/hash.js';
import type { ApiKey, AuthContext } from '../types/index.js';

// ============================================================================
// API Key Management
// ============================================================================

/**
 * Create a new API key for a project
 * @param projectId - Project ID
 * @returns API key object with raw key (only time it's visible)
 */
export async function createApiKey(
  projectId: string
): Promise<{ apiKey: ApiKey; rawKey: string }> {
  const rawKey = generateApiKey('dk_proj');
  const keyHash = hashApiKey(rawKey);
  const keyPreview = getKeyPreview(rawKey);

  const result = await query<ApiKey>(
    `INSERT INTO api_keys (project_id, key_hash, key_preview)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [projectId, keyHash, keyPreview]
  );

  return {
    apiKey: result.rows[0],
    rawKey,
  };
}

/**
 * Validate API key and get auth context
 * @param rawKey - Raw API key from Authorization header
 * @returns Auth context or null if invalid
 */
export async function validateApiKey(
  rawKey: string
): Promise<AuthContext | null> {
  if (!rawKey || !rawKey.startsWith('dk_proj_')) {
    return null;
  }

  const keyHash = hashApiKey(rawKey);

  const result = await query<{
    project_id: string;
    tier: 'free' | 'pro' | 'enterprise';
    user_id: string;
  }>(
    `SELECT p.id as project_id, p.tier, p.user_id
     FROM api_keys ak
     JOIN projects p ON p.id = ak.project_id
     WHERE ak.key_hash = $1`,
    [keyHash]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    project_id: row.project_id,
    tier: row.tier,
    user_id: row.user_id,
  };
}

/**
 * List all API keys for a project (without raw keys)
 * @param projectId - Project ID
 * @returns List of API keys
 */
export async function listApiKeys(projectId: string): Promise<ApiKey[]> {
  const result = await query<ApiKey>(
    `SELECT * FROM api_keys WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId]
  );

  return result.rows;
}

/**
 * Delete an API key
 * @param keyId - API key ID
 * @param projectId - Project ID (for authorization)
 * @returns True if deleted
 */
export async function deleteApiKey(
  keyId: string,
  projectId: string
): Promise<boolean> {
  const result = await query(
    `DELETE FROM api_keys WHERE id = $1 AND project_id = $2`,
    [keyId, projectId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

// ============================================================================
// Webhook Token Management
// ============================================================================

/**
 * Generate webhook URL for an endpoint
 * @param projectId - Project ID
 * @param endpointId - Endpoint ID
 * @param token - Webhook token
 * @returns Webhook URL
 */
export function generateWebhookUrl(
  projectId: string,
  endpointId: string,
  token: string
): string {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  return `${baseUrl}/v1/webhooks/${projectId}/${endpointId}/${token}`;
}

/**
 * Validate webhook token
 * @param projectId - Project ID
 * @param endpointId - Endpoint ID
 * @param token - Webhook token
 * @returns True if valid
 */
export async function validateWebhookToken(
  projectId: string,
  endpointId: string,
  token: string
): Promise<boolean> {
  // For MVP, we'll store webhook tokens in endpoint metadata
  const result = await query<{ metadata: any }>(
    `SELECT metadata FROM endpoints WHERE id = $1 AND project_id = $2`,
    [endpointId, projectId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  const metadata = result.rows[0].metadata || {};
  return metadata.webhook_token === token;
}
