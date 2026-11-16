/* =====================================================================
   SPACE ARENA — main.js (логика сайта)

   Что где редактировать:
     • js/config.js — телефон, Telegram, адрес, часы, ссылка на бронирование
     • js/data.js   — картинки, цены, блюда и разделы меню
     • css/style.css — оформление
     • этот файл    — только логика, обычно его трогать не нужно

   Оглавление:
     1. Настройки интерфейса и утилиты
     2. Картинки
     3. Цены
     4. Фирменные блюда
     5. Меню: разделы, поиск, россыпь фото
     6. Контакты и бронирование
     7. Эффекты: появление, наклон карточек, курсор, прокрутка
     8. Звёздное небо
     9. Навигация (#menu — страница меню)
    10. Запуск
   ===================================================================== */

/* ---------- 1. Настройки интерфейса и утилиты ---------- */

const PRICE_COLUMNS = ["1 час", "День", "Ночь"];
const PRICE_COUNT_DELAY_MS = 250;
const COUNT_DURATION_MS = 1100;
const REVEAL_DURATION_MS = 1100;
const TOAST_DURATION_MS = 3400;
const COMPACT_SKY_FRAME_MS = 50;
const COMPACT_STAR_LIMIT = 56;

// Позиции, из которых появляются фотографии: [сдвиг в vw, сдвиг в vh].
const FLY_FROM = [
  [-80, 0],
  [80, 0],
  [0, -70],
  [0, 70],
  [-75, -55],
  [75, -55],
  [-75, 55],
  [75, 55],
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const COMPACT_EFFECTS = matchMedia("(max-width: 820px), (hover: none)");
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");

// Общее состояние для эффектов (положение мыши и прокрутки)
const state = { mouseX: 0, mouseY: 0, scrollY: 0 };

// «Случайные» числа с фиксированным зерном: раскладка фото одинакова при каждой загрузке
function makeRandom(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}
const between = (rand, min, max) => min + rand() * (max - min);

/* ---------- 2. Картинки ---------- */

// Все <img data-img="ключ"> получают путь из IMAGES (js/data.js)
function applyImages() {
  $$("[data-img]").forEach((img) => {
    img.src = IMAGES[img.dataset.img];
    img.draggable = false;
  });
  // CSS выбирает размер картинки. Настройка анимации не отключает оформление.
  // Абсолютный URL не зависит от каталога CSS, в котором используется переменная.
  const backdropUrl = (src) => `url("${new URL(src, document.baseURI).href}")`;
  $("#pp").style.setProperty("--price-backdrop", backdropUrl(IMAGES.priceBg));
  $("#pp").style.setProperty(
    "--price-backdrop-mobile",
    backdropUrl(IMAGES.priceBgMobile || IMAGES.priceBg),
  );
}

/* ---------- 3. Цены ---------- */

// mode: 'weekday' (будни) или 'weekend' (выходные)
function renderPrices(mode) {
  $("#rows").innerHTML = PRICES.map(
    (row, index) => `
    <div class="row" style="--i:${index}">
      <div class="rn"><h3>${row.name}</h3><p>${row.specs}</p></div>
      ${row[mode]
        .map(
          (price, k) => `
        <div class="pc"><i>${PRICE_COLUMNS[k]}</i><b data-n="${price}" data-rub>0</b></div>
      `,
        )
        .join("")}
    </div>
  `,
  ).join("");
  $$("#rows [data-n]").forEach(countUp);
}

function initPriceTabs() {
  const buttons = $$(".tabs button");
  buttons.forEach((button) => {
    button.onclick = () => {
      const isWeekend = button.dataset.t === "1";
      buttons.forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("on", active);
        tab.setAttribute("aria-pressed", String(active));
      });
      $(".tabs").classList.toggle("r", isWeekend); // сдвигает ползунок
      renderPrices(isWeekend ? "weekend" : "weekday");
    };
  });
}

// Плавный «разгон» числа от 0 до data-n (если есть data-rub — добавляет ₽)
function countUp(el) {
  const target = Number(el.dataset.n);
  const withRub = "rub" in el.dataset;
  const format = (value) =>
    value.toLocaleString("ru-RU") + (withRub ? " ₽" : "");
  if (COMPACT_EFFECTS.matches || REDUCED_MOTION.matches) {
    el.textContent = format(target);
    return;
  }

  const start = performance.now() + (withRub ? PRICE_COUNT_DELAY_MS : 0);
  (function frame(now) {
    const t = Math.min(1, Math.max(0, (now - start) / COUNT_DURATION_MS));
    el.textContent = format(Math.round(target * (1 - Math.pow(1 - t, 4))));
    if (t < 1) requestAnimationFrame(frame);
  })(start);
}

/* ---------- 4. Фирменные блюда (сетка фото на странице меню) ---------- */

const dishById = (id) => DISHES.find((dish) => dish.id === id);

function renderDishGrid() {
  $("#sg").innerHTML = DISHES.map(
    (dish, i) => `
    <article class="sc gl rv tl" data-tilt style="--d:${(i % 4) * 0.08}s">
      <img draggable="false" src="${IMAGES[dish.id]}" alt="${dish.name}" loading="lazy">
      <div><h4>${dish.name}</h4><p>${dish.note}</p><b>${dish.price} ₽</b></div>
    </article>
  `,
  ).join("");
}

/* ---------- 5. Меню ---------- */

function renderMenu() {
  $("#mg").innerHTML = MENU.map(
    (category, index) => `
    <div class="mc" id="m${index}" data-a="${category.allDay ? 1 : 0}">
      <section class="ms gl rv" data-g style="--d:${(index % 2) * 0.1}s">
        <div class="mh2">
          <span class="no">${String(index + 1).padStart(2, "0")}</span>
          <h3>${category.title}</h3>
          ${category.allDay ? "<em>24/7</em>" : ""}
        </div>
        <ul>
          ${category.items
            .map(
              ([name, note, price]) => `
            <li>
              <div><b>${name}</b>${note ? `<small>${note}</small>` : ""}</div>
              <s></s><span>${price} ₽</span>
            </li>
          `,
            )
            .join("")}
        </ul>
      </section>
      ${renderScatter(category.photos || [], index)}
    </div>
  `,
  ).join("");
}

// Кнопки-разделы над меню + кнопка «Круглосуточно»
function renderChips() {
  $("#chs").innerHTML =
    `<button type="button" data-filter="all-day" aria-pressed="false">Круглосуточно</button>` +
    MENU.map(
      (category, i) =>
        `<button type="button" data-category="m${i}">${category.title}</button>`,
    ).join("");
}

function initMenuControls() {
  const menu = $("#menuv");
  const search = $("#q");
  const allDay = $('[data-filter="all-day"]', menu);
  const categories = $$("[data-category]", menu).map((button) => ({
    button,
    block: document.getElementById(button.dataset.category),
  }));

  function filterMenu() {
    const query = search.value.trim().toLowerCase();
    const onlyAllDay = allDay.getAttribute("aria-pressed") === "true";
    menu.classList.toggle("searching", Boolean(query));
    let found = 0;
    for (const { block, button } of categories) {
      const included = !onlyAllDay || block.dataset.a === "1";
      let visible = 0;
      for (const item of $$("li", block)) {
        item.hidden =
          !included || !item.textContent.toLowerCase().includes(query);
        if (!item.hidden) visible++;
      }
      block.hidden = visible === 0;
      button.hidden = block.hidden;
      found += visible;
    }
    $("#no").style.display = found ? "none" : "block";
  }

  search.addEventListener("input", filterMenu);
  allDay.addEventListener("click", () => {
    const pressed = allDay.classList.toggle("on");
    allDay.setAttribute("aria-pressed", String(pressed));
    filterMenu();
  });
  for (const { block, button } of categories) {
    button.addEventListener("click", () =>
      block.scrollIntoView({ block: "start" }),
    );
  }
}

/* Россыпь фото под категорией.
   Фото разложены вразброс (небольшой поворот и сдвиг) и при прокрутке
   «влетают» с разных сторон экрана. Какие фото — задаётся в data.js (поле photos). */

function renderScatter(photoIds, seed) {
  if (!photoIds.length) return "";

  const rand = makeRandom(seed * 97 + 13);
  const COLUMNS = 2; // фото в ряд
  const WIDTH = 46; // ширина фото, % от ширины блока
  const ROW = 0.4; // высота ряда в долях ширины блока
  const rows = Math.ceil(photoIds.length / COLUMNS);
  const height = rows * ROW + 0.1; // полная высота блока в долях ширины

  const figures = photoIds
    .map((id, i) => {
      const dish = dishById(id);
      const row = Math.floor(i / COLUMNS);
      const alone = photoIds.length % 2 === 1 && i === photoIds.length - 1; // одинокое фото — по центру
      const left = alone ? 27 : (i % COLUMNS) * 52 + between(rand, -2, 2);
      const top = ((row * ROW + between(rand, -0.02, 0.04)) / height) * 100;
      const turn = between(rand, -9, 9);
      const [dx, dy] = FLY_FROM[Math.floor(rand() * FLY_FROM.length)];

      return `
      <figure class="pic" style="left:${left}%; top:${top}%; width:${WIDTH}%;
              --r:${turn}deg; --fx:${dx}vw; --fy:${dy}vh; --d:${(i * 0.12).toFixed(2)}s">
        <img src="${IMAGES[id]}" alt="${dish.name}" loading="lazy">
        <figcaption>${dish.name} · ${dish.price} ₽</figcaption>
      </figure>`;
    })
    .join("");

  return `<div class="scatter" style="aspect-ratio:${(1 / height).toFixed(3)}">${figures}</div>`;
}

/* ---------- 6. Контакты и бронирование ---------- */

function renderContacts() {
  const tel = CONFIG.phone.replace(/[^+\d]/g, "");
  const telegram = CONFIG.tg.startsWith("@")
    ? "https://t.me/" + CONFIG.tg.slice(1)
    : CONFIG.tg;

  $("#cl").innerHTML = `
    <div class="gl cc rv"><small>ТЕЛЕФОН</small>
      <a class="big" href="tel:${tel}">${CONFIG.phone}</a></div>
    <div class="gl cc rv" style="--d:.1s"><small>TELEGRAM</small>
      <a class="btn" href="${telegram}" target="_blank" rel="noopener">Открыть профиль ↗</a></div>
    <div class="gl cc rv" style="--d:.2s"><small>АДРЕС</small><b>${CONFIG.addr}</b></div>
    <div class="gl cc rv" style="--d:.3s"><small>РЕЖИМ РАБОТЫ</small><b>${CONFIG.hours}</b></div>
    <div class="gl cc rv" style="--d:.4s"><small>ОНЛАЙН-БРОНИРОВАНИЕ</small>
      <b>Забронируй место в мобильном приложении</b>
      <a class="btn" href="#contacts" data-book>Забронировать</a></div>
  `;

  const footerPhone = $(".ft-phone");
  footerPhone.href = "tel:" + tel;
  footerPhone.textContent = CONFIG.phone;
  $(".ft-telegram").href = telegram;
  $(".ft-address").textContent = CONFIG.addr;
  $(".ft-hours").textContent = CONFIG.hours;
}

function showToast(text) {
  const toast = document.createElement("div");
  toast.className = "ts";
  toast.setAttribute("role", "status");
  toast.textContent = text;
  document.body.append(toast);
  setTimeout(() => toast.classList.add("in"), 10);
  setTimeout(() => toast.remove(), TOAST_DURATION_MS);
}

// Любая кнопка с атрибутом data-book открывает бронирование (или показывает «скоро»)
function initBooking() {
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-book]")) return;
    event.preventDefault();
    if (CONFIG.booking) location.href = CONFIG.booking;
    else showToast("Онлайн-бронирование скоро появится");
  });
}

/* ---------- 7. Эффекты ---------- */

// Заголовки .sp разбиваются на буквы для поочерёдного появления
function splitHeadlines() {
  $$(".sp").forEach((headline) => {
    let index = 0;
    const walk = (node) =>
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          // текст
          const fragment = document.createDocumentFragment();
          [...child.textContent].forEach((char) => {
            const span = document.createElement("span");
            span.className = "ch";
            span.style.setProperty("--i", index++);
            span.textContent = char === " " ? "\u00a0" : char;
            fragment.append(span);
          });
          child.replaceWith(fragment);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child);
        }
      });
    walk(headline);
  });
}

// Появление блоков (.rv) и россыпи фото (.scatter) при прокрутке
function initReveal() {
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        observer.unobserve(el);

        if (el.classList.contains("scatter")) {
          // Наблюдаем за контейнером, а не за фото: фото стоят за краем экрана
          $$(".pic", el).forEach((pic) => pic.classList.add("in"));
          return;
        }
        el.classList.add("in");
        $$("[data-n]", el).forEach(countUp);
        const delay =
          parseFloat(getComputedStyle(el).getPropertyValue("--d")) || 0;
        setTimeout(
          () => el.classList.add("done"),
          REVEAL_DURATION_MS + delay * 1000,
        );
      }),
    { threshold: 0.1 },
  );

  $$(".rv, .scatter").forEach((el) => observer.observe(el));
}

// Мышь: свечение за курсором, подсветка и наклон карточек, «магнитные» кнопки
function initPointerEffects() {
  addEventListener("pointermove", (event) => {
    if (REDUCED_MOTION.matches || event.pointerType !== "mouse") return;
    state.mouseX = event.clientX / innerWidth - 0.5;
    state.mouseY = event.clientY / innerHeight - 0.5;
    $("#cg").style.transform =
      `translate(${event.clientX}px, ${event.clientY}px)`;

    const card = event.target.closest && event.target.closest(".gl");
    if (card) {
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      card.style.setProperty("--mx", x * 100 + "%");
      card.style.setProperty("--my", y * 100 + "%");
      if (card.dataset.tilt !== undefined) {
        card.style.setProperty("--rx", (0.5 - y) * 10 + "deg");
        card.style.setProperty("--ry", (x - 0.5) * 12 + "deg");
      }
    }

    $$("[data-m]").forEach((button) => {
      // кнопки слегка тянутся к курсору
      const box = button.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const limit = COMPACT_EFFECTS.matches ? 4 : 10;
      const pull = (offset) => Math.max(-limit, Math.min(limit, offset));
      button.style.transform =
        Math.hypot(dx, dy) < 90
          ? `translate(${pull(dx * 0.25)}px, ${pull(dy * 0.35)}px)`
          : "";
    });
  });

  $$("[data-tilt]").forEach((card) =>
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    }),
  );
}

// Прокрутка: полоса прогресса сверху и параллакс элементов с data-p
function onScroll() {
  if (REDUCED_MOTION.matches) return;
  state.scrollY = scrollY;
  const maxScroll = Math.max(
    1,
    document.documentElement.scrollHeight - innerHeight,
  );
  $("#pg").style.transform = `scaleX(${scrollY / maxScroll})`;
  if (COMPACT_EFFECTS.matches) return;
  $$("[data-p]").forEach((el) => {
    const box = el.getBoundingClientRect();
    if (box.bottom < -200 || box.top > innerHeight + 200) return;
    el.style.translate = `0 ${(box.top + box.height / 2 - innerHeight / 2) * -el.dataset.p}px`;
  });
}

/* ---------- 8. Звёздное небо (canvas на заднем фоне) ---------- */

function initSky() {
  const canvas = $("#sky");
  let ctx;
  let frameId = null;
  let timerId = null;
  let width,
    height,
    stars = [],
    shootingStar = null;

  function resize() {
    width = canvas.width = innerWidth;
    height = canvas.height = innerHeight;
    const limit = COMPACT_EFFECTS.matches ? COMPACT_STAR_LIMIT : 240;
    stars = Array.from({ length: Math.min(limit, width / 5) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      depth: Math.random() * 0.9 + 0.1, // чем больше, тем «ближе» звезда
      phase: Math.random() * 6,
    }));
  }

  function drawShootingStar() {
    if (!shootingStar && Math.random() < 0.004) {
      shootingStar = {
        x: Math.random() * width,
        y: Math.random() * height * 0.5,
        life: 0,
      };
    }
    if (!shootingStar) return;
    shootingStar.x += 14;
    shootingStar.y += 6;
    shootingStar.life++;
    const { x, y } = shootingStar;
    const trail = ctx.createLinearGradient(x - 120, y - 52, x, y);
    trail.addColorStop(0, "transparent");
    trail.addColorStop(1, "#fff");
    ctx.globalAlpha = 1;
    ctx.strokeStyle = trail;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 120, y - 52);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (shootingStar.life > 70) shootingStar = null;
  }

  function drawSky(time) {
    const full = !COMPACT_EFFECTS.matches && !REDUCED_MOTION.matches;
    const offset = full ? state.scrollY * 0.25 : 0;
    ctx.clearRect(0, 0, width, height);
    for (const star of stars) {
      const y = (((star.y - offset * star.depth) % height) + height) % height;
      const x = star.x - (full ? state.mouseX * star.depth * 40 : 0);
      ctx.globalAlpha = REDUCED_MOTION.matches
        ? 0.7
        : 0.35 + 0.65 * Math.abs(Math.sin(time / 900 + star.phase));
      ctx.fillStyle = star.depth > 0.75 ? "#c9a7ff" : "#fff";
      ctx.fillRect(x, y, star.depth * 2.2, star.depth * 2.2);
    }
    if (full) drawShootingStar();
  }

  function schedule() {
    if (document.hidden || REDUCED_MOTION.matches) return;
    if (COMPACT_EFFECTS.matches) {
      timerId = setTimeout(() => {
        timerId = null;
        frameId = requestAnimationFrame(frame);
      }, COMPACT_SKY_FRAME_MS);
    } else frameId = requestAnimationFrame(frame);
  }

  function frame(time) {
    frameId = null;
    drawSky(time);
    schedule();
  }

  function syncSky() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    if (timerId !== null) clearTimeout(timerId);
    frameId = timerId = null;
    if (document.hidden) return;
    ctx ??= canvas.getContext("2d");
    if (!ctx) return;
    resize();
    drawSky(performance.now());
    schedule();
  }

  addEventListener("resize", syncSky);
  document.addEventListener("visibilitychange", syncSky);
  COMPACT_EFFECTS.addEventListener("change", syncSky);
  REDUCED_MOTION.addEventListener("change", syncSky);
  syncSky();
}

/* ---------- 9. Навигация ---------- */

// Адрес «…/#menu» открывает страницу меню, остальные #якоря — главную страницу
function route() {
  const isMenu = location.hash === "#menu";
  document.body.classList.toggle("mv", isMenu);
  $$(".hi nav a").forEach((link) => {
    if (link.hash === location.hash)
      link.setAttribute("aria-current", isMenu ? "page" : "location");
    else link.removeAttribute("aria-current");
  });
  if (isMenu) {
    scrollTo({ top: 0, behavior: "instant" });
    return;
  }

  const target =
    location.hash.length > 1 && document.getElementById(location.hash.slice(1));
  if (target) target.scrollIntoView();
  else scrollTo(0, 0);
}

/* ---------- 10. Запуск ---------- */

applyImages();
initPriceTabs();
renderPrices("weekday");
renderDishGrid();
renderMenu();
renderChips();
initMenuControls();
renderContacts();
initBooking();

if (REDUCED_MOTION.matches) {
  $$("[data-n]").forEach(countUp);
  $$(".rv, .pic").forEach((element) => element.classList.add("in"));
} else {
  splitHeadlines();
  initReveal();
  initPointerEffects();
}
initSky();
addEventListener("scroll", onScroll, { passive: true });
onScroll();
addEventListener("hashchange", route);
route();
