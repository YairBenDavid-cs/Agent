import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

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
      '/auth': { target: 'http://localhost:3000', changeOrigin: true },
      '/users': { target: 'http://localhost:3000', changeOrigin: true },
      '/conversations': { target: 'http://localhost:3000', changeOrigin: true },
      '/training-profile': { target: 'http://localhost:3000', changeOrigin: true },
      '/integrations': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
