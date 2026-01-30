import crypto from 'crypto';

/**
 * Generate SHA256 hash of JSON data
 * @param data - Any JSON-serializable data
 * @returns Hex-encoded SHA256 hash
 */
export function hashData(data: any): string {
  const normalized = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generate secure random API key
 * @param prefix - Key prefix (e.g., 'dk_proj')
 * @returns API key in format: prefix_randomstring
 */
export function generateApiKey(prefix: string = 'dk_proj'): string {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${randomBytes}`;
}

/**
 * Hash API key for storage
 * @param apiKey - Raw API key
 * @returns SHA256 hash
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Get preview of API key (first 8 chars + ... + last 4 chars)
 * @param apiKey - Raw API key
 * @returns Preview string
 */
export function getKeyPreview(apiKey: string): string {
  if (apiKey.length < 12) return apiKey;
  return `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`;
}

/**
 * Generate webhook token
 * @returns Random webhook token
 */
export function generateWebhookToken(): string {
  return crypto.randomBytes(16).toString('hex');
}
