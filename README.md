# Delta - Data Versioning & Temporal Analytics Platform

**Delta** is a SaaS platform that provides versioning and historical tracking of API data. It captures snapshots at different timestamps, computes deltas/variances, and provides analytics dashboards - creating valuable time-series datasets for AI/ML training.

## Features

- 📸 **Snapshot Management** - Capture and store JSON data snapshots over time
- 🔄 **Delta Computation** - Automatic diff calculation between consecutive snapshots
- 📊 **Time-Series Storage** - Built on TimescaleDB for optimal performance
- 🚀 **Multiple Ingestion Methods** - SDK, webhooks, and polling (coming soon)
- 🔐 **Multi-Tenant** - Project-based isolation with API key authentication
- ⚡ **High Performance** - Powered by Bun runtime (3x faster than Node.js)
- 💾 **Storage Optimization** - Automatic compression after 7 days (90% savings)
- 📈 **Rate Limiting** - Tier-based rate limits (free, pro, enterprise)

## Tech Stack

- **Runtime**: Bun + TypeScript
- **API Framework**: Hono (ultrafast, lightweight)
- **Primary Database**: TimescaleDB (PostgreSQL time-series extension)
- **Job Queue**: BullMQ + Redis
- **Auth**: API key-based authentication

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- PostgreSQL with TimescaleDB extension
- Redis

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd delta

# Install dependencies
bun install

# Copy environment variables
cp .env.example .env

# Edit .env with your database and Redis URLs
```

### Database Setup

```bash
# Run migrations
bun run db:migrate
```

### Start the Server

```bash
# Development mode (with hot reload)
bun run dev

# Production mode
bun start
```

### Start Workers

```bash
# In separate terminals

# Delta computation worker
bun run worker:delta

# Polling worker (future)
bun run worker:polling
```

## API Documentation

### Authentication

All API requests require an API key in the Authorization header:

```
Authorization: Bearer {api_key}
```

### Endpoints

#### Projects

```bash
# Create a project
POST /v1/projects
{
  "name": "My Project"
}

# List projects
GET /v1/projects

# Get project
GET /v1/projects/:id

# Delete project
DELETE /v1/projects/:id
```

#### Endpoints

```bash
# Create endpoint
POST /v1/endpoints
{
  "project_id": "uuid",
  "name": "users"
}

# List endpoints
GET /v1/endpoints?project_id=uuid

# Get endpoint
GET /v1/endpoints/:id

# Delete endpoint
DELETE /v1/endpoints/:id
```

#### Snapshots

```bash
# Create snapshot
POST /v1/snapshots
{
  "endpoint_id": "uuid",
  "data": {
    "users": [...]
  },
  "metadata": {}
}

# List snapshots
GET /v1/snapshots?endpoint_id=uuid&from=2024-01-01&to=2024-01-31

# Get snapshot
GET /v1/snapshots/:id?endpoint_id=uuid

# Get latest snapshot
GET /v1/snapshots/latest/:endpoint_id
```

#### Deltas

```bash
# List deltas
GET /v1/deltas?endpoint_id=uuid

# Compare two snapshots
POST /v1/deltas/compare
{
  "endpoint_id": "uuid",
  "from_snapshot_id": "uuid",
  "to_snapshot_id": "uuid"
}
```

#### Webhooks

```bash
# Receive webhook
POST /v1/webhooks/:project_id/:endpoint_id/:token
{
  "data": {
    "users": [...]
  }
}
```

## SDK Usage

### Installation

```bash
# The SDK is included in the project at ./sdk/index.ts
# Import it directly or publish as a package
```

### Example

```typescript
import { DeltaClient } from './sdk';

// Initialize client
const delta = new DeltaClient({
  apiKey: 'dk_proj_your_api_key',
  baseUrl: 'http://localhost:3000',
});

// Create a snapshot
const result = await delta.snapshot('users', {
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ],
});

console.log('Snapshot created:', result.snapshot.id);

// Get latest snapshot
const latest = await delta.getLatest('users');
console.log('Latest snapshot:', latest);

// List snapshots
const snapshots = await delta.getSnapshots({
  endpoint_id: 'your-endpoint-id',
  limit: 10,
});

console.log('Snapshots:', snapshots.data);

// Get delta between two snapshots
const deltaDiff = await delta.getDelta(
  'endpoint-id',
  'from-snapshot-id',
  'to-snapshot-id'
);

console.log('Changes:', deltaDiff.changes_count);
console.log('Similarity:', deltaDiff.similarity_score);
console.log('Diff:', deltaDiff.diff);

// Batch create snapshots
await delta.batch([
  { endpoint: 'users', data: { users: [...] } },
  { endpoint: 'products', data: { products: [...] } },
]);
```

## Rate Limits

| Tier       | Snapshots/Hour | Storage  | Endpoints |
|------------|----------------|----------|-----------|
| Free       | 100            | 100 MB   | 5         |
| Pro        | 1,000          | 10 GB    | 100       |
| Enterprise | Unlimited      | Unlimited| Unlimited |

## Architecture

### Data Flow

1. **Ingestion** - Data arrives via SDK, webhook, or polling
2. **Storage** - Snapshot stored in TimescaleDB hypertable
3. **Queuing** - Delta computation job queued in BullMQ
4. **Computation** - Worker computes JSON diff using fast-json-patch
5. **Storage** - Delta stored in deltas hypertable
6. **Query** - API serves snapshots and deltas with time-series optimizations

### Database Schema

- **projects** - Multi-tenant project containers
- **endpoints** - API endpoints being tracked
- **snapshots** - Time-series snapshot data (hypertable, compressed)
- **deltas** - Computed differences (hypertable)
- **api_keys** - Authentication keys
- **usage_events** - Usage tracking (hypertable)

### Compression

Snapshots older than 7 days are automatically compressed using TimescaleDB's native compression, achieving ~90% storage savings.

## Testing

```bash
# Run all tests
bun test

# Run specific test
bun test snapshot.test.ts
```

## Deployment

### Docker

```bash
# Build image
docker build -t delta .

# Run container
docker run -p 3000:3000 --env-file .env delta
```

### Railway.app / Fly.io

Deploy using their respective CLIs:

```bash
# Railway
railway up

# Fly.io
fly deploy
```

## Environment Variables

See `.env.example` for all available configuration options.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT

## Roadmap

- [ ] Polling agent for automated API polling
- [ ] Advanced analytics and anomaly detection
- [ ] ClickHouse integration for massive scale
- [ ] Webhook notifications on significant changes
- [ ] ML dataset export (Parquet/CSV)
- [ ] Schema detection and enforcement
- [ ] Dashboard UI (Next.js + Tailwind)

---

**Delta** - Preserving the history of your data, one snapshot at a time. 📸
