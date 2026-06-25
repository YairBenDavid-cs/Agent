// Lets non-React modules (the http client) tell the app that the session is no
// longer valid. AuthProvider subscribes and clears the user; ProtectedRoute then
// bounces to /auth.
export const AUTH_LOGOUT_EVENT = 'auth:logout';

export function emitLogout(): void {
  window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
}

export function onLogout(handler: () => void): () => void {
  window.addEventListener(AUTH_LOGOUT_EVENT, handler);
  return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handler);
}
