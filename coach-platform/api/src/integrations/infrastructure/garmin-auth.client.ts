import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GarminAuthClientPort,
  GarminAuthResult,
  GarminMfaResult,
} from '../domain/garmin-auth.port';

/**
 * HTTP adapter for the fetch service's auth endpoints (POST /auth, /auth/mfa).
 * The service answers 2xx with a `status` discriminator for auth outcomes
 * (ok / mfa_required / invalid_credentials / invalid_code / expired) and reserves
 * 5xx for genuine connection problems — which we surface as a 503 so the caller
 * sees "service unavailable", not "wrong password".
 */
@Injectable()
export class GarminAuthClient implements GarminAuthClientPort {
  private readonly logger = new Logger(GarminAuthClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('FETCHER_BASE_URL');
    this.timeoutMs = config.get<number>('FETCHER_TIMEOUT_MS') ?? 30000;
  }

  async authenticate(
    email: string,
    password: string,
  ): Promise<GarminAuthResult> {
    return this.post<GarminAuthResult>('/auth', { email, password });
  }

  async completeMfa(loginId: string, code: string): Promise<GarminMfaResult> {
    return this.post<GarminMfaResult>('/auth/mfa', { loginId, code });
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await globalThis.fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.error(`Auth service responded ${res.status}: ${detail}`);
        throw new ServiceUnavailableException(
          'Could not reach Garmin right now. Please try again in a moment.',
        );
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`Auth service unreachable: ${String(err)}`);
      throw new ServiceUnavailableException(
        'Could not reach Garmin right now. Please try again in a moment.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
