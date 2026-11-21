import { useEffect, useId, useRef, useState } from 'react';
import { imageSource } from '../api/client';
import { MAX_QUANTITY_PER_VARIANT, money } from '../config/orders';
import { hasOptions, unavailableLabel } from '../config/menu';
import presentation from '../config/presentation.json';
import { ItemOptionsForm } from './ItemChoices';

function ItemAction({
  item,
  value,
  onChange,
  onChoose,
  expanded,
  optionsId,
  enabled,
  busy,
  sectionClosed,
}) {
  const unavailable = unavailableLabel(item);
  if (unavailable) return sectionClosed ? null : <span className="menu-status">{unavailable}</span>;
  if (!enabled) return null;
  if (hasOptions(item)) {
    return (
      <button
        type="button"
        className="order-button order-button-secondary choose-item menu-action-cut"
        disabled={busy}
        onClick={onChoose}
        aria-expanded={expanded}
        aria-controls={optionsId}
        aria-label={`Настроить: ${item.name}`}
      >
        Выбрать
      </button>
    );
  }
  return (
    <div className={`quantity menu-quantity${value > 0 ? ' has-value' : ''}`}>
      {value > 0 && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange(item, -1)}
            aria-label={`Уменьшить: ${item.name}`}
            className="quantity-minus"
          />
          <output aria-label="В корзине">
            <span className="menu-cart-count" key={value}>
              {value}
            </span>
          </output>
        </>
      )}
      <button
        type="button"
        className="quantity-plus menu-action-cut"
        disabled={busy || value >= MAX_QUANTITY_PER_VARIANT}
        onClick={() => onChange(item, 1)}
        aria-label={`Добавить: ${item.name}`}
      >
        <span className="menu-add-icon" aria-hidden="true" />
      </button>
    </div>
  );
}

function MenuRow({ item, value = 0, onChange, onDetails, onSave, enabled, busy, sectionClosed }) {
  const unavailable = unavailableLabel(item);
  const photo = item.image_url;
  const hit = Boolean(item.is_hit && photo);
  const [expanded, setExpanded] = useState(false);
  const optionsId = useId();
  return (
    <li className="order-menu-row" data-hit={hit || undefined}>
      <div className="order-menu-name">
        <b>
          {photo ? (
            <button
              type="button"
              className="name-button"
              aria-label={[item.name, hit && 'Хит', unavailable].filter(Boolean).join(' · ')}
              onClick={() => onDetails(item)}
            >
              {item.name}
            </button>
          ) : (
            item.name
          )}
        </b>
        {item.description && <small>{item.description}</small>}
      </div>
      <span className="order-menu-leader" aria-hidden="true">
        {hit && <span className="order-menu-hit-badge">Хит</span>}
      </span>
      <strong>{money(item.price)}</strong>
      <div className="order-menu-action">
        <ItemAction
          {...{ item, value, onChange, enabled, busy, sectionClosed }}
          onChoose={photo ? () => onDetails(item) : () => setExpanded(!expanded)}
          expanded={photo ? undefined : expanded}
          optionsId={photo ? undefined : optionsId}
        />
      </div>
      {!photo && hasOptions(item) && (
        <div id={optionsId} className="inline-options" hidden={!expanded || Boolean(unavailable)}>
          {expanded && !unavailable && (
            <ItemOptionsForm
              key={JSON.stringify([item.removable_ingredients, item.temperature_options])}
              item={item}
              enabled={enabled && !busy}
              onClose={() => setExpanded(false)}
              onSave={onSave}
            />
          )}
        </div>
      )}
    </li>
  );
}

function HitPhotos({ hits, onDetails }) {
  return (
    <div className="order-hit-photos" role="group" aria-label="Хиты раздела">
      {hits.map((item) => (
        <button
          key={item.id}
          type="button"
          className="order-hit-photo"
          onClick={() => onDetails(item)}
          aria-label={`Подробнее: ${item.name} · Хит`}
        >
          <img src={imageSource(item.image_url)} alt="" loading="lazy" />
          <span className="order-hit-badge">✦ Хит</span>
          <span className="order-hit-caption">
            {item.name} · {money(item.price)}
          </span>
        </button>
      ))}
    </div>
  );
}

function categoryRank(name) {
  const rank = presentation.categories.indexOf(name);
  return rank === -1 ? presentation.categories.length : rank;
}

function scrollBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

function toolbarOffset(toolbar) {
  const style = getComputedStyle(toolbar);
  return style.position === 'sticky'
    ? toolbar.offsetHeight + parseFloat(style.top)
    : document.querySelector('.order-header').getBoundingClientRect().bottom;
}

export function Menu({ items, cart, onChange, onDetails, onSave, enabled, busy, ready }) {
  const toolbar = useRef(null);
  const anchor = useRef(null);
  const strip = useRef(null);
  const catalog = useRef(null);
  const [search, setSearch] = useState('');
  const [onlyAllDay, setOnlyAllDay] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(true);

  const [currentCategory, setCurrentCategory] = useState(null);

  const query = search.trim().toLocaleLowerCase('ru');
  const groups = new Map();
  for (const item of items) {
    if (onlyAllDay && !item.all_day) continue;
    if (onlyAvailable && unavailableLabel(item)) continue;
    const keywords = `${item.name} ${item.description || ''} ${item.category}`.toLocaleLowerCase(
      'ru',
    );
    if (!keywords.includes(query)) continue;
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  const allCategories = [...new Set(items.map((item) => item.category))].sort(
    (a, b) => categoryRank(a) - categoryRank(b),
  );
  const categories = allCategories.filter((category) => groups.has(category));
  const active = categories.includes(currentCategory) ? currentCategory : categories[0];
  const categoryKey = JSON.stringify(categories);
  const hitKey = [...groups.values()]
    .flatMap((group) =>
      group.filter((item) => item.is_hit && item.image_url).map((item) => item.id),
    )
    .join(',');

  useEffect(() => {
    const controls = toolbar.current;
    const sections = [...catalog.current.querySelectorAll('[data-category]')];
    let frame;
    function update() {
      frame = undefined;
      if (!sections.length || !controls.offsetHeight) return;
      const offset = toolbarOffset(controls) + 26;
      const atToolbar = sections.filter((section) => {
        const bounds = section.getBoundingClientRect();
        return bounds.top <= offset && bounds.bottom > offset;
      });
      if (!atToolbar.length) return;
      setCurrentCategory((previous) =>
        atToolbar.some((section) => section.dataset.category === previous)
          ? previous
          : atToolbar[0].dataset.category,
      );
    }
    function schedule() {
      frame ??= requestAnimationFrame(update);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(controls);
    observer.observe(catalog.current);
    window.addEventListener('scroll', schedule, { passive: true });
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
    };
  }, [categoryKey]);

  useEffect(() => {
    const list = strip.current;
    const selected = list.querySelector('[aria-current]');
    if (!selected || !list.offsetWidth || list.scrollWidth <= list.clientWidth) return;
    const { left, right } = selected.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    if (left < bounds.left + 10 || right > bounds.right - 10) {
      list.scrollBy({ left: left - bounds.left - (list.clientWidth - selected.offsetWidth) / 2 });
    }
  }, [active]);

  useEffect(() => {
    if (!('IntersectionObserver' in window) || scrollBehavior() === 'instant') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { isIntersecting, target } of entries) {
          if (target.hasAttribute('data-hit')) {
            target.classList.toggle('order-hit-in-view', isIntersecting);
            continue;
          }
          if (!isIntersecting) continue;
          target.classList.add('menu-category-arrived');
          observer.unobserve(target);
        }
      },
      { threshold: 0 },
    );
    catalog.current
      .querySelectorAll('[data-category], [data-hit]')
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [categoryKey, hitKey]);

  function jumpTo(index) {
    const target = document.getElementById(`order-category-${index}`);
    if (!target) return;
    setCurrentCategory(target.dataset.category);
    window.scrollTo({
      top:
        target.getBoundingClientRect().top + window.scrollY - toolbarOffset(toolbar.current) - 16,
      behavior: scrollBehavior(),
    });
  }

  function resetResultsPosition() {
    const top = anchor.current.getBoundingClientRect().top;
    const headerBottom = document.querySelector('.order-header').getBoundingClientRect().bottom;
    if (top < headerBottom) {
      window.scrollTo({ top: window.scrollY + top - headerBottom, behavior: 'instant' });
    }
  }

  return (
    <>
      <div id="order-menu" ref={anchor} tabIndex={-1} />
      <div className="bar order-toolbar" ref={toolbar}>
        <div className="w">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetResultsPosition();
            }}
            placeholder="Найти блюдо…"
            aria-label="Поиск по меню"
          />
          <nav className="chs order-menu-chips" aria-label="Разделы и фильтры меню" ref={strip}>
            <button
              type="button"
              className={onlyAllDay ? 'on' : undefined}
              aria-pressed={onlyAllDay}
              onClick={() => {
                setOnlyAllDay(!onlyAllDay);
                resetResultsPosition();
              }}
            >
              Круглосуточно
            </button>
            {categories.map((category, index) => (
              <button
                type="button"
                key={category}
                aria-current={active === category ? 'location' : undefined}
                onClick={() => jumpTo(index)}
              >
                {category}
              </button>
            ))}
            <button
              type="button"
              className={onlyAvailable ? 'on' : undefined}
              aria-pressed={onlyAvailable}
              onClick={() => {
                setOnlyAvailable(!onlyAvailable);
                resetResultsPosition();
              }}
            >
              Можно заказать
            </button>
          </nav>
        </div>
      </div>
      <div className="w order-catalog" ref={catalog}>
        <div className="mg order-menu-columns" hidden={!categories.length}>
          {categories.map((category, index) => {
            const group = groups.get(category);
            const hits = group.filter((item) => item.is_hit && item.image_url);
            const sectionClosed = group.every(
              (item) => item.unavailable_reason === 'kitchen_closed',
            );
            const number = String(allCategories.indexOf(category) + 1).padStart(2, '0');
            return (
              <section
                className="mc order-menu-section"
                data-category={category}
                key={category}
                id={`order-category-${index}`}
                aria-labelledby={`order-category-heading-${index}`}
              >
                <div className="ms gl order-menu-panel">
                  <header className="mh2">
                    <span className="no" aria-hidden="true">
                      {number}
                    </span>
                    <h2 id={`order-category-heading-${index}`}>{category}</h2>
                    {group.every((item) => item.all_day) && <em>24/7</em>}
                    {sectionClosed && <span className="order-section-closed">Кухня закрыта</span>}
                  </header>
                  <ul>
                    {group.map((item) => (
                      <MenuRow
                        key={item.id}
                        item={item}
                        value={cart[item.id]?.quantity}
                        {...{ onChange, onDetails, onSave, enabled, busy, sectionClosed }}
                      />
                    ))}
                  </ul>
                </div>
                {hits.length > 0 && <HitPhotos hits={hits} onDetails={onDetails} />}
              </section>
            );
          })}
        </div>
        {ready && !categories.length && (
          <div className="order-panel order-empty">
            <h2>Ничего не найдено</h2>
            <p>Измените запрос или сбросьте фильтры.</p>
            <button
              type="button"
              className="order-button order-button-secondary"
              onClick={() => {
                setSearch('');
                setOnlyAllDay(false);
                setOnlyAvailable(false);
                resetResultsPosition();
              }}
            >
              Сбросить поиск и фильтры
            </button>
          </div>
        )}
      </div>
    </>
  );
}
