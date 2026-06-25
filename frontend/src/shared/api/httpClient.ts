import { ApiError } from './ApiError';
import { getToken } from '@/shared/auth/tokenStorage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (signal !== undefined) {
    init.signal = signal;
  }

  const response = await fetch(`${BASE_URL}${path}`, init);

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = 'UNKNOWN';
  let message = response.statusText;
  try {
    const data = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof data.error === 'string') {
      code = data.error;
    }
    if (typeof data.message === 'string') {
      message = data.message;
    } else if (Array.isArray(data.message)) {
      message = data.message.filter((part): part is string => typeof part === 'string').join(', ');
    }
  } catch {
  }
  return new ApiError(response.status, code, message);
}
