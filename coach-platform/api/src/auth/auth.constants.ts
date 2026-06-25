/**
 * Cookie names shared by the strategy (reads access) and the cookie service
 * (writes both). The refresh cookie is path-scoped to the refresh endpoint so
 * it is never sent on ordinary requests.
 */
export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/** Refresh cookie is only presented to this path. */
export const REFRESH_COOKIE_PATH = '/auth/refresh';
