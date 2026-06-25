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

  FETCHER_BASE_URL: Joi.string().uri().required(),
  FETCHER_TIMEOUT_MS: Joi.number().integer().min(1000).default(120000),

  INGESTION_BACKFILL_DAYS: Joi.number().integer().min(1).max(30).default(3),
});
