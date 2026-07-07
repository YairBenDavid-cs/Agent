import { defineConfig } from 'vite';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Some API prefixes (e.g. /auth, /assistant) collide with client-side SPA
// routes. On a hard refresh the browser issues a real HTML navigation for that
// path; without this guard Vite would proxy it to the API and the user sees a
// backend 404 ("Cannot GET /auth") instead of the app. Only proxy actual API
// calls (XHR/fetch), and let HTML navigations fall through to index.html.
const apiProxy = (): ProxyOptions => ({
  target: 'http://localhost:3000',
  changeOrigin: true,
  bypass: (req) =>
    req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
});

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Proxy API calls to the NestJS backend so the browser sees one origin.
    // This keeps the httpOnly auth cookies first-party (sameSite=lax) in dev,
    // exactly as they behave in production behind a shared domain. With this in
    // place VITE_API_BASE_URL stays empty and all requests are relative.
    proxy: {
      '/auth': apiProxy(),
      '/users': apiProxy(),
      '/assistant': apiProxy(),
      '/training-profile': apiProxy(),
      '/integrations': apiProxy(),
      '/programs': apiProxy(),
      '/planned-sessions': apiProxy(),
      '/agents': apiProxy(),
      '/ingestion': apiProxy(),
    },
  },
});
