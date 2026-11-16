import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Два отдельных входа. Исходники информационного сайта лежат в site/.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  build: {
    assetsDir: 'frontend-assets',
    rollupOptions: {
      input: {
        order: resolve(import.meta.dirname, 'order.html'),
        bar: resolve(import.meta.dirname, 'bar.html'),
      },
    },
  },
  server: {
    fs: {
      allow: [import.meta.dirname, resolve(import.meta.dirname, '../backend/club-settings.json')],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/uploads': 'http://127.0.0.1:8000',
      '/assets': 'http://127.0.0.1:8080',
      '/css': 'http://127.0.0.1:8080',
    },
  },
});
