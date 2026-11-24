import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { build } from 'vite';
import { imagePaths } from './src/features/public-site/image-paths.js';

const root = import.meta.dirname;
const types = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function inlineImage(path) {
  const data = await readFile(new URL(`./public${path}`, import.meta.url));
  return `data:${types[extname(path)]};base64,${data.toString('base64')}`;
}

const images = Object.fromEntries(
  await Promise.all(
    Object.entries(imagePaths).map(async ([key, path]) => [key, await inlineImage(path)]),
  ),
);

const { output } = await build({
  root,
  configFile: false,
  publicDir: false,
  define: { __STANDALONE_IMAGES__: JSON.stringify(images) },
  esbuild: { jsx: 'automatic' },
  build: {
    write: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: `${root}/src/public.jsx`,
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
});

const script = output.find((file) => file.type === 'chunk' && file.isEntry).code;
const styles = output.find((file) => file.fileName.endsWith('.css')).source;
const template = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const favicon = await inlineImage('/assets/sym.png');
const standalone = template
  .replace('/assets/sym.png', favicon)
  .replace('</head>', () => `<style>${styles}</style>\n  </head>`)
  .replace(
    /<script type="module" src="\/src\/public\.jsx"><\/script>/,
    () => `<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`,
  );

await writeFile(new URL('./dist/standalone.html', import.meta.url), standalone);
