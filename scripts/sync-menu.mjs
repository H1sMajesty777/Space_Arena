/**
 * Однократная подготовка исходного каталога из меню информационного сайта.
 * Запуск: node scripts/sync-menu.mjs
 * Рабочая база не изменяется: созданные барменом позиции хранятся в PostgreSQL.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('site/js/data.js', 'utf8');
const MENU = vm.runInNewContext(`${source}; MENU`);
const seedPath = 'backend/app/menu_seed.json';
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8').replace(/^\uFEFF/, ''));
const variantNames = {
  'Лобио по-мегрельски или по-имеретински': ['Лобио по-мегрельски', 'Лобио по-имеретински'],
  'Долма из баранины или говядины': ['Долма из баранины', 'Долма из говядины'],
  'По-аджарски': ['Хачапури по-аджарски с яйцом', 'Хачапури по-аджарски с помидорами'],
};

let position = 1;
for (const item of seed) delete item.is_hit;
for (const category of MENU) {
  for (const [name] of category.items) {
    for (const variant of variantNames[name] || [name]) {
      const item = seed.find(row => row.name === variant && row.category === category.title);
      if (!item) throw new Error(`Не найдена исходная позиция: ${variant}`);
      item.all_day = category.allDay;
      item.sort_order = position++;
    }
  }
  for (const photo of category.photos || []) {
    const item = seed.find(row => row.category === category.title && row.image_url === `assets/dishes/${photo}.jpg`);
    if (item) item.is_hit = true;
  }
}
seed.sort((a, b) => a.sort_order - b.sort_order);
fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2) + '\n');
fs.mkdirSync('frontend/src/config', { recursive: true });
fs.writeFileSync('frontend/src/config/presentation.json', JSON.stringify({
  categories: MENU.map(category => category.title),
}, null, 2) + '\n');
console.log(`Подготовлено ${seed.length} позиций и ${MENU.length} разделов.`);
