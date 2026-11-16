import { readFileSync, writeFileSync } from 'node:fs';

const { kitchen } = JSON.parse(
  readFileSync(new URL('../backend/club-settings.json', import.meta.url), 'utf8'),
);
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
if (
  !timePattern.test(kitchen.opens) ||
  !timePattern.test(kitchen.closes) ||
  kitchen.opens >= kitchen.closes
) {
  throw new Error(
    'Укажите часы кухни в club-settings.json в формате ЧЧ:ММ. Открытие должно быть раньше закрытия.',
  );
}

const hours = `${kitchen.opens} – ${kitchen.closes}`;
for (const name of ['index.html', 'standalone.html']) {
  const path = new URL(`../site/${name}`, import.meta.url);
  const html = readFileSync(path, 'utf8');
  const slot = /(<!-- kitchen-hours -->)[^<]*(<!-- \/kitchen-hours -->)/g;
  if ([...html.matchAll(slot)].length !== 2) {
    throw new Error(`В site/${name} ожидаются две отметки kitchen-hours.`);
  }
  const updated = html.replace(slot, (_, opening, closing) => opening + hours + closing);
  if (updated !== html) writeFileSync(path, updated, 'utf8');
}
