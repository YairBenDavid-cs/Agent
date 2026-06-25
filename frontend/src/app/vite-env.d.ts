/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  // When not exactly 'false', the app runs in frontend-only mode: auth and the
  // assistant API are satisfied locally instead of calling the coach-platform backend.
  readonly VITE_MOCK_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
