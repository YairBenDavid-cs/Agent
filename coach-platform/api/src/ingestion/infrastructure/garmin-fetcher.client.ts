import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { FetchResultDto } from '../application/dto/fetch-result.dto';
import { FetchInput, FetcherPort } from '../application/fetcher.port';
import { GarminAuthError } from '../application/ingestion.errors';

/**
 * HTTP adapter for the stateless Python fetch service (Option B: NestJS is the
 * sole DB writer; Python only fetches and normalizes).
 *
 * Failure policy agreed during design:
 *  - transient (connection refused / timeout / 5xx) -> retry with backoff;
 *  - a clean 4xx (e.g. bad/expired auth) -> do NOT blind-retry, surface it;
 *  - missing metric VALUES are not errors and are handled downstream as null.
 */
@Injectable()
export class GarminFetcherClient implements FetcherPort {
  private readonly logger = new Logger(GarminFetcherClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private static readonly MAX_ATTEMPTS = 3;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('FETCHER_BASE_URL');
    this.timeoutMs = config.get<number>('FETCHER_TIMEOUT_MS') ?? 30000;
  }

  async fetch(input: FetchInput): Promise<FetchResultDto> {
    const body = JSON.stringify({
      from: input.from,
      to: input.to,
      auth: {
        email: input.auth.credentials.email,
        password: input.auth.credentials.password,
        session: input.auth.session?.token ?? null,
      },
    });

    const raw = await this.postWithRetry(`${this.baseUrl}/fetch`, body);
    const dto = plainToInstance(FetchResultDto, raw, {
      enableImplicitConversion: false,
    });
    await validateOrReject(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    }).catch((errors) => {
      this.logger.error('Fetch service returned a malformed payload.');
      throw new ServiceUnavailableException(
        'Fetch service returned an invalid response.',
      );
    });
    return dto;
  }

  private async postWithRetry(url: string, body: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= GarminFetcherClient.MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await globalThis.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: controller.signal,
        });

        if (res.ok) {
          return res.json();
        }

        // 4xx (except 429) is a clean rejection — auth/validation. Don't retry.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          const detail = await res.text().catch(() => '');
          // 401/403 means the Garmin credentials/session were rejected — the user
          // must re-authenticate, so signal it distinctly from a transient fault.
          if (res.status === 401 || res.status === 403) {
            throw new GarminAuthError(
              `Garmin auth rejected (${res.status}): ${detail}`,
            );
          }
          throw new ServiceUnavailableException(
            `Fetch service rejected the request (${res.status}): ${detail}`,
          );
        }

        // 5xx / 429 -> transient.
        lastError = new Error(`Fetch service responded ${res.status}`);
      } catch (err) {
        // A deliberate 4xx rejection above must propagate, not be retried.
        if (
          err instanceof ServiceUnavailableException ||
          err instanceof GarminAuthError
        ) {
          throw err;
        }
        lastError = err; // network error / abort -> transient
      } finally {
        clearTimeout(timer);
      }

      if (attempt < GarminFetcherClient.MAX_ATTEMPTS) {
        const backoff = 250 * 2 ** (attempt - 1);
        this.logger.warn(
          `Fetch attempt ${attempt} failed (${String(lastError)}); retrying in ${backoff}ms.`,
        );
        await delay(backoff);
      }
    }
    throw new ServiceUnavailableException(
      `Fetch service unreachable after ${GarminFetcherClient.MAX_ATTEMPTS} attempts: ${String(lastError)}`,
    );
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
