import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  define: { __STANDALONE_IMAGES__: '{}' },
  esbuild: { jsx: 'automatic' },
  build: {
    assetsDir: 'frontend-assets',
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
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
    },
  },
});
