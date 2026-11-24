import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { readThemeScript, selectedThemeFile } from '../frontend/theme-config.mjs';

const [theme, ...extra] = process.argv.slice(2);

if (extra.length || (theme && theme !== 'classic' && theme !== 'winter')) {
  console.error('Usage: node scripts/site-theme.mjs [classic|winter]');
  process.exitCode = 1;
} else if (!theme) {
  const current = await readThemeScript();
  console.log(current.includes("'winter'") ? 'winter' : 'classic');
} else {
  const temporary = new URL(`./.selected-${randomUUID()}.tmp`, selectedThemeFile);
  try {
    await writeFile(temporary, `document.documentElement.dataset.theme = '${theme}';\n`, {
      flag: 'wx',
    });
    await rename(temporary, selectedThemeFile);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(theme);
}
