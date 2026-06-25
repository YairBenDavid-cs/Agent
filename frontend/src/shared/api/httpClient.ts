import { ApiError } from './ApiError';
import { emitLogout } from '@/shared/auth/authEvents';

// Empty in dev (the Vite proxy serves the API same-origin); set to the API
// origin in builds that talk to a cross-origin backend.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Internal: set once a request has already been retried after a refresh. */
  _retried?: boolean;
}

// Auth endpoints must never trigger the refresh-and-retry dance (a 401 from
// /auth/login is a real credential failure, and retrying /auth/refresh loops).
const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, _retried = false } = options;

  const headers: Record<string, string> = {};
  const init: RequestInit = { method, headers, credentials: 'include' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (signal !== undefined) {
    init.signal = signal;
  }

  const response = await fetch(`${BASE_URL}${path}`, init);

  // Access token likely expired: try a single silent refresh, then replay once.
  if (response.status === 401 && !_retried && !isAuthPath(path)) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, { ...options, _retried: true });
    }
    emitLogout();
    throw await toApiError(response);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function isAuthPath(path: string): boolean {
  return AUTH_PATHS.some((p) => path.startsWith(p));
}

// Single-flight: concurrent 401s share one refresh round-trip.
let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (refreshInFlight === null) {
    refreshInFlight = fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = 'UNKNOWN';
  let message = response.statusText;
  try {
    const data = (await response.json()) as {
      error?: { code?: unknown; message?: unknown; details?: unknown };
    };
    const err = data.error;
    if (err && typeof err.code === 'string') {
      code = err.code;
    }
    if (err && typeof err.message === 'string') {
      message = err.message;
    } else if (err && Array.isArray(err.details)) {
      message = err.details
        .filter((part): part is string => typeof part === 'string')
        .join(', ');
    }
  } catch {
    // Non-JSON body — keep the status text.
  }
  return new ApiError(response.status, code, message);
}
