# Getting Started with Delta

This guide will help you set up and run Delta locally for development.

## Prerequisites

Make sure you have the following installed:

- [Bun](https://bun.sh) >= 1.0
- [Docker](https://www.docker.com/) and Docker Compose (for local database)
- Git

## Step 1: Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd delta

# Install dependencies
bun install
```

## Step 2: Start Infrastructure

Delta requires TimescaleDB (PostgreSQL) and Redis. The easiest way to run them locally is with Docker Compose:

```bash
# Start TimescaleDB and Redis
docker compose up -d timescaledb redis

# Check that services are running
docker compose ps
```

You should see both `timescaledb` and `redis` running.

## Step 3: Configure Environment

The `.env` file is already configured for local development with Docker. If you need to change anything:

```bash
# The default configuration works with Docker Compose
# DATABASE_URL=postgresql://delta:delta_password@localhost:5432/delta
# REDIS_URL=redis://localhost:6379
```

## Step 4: Run Database Migrations

Create the database schema and TimescaleDB hypertables:

```bash
bun run db:migrate
```

You should see output confirming:
- ✓ Schema executed successfully
- ✓ Hypertables created (snapshots, deltas, usage_events)

## Step 5: Start the API Server

```bash
# Development mode (with hot reload)
bun run dev
```

The API will start on `http://localhost:3000`. You should see:

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   Δ Delta - Data Versioning & Temporal Analytics Platform   ║
║                                                              ║
║   Version: 0.1.0                                            ║
║   Port: 3000                                                ║
║   Environment: development                                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

Test the API:

```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "database": "connected"
}
```

## Step 6: Start the Delta Worker

In a **new terminal**, start the delta computation worker:

```bash
bun run worker:delta
```

This worker processes delta computation jobs asynchronously.

## Step 7: Create Your First Project

```bash
# Create a project (this will also generate an API key)
curl -X POST http://localhost:3000/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer temporary_dev_key" \
  -d '{"name": "My First Project"}'
```

**Important:** Save the API key from the response - you'll need it for all future requests!

The response will look like:
```json
{
  "success": true,
  "data": {
    "project": {
      "id": "uuid-here",
      "name": "My First Project",
      "tier": "free"
    },
    "api_key": {
      "key": "dk_proj_your_secret_key_here",
      "preview": "dk_proj_...xyz"
    }
  }
}
```

## Step 8: Create an Endpoint

```bash
# Replace YOUR_API_KEY with the key from step 7
export DELTA_API_KEY="dk_proj_your_secret_key_here"
export PROJECT_ID="your-project-id"

curl -X POST http://localhost:3000/v1/endpoints \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DELTA_API_KEY" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"name\": \"users\"}"
```

Save the endpoint ID from the response.

## Step 9: Create Snapshots

```bash
# Replace ENDPOINT_ID with your endpoint ID
export ENDPOINT_ID="your-endpoint-id"

# Create first snapshot
curl -X POST http://localhost:3000/v1/snapshots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DELTA_API_KEY" \
  -d "{
    \"endpoint_id\": \"$ENDPOINT_ID\",
    \"data\": {
      \"users\": [
        {\"id\": 1, \"name\": \"Alice\", \"email\": \"alice@example.com\"}
      ]
    }
  }"

# Wait a few seconds, then create second snapshot with changes
sleep 3

curl -X POST http://localhost:3000/v1/snapshots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DELTA_API_KEY" \
  -d "{
    \"endpoint_id\": \"$ENDPOINT_ID\",
    \"data\": {
      \"users\": [
        {\"id\": 1, \"name\": \"Alice\", \"email\": \"alice@newdomain.com\"},
        {\"id\": 2, \"name\": \"Bob\", \"email\": \"bob@example.com\"}
      ]
    }
  }"
```

## Step 10: Query Snapshots and Deltas

```bash
# List snapshots
curl "http://localhost:3000/v1/snapshots?endpoint_id=$ENDPOINT_ID" \
  -H "Authorization: Bearer $DELTA_API_KEY"

# Get latest snapshot
curl "http://localhost:3000/v1/snapshots/latest/$ENDPOINT_ID" \
  -H "Authorization: Bearer $DELTA_API_KEY"

# List deltas (after worker processes them)
sleep 2
curl "http://localhost:3000/v1/deltas?endpoint_id=$ENDPOINT_ID" \
  -H "Authorization: Bearer $DELTA_API_KEY"
```

## Using the SDK

For a better developer experience, use the TypeScript SDK:

```typescript
import { DeltaClient } from './sdk';

const delta = new DeltaClient({
  apiKey: 'dk_proj_your_api_key',
  baseUrl: 'http://localhost:3000',
});

// Create snapshot
const result = await delta.snapshot('users', {
  users: [{ id: 1, name: 'Alice' }],
});

// Get latest
const latest = await delta.getLatest('users');

// List snapshots
const snapshots = await delta.getSnapshots({
  endpoint_id: 'your-endpoint-id',
});
```

See `examples/basic-usage.ts` for a complete example:

```bash
# Set your API key
export DELTA_API_KEY="dk_proj_your_api_key"

# Run the example
bun run examples/basic-usage.ts
```

## Running Tests

```bash
bun test
```

## Webhook Integration

You can also send data via webhooks:

```bash
# Webhook URL format: /v1/webhooks/{project_id}/{endpoint_id}/{token}
# For MVP, any token works (add proper validation in production)

curl -X POST "http://localhost:3000/v1/webhooks/$PROJECT_ID/$ENDPOINT_ID/webhook_token_123" \
  -H "Content-Type: application/json" \
  -d '{"data": {"users": [...]}}'
```

## Docker Deployment

To run everything in Docker:

```bash
# Start all services (API, Worker, TimescaleDB, Redis)
docker compose up -d

# Check logs
docker compose logs -f

# Run migrations
docker compose exec api bun run db:migrate

# Stop all services
docker compose down
```

## Troubleshooting

### Database connection failed

Make sure TimescaleDB is running:
```bash
docker compose ps timescaledb
docker compose logs timescaledb
```

### Redis connection failed

Make sure Redis is running:
```bash
docker compose ps redis
docker compose logs redis
```

### TimescaleDB extension not found

Ensure you're using `timescale/timescaledb` image, not plain PostgreSQL:
```bash
docker compose down -v
docker compose up -d
```

### Worker not processing jobs

Make sure the worker is running:
```bash
bun run worker:delta
# Or in Docker:
docker compose logs worker
```

## Next Steps

- Read the full [README.md](./README.md) for API documentation
- Explore the [examples](./examples/) directory
- Check out the [architecture documentation](./docs/architecture.md) (if available)
- Deploy to production using Railway.app or Fly.io

## Support

For issues and questions, please open an issue on GitHub.

Happy versioning! 📸
