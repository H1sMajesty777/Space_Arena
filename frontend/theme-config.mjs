import { readFile } from 'node:fs/promises';

export const themeScriptPath = '/theme/site-theme.js';
export const selectedThemeFile = new URL('./public/theme/selected.js', import.meta.url);
const defaultThemeFile = new URL(`./public${themeScriptPath}`, import.meta.url);

export async function readThemeScript() {
  try {
    return await readFile(selectedThemeFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return readFile(defaultThemeFile, 'utf8');
  }
}
