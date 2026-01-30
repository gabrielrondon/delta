/**
 * Delta SDK - TypeScript/JavaScript Client
 * @module @delta/sdk
 */

// ============================================================================
// Types
// ============================================================================

export interface DeltaClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

export interface Snapshot {
  id: string;
  endpoint_id: string;
  timestamp: string;
  data_hash: string;
  size_bytes: number;
  source: string;
  data?: any;
}

export interface SnapshotResponse {
  snapshot: Snapshot;
  is_duplicate: boolean;
  queued_for_delta: boolean;
}

export interface Delta {
  id: string;
  endpoint_id: string;
  from_snapshot_id: string;
  to_snapshot_id: string;
  timestamp: string;
  diff: any[];
  changes_count: number;
  similarity_score: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  tier: string;
  created_at: string;
}

export interface Endpoint {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
}

// ============================================================================
// Delta Client
// ============================================================================

export class DeltaClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private retries: number;

  constructor(config: DeltaClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'http://localhost:3000';
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    retryCount = 0
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return data.data as T;
    } catch (error) {
      // Retry on network errors or 5xx errors
      if (retryCount < this.retries) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.request<T>(method, path, body, retryCount + 1);
      }

      throw error;
    }
  }

  // ==========================================================================
  // Snapshot Methods
  // ==========================================================================

  /**
   * Create a snapshot
   * @param endpoint - Endpoint name or ID
   * @param data - JSON data to snapshot
   * @param metadata - Optional metadata
   * @returns Snapshot response
   */
  async snapshot(
    endpoint: string,
    data: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<SnapshotResponse> {
    return this.request<SnapshotResponse>('POST', '/v1/snapshots', {
      endpoint_id: endpoint,
      data,
      metadata,
    });
  }

  /**
   * Get latest snapshot for an endpoint
   * @param endpoint - Endpoint name or ID
   * @returns Latest snapshot
   */
  async getLatest(endpoint: string): Promise<Snapshot> {
    return this.request<Snapshot>('GET', `/v1/snapshots/latest/${endpoint}`);
  }

  /**
   * List snapshots
   * @param options - Filter options
   * @returns List of snapshots
   */
  async getSnapshots(options: {
    endpoint_id?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ListResponse<Snapshot>> {
    const params = new URLSearchParams();
    if (options.endpoint_id) params.set('endpoint_id', options.endpoint_id);
    if (options.from) params.set('from', options.from);
    if (options.to) params.set('to', options.to);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.offset) params.set('offset', options.offset.toString());

    const query = params.toString();
    const path = `/v1/snapshots${query ? `?${query}` : ''}`;

    const data = await this.request<Snapshot[]>('GET', path);

    // Type assertion for the response structure
    return data as any;
  }

  /**
   * Get a specific snapshot by ID
   * @param snapshotId - Snapshot ID
   * @param endpointId - Endpoint ID
   * @returns Snapshot
   */
  async getSnapshot(snapshotId: string, endpointId: string): Promise<Snapshot> {
    return this.request<Snapshot>(
      'GET',
      `/v1/snapshots/${snapshotId}?endpoint_id=${endpointId}`
    );
  }

  // ==========================================================================
  // Delta Methods
  // ==========================================================================

  /**
   * Get delta between two snapshots
   * @param endpointId - Endpoint ID
   * @param fromSnapshotId - Previous snapshot ID
   * @param toSnapshotId - Current snapshot ID
   * @returns Delta
   */
  async getDelta(
    endpointId: string,
    fromSnapshotId: string,
    toSnapshotId: string
  ): Promise<{
    from_snapshot: Snapshot;
    to_snapshot: Snapshot;
    diff: any[];
    changes_count: number;
    similarity_score: number;
  }> {
    return this.request('POST', '/v1/deltas/compare', {
      endpoint_id: endpointId,
      from_snapshot_id: fromSnapshotId,
      to_snapshot_id: toSnapshotId,
    });
  }

  /**
   * List deltas
   * @param options - Filter options
   * @returns List of deltas
   */
  async getDeltas(options: {
    endpoint_id?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ListResponse<Delta>> {
    const params = new URLSearchParams();
    if (options.endpoint_id) params.set('endpoint_id', options.endpoint_id);
    if (options.from) params.set('from', options.from);
    if (options.to) params.set('to', options.to);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.offset) params.set('offset', options.offset.toString());

    const query = params.toString();
    const path = `/v1/deltas${query ? `?${query}` : ''}`;

    const data = await this.request<Delta[]>('GET', path);

    return data as any;
  }

  // ==========================================================================
  // Project Methods
  // ==========================================================================

  /**
   * Create a project
   * @param name - Project name
   * @returns Created project with API key
   */
  async createProject(name: string): Promise<{
    project: Project;
    api_key: { id: string; key: string; preview: string };
  }> {
    return this.request('POST', '/v1/projects', { name });
  }

  /**
   * List projects
   * @returns List of projects
   */
  async listProjects(): Promise<Project[]> {
    return this.request<Project[]>('GET', '/v1/projects');
  }

  // ==========================================================================
  // Endpoint Methods
  // ==========================================================================

  /**
   * Create an endpoint
   * @param projectId - Project ID
   * @param name - Endpoint name
   * @returns Created endpoint
   */
  async createEndpoint(projectId: string, name: string): Promise<Endpoint> {
    return this.request('POST', '/v1/endpoints', {
      project_id: projectId,
      name,
    });
  }

  /**
   * List endpoints
   * @param projectId - Project ID
   * @returns List of endpoints
   */
  async listEndpoints(projectId: string): Promise<Endpoint[]> {
    return this.request<Endpoint[]>(
      'GET',
      `/v1/endpoints?project_id=${projectId}`
    );
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Create multiple snapshots in batch
   * @param snapshots - Array of snapshot requests
   * @returns Array of snapshot responses
   */
  async batch(
    snapshots: Array<{
      endpoint: string;
      data: Record<string, any>;
      metadata?: Record<string, any>;
    }>
  ): Promise<SnapshotResponse[]> {
    return Promise.all(
      snapshots.map((s) => this.snapshot(s.endpoint, s.data, s.metadata))
    );
  }
}

// ============================================================================
// Export
// ============================================================================

export default DeltaClient;
