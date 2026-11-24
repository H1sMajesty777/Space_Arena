import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readThemeScript, themeScriptPath } from './theme-config.mjs';

function serveSelectedTheme({ middlewares }) {
  middlewares.use(async (request, response, next) => {
    if (request.url?.split('?')[0] !== themeScriptPath) return next();
    try {
      const script = await readThemeScript();
      response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.end(script);
    } catch (error) {
      next(error);
    }
  });
}

export default defineConfig({
  plugins: [
    {
      name: 'space-arena-theme',
      configureServer: serveSelectedTheme,
      configurePreviewServer: serveSelectedTheme,
    },
  ],
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
