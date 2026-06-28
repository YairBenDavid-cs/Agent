import * as Joi from 'joi';

/**
 * Treat process.env as untrusted: fail fast at boot on missing/invalid config.
 * Every key here must also exist in .env.example.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  MONGO_URL: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),

  // 32 bytes hex-encoded => exactly 64 hex characters.
  CREDENTIALS_ENCRYPTION_KEY: Joi.string()
    .hex()
    .length(64)
    .required(),

  // JWT signing. Two DISTINCT secrets so a leaked access secret can't mint
  // refresh tokens. Min 32 chars; generate with: openssl rand -hex 32.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .invalid(Joi.ref('JWT_ACCESS_SECRET'))
    .required(),
  JWT_ACCESS_TTL_SEC: Joi.number().integer().min(60).default(900), // 15 min
  JWT_REFRESH_TTL_SEC: Joi.number()
    .integer()
    .min(3600)
    .default(2592000), // 30 days

  // Comma-separated list of allowed browser origins. Unset => CORS disabled
  // (dev uses a same-origin Vite proxy, so no CORS is needed locally).
  CORS_ORIGIN: Joi.string().optional(),

  FETCHER_BASE_URL: Joi.string().uri().required(),
  FETCHER_TIMEOUT_MS: Joi.number().integer().min(1000).default(120000),

  INGESTION_BACKFILL_DAYS: Joi.number().integer().min(1).max(30).default(3),

  // Google Calendar per-user OAuth ("Web application" client in Google Cloud).
  // Optional: unset/empty disables the Connect-Google-Calendar flow, which then
  // returns 503 GOOGLE_OAUTH_NOT_CONFIGURED instead of crashing at boot.
  GOOGLE_OAUTH_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().allow('').optional(),
  GOOGLE_OAUTH_REDIRECT_URI: Joi.string().uri().allow('').optional(),

  // Agent layer (LLM specialists + orchestrator). OPENAI_API_KEY is optional so
  // the API still boots without it; agent endpoints return a clear error instead
  // of crashing at startup. REDIS_URL backs the BullMQ single-flight queue and
  // idempotency store; defaults to localhost for dev.
  OPENAI_API_KEY: Joi.string().allow('').optional(),
  OPENAI_MODEL: Joi.string().default('gpt-4o'),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .default('redis://localhost:6379'),
});
