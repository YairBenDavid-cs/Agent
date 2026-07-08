# Coach Platform

Multi-tenant fitness coaching backend. Each user's wearable data (recovery,
performance, training sessions) is ingested from Garmin, stored with strict
per-user isolation, and exposed through a clean API — the foundation for a future
coaching agent.

Two services:

- **`api/`** — NestJS + MongoDB (Mongoose). The system of record and the **only**
  database writer. Built to the project's DDD + CQRS standards.
- **`fetch-service/`** — a stateless Python (FastAPI) service that authenticates
  to Garmin and returns normalized metrics. It owns no database.

## Architecture

The API is organized into bounded contexts, each with the same four layers and
dependencies pointing inward (`domain` ← `application` ← `infrastructure` /
`interface`). The domain layer is framework-free.

```
src/
  common/        cross-cutting: error envelope, exception filter, crypto,
                 tenant base repository, content-hash, shared DTOs
  config/        typed config + Joi env validation (fail fast at boot)
  database/      single Mongoose connection
  users/         user profiles (no secrets)
  integrations/  encrypted credentials (Garmin / Google Calendar / Telegram)
  recovery/      daily recovery snapshots
  performance/   daily aggregates + slow-moving profile change-log
  sessions/      individual workouts (running / strength)
  ingestion/     orchestrator: pulls from fetch-service, writes via CommandBus
```

Reads and writes are split via `@nestjs/cqrs` (commands mutate, queries read).
Repositories are defined as **ports** in each domain and implemented in
`infrastructure`, injected through Symbol tokens so the domain never depends on
Mongoose.

### Multi-tenancy

Logical isolation: shared collections, every document carries `user_id`, and
`BaseTenantRepository` structurally requires a `userId` on every operation so a
query can't accidentally cross tenants.

### Idempotent ingestion

Each daily snapshot and session stores a `content_hash` (SHA-256 over stable
JSON). Re-running ingestion over unchanged data writes nothing. Slow-moving
markers (VO2max, race predictions, 1RMs) are kept in a per-metric **change-log**
that appends a row only when the value actually changes — cheap history without
write amplification.

### Security

- Credentials are encrypted at rest with **AES-256-GCM**; the key comes from
  `CREDENTIALS_ENCRYPTION_KEY` (a secrets manager in production), **never** the DB.
- Secrets live in a separate `user_integrations` collection and are **never**
  returned by the API — only connection *status* is exposed.
- The fetch service receives credentials/a short-lived session per request and
  has no database access. Google Calendar uses OAuth (refresh token only — no
  password is ever stored).

## Ingestion flow

```
@Cron (daily) ─┐
               ├─► IngestionOrchestrator.runForUser(userId)
POST /ingestion/run (on demand) ─┘
        │
        ├─ IntegrationsService.getDecryptedGarminAuth(userId)
        ├─ GarminFetcherClient.fetch(auth, from..to)  ──HTTP──►  fetch-service /fetch
        │     (transient errors retried w/ backoff; 4xx auth errors surfaced)
        ├─ CommandBus ─► UpsertRecoveryDay / UpsertPerformanceDay /
        │                AppendProfileChanges / UpsertSession   (content_hash dedup)
        └─ emit IngestionCompleted   ← seam for the future coach agent
```

## Running locally

### 1. API

```bash
cd api
npm install
cp .env.example .env          # then set a real CREDENTIALS_ENCRYPTION_KEY:
                              # openssl rand -hex 32
npm run typecheck             # tsc --noEmit
npm run start:dev             # http://localhost:3000
```

Requires MongoDB reachable at `MONGO_URL`.

### 2. Fetch service

```bash
cd fetch-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# FETCHER_SRC_DIR must point at the dir containing garmin_metrics_fetcher.py
export FETCHER_SRC_DIR=/path/to/that/dir
uvicorn app:app --port 8000
```

Set the API's `FETCHER_BASE_URL` to this service (default `http://localhost:8000`).

## Environment (`api/.env`)

| Key | Purpose |
| --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | API port (default 3000) |
| `MONGO_URL` | MongoDB connection string |
| `CREDENTIALS_ENCRYPTION_KEY` | 64 hex chars (32 bytes) for AES-256-GCM |
| `FETCHER_BASE_URL` | URL of the Python fetch service |
| `FETCHER_TIMEOUT_MS` | Per-request fetch timeout |
| `INGESTION_BACKFILL_DAYS` | Rolling window re-pulled each scheduled run |

## API surface

| Method & path | Description |
| --- | --- |
| `POST /users` | Create a user profile |
| `GET /users/me` | Current user's profile |
| `GET /integrations` | Connection status per provider (no secrets) |
| `PUT /integrations/garmin` | Connect/replace Garmin credentials |
| `PUT /integrations/google-calendar` | Connect Google Calendar (OAuth refresh token) |
| `PUT /integrations/telegram` | Connect Telegram |
| `POST /ingestion/run` | Trigger ingestion for the current user |
| `GET /recovery/days` | Recovery snapshots over a date range |
| `GET /performance/days` | Daily performance aggregates |
| `GET /performance/profile` | Current slow-moving profile values |
| `GET /performance/profile/:metric/history` | A metric's change history |
| `GET /sessions` | Workouts (cursor-paginated) |

> Auth: endpoints read the tenant from `request.user` via the `@CurrentUser`
> decorator. Wiring a real `JwtAuthGuard` / `AuthModule` is the next milestone;
> until then `request.user` must be populated upstream.

## Notes & next steps

- `@nestjs/schedule` + an in-process event seam drive ingestion today. When runs
  need durability, retries across restarts, or fan-out to the coach agent, the
  scheduler is the single place that graduates to a durable queue (a real
  BullMQ adoption, or extending the existing hand-rolled Redis queue used
  elsewhere in the codebase, is unused today — see the API README's Known Gaps
  note).
- User preferences (run types, weekly volume, muscle groups, etc.) are
  intentionally deferred.
