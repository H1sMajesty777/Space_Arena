import { useEffect, useRef, useState } from 'react';
import { imageSource } from '../api/client';
import { MAX_QUANTITY_PER_VARIANT, money } from '../config/orders';
import { hasOptions, unavailableLabel } from '../config/menu';
import presentation from '../config/presentation.json';

function ItemAction({ item, value, onChange, onDetails, enabled, busy }) {
  const unavailable = unavailableLabel(item);
  if (unavailable) return <span className="menu-status">{unavailable}</span>;
  if (!enabled) return null;
  if (hasOptions(item)) {
    return (
      <button
        type="button"
        className="order-button order-button-secondary choose-item"
        disabled={busy}
        onClick={() => onDetails(item)}
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
          <output aria-label="В корзине">{value}</output>
        </>
      )}
      <button
        type="button"
        className="quantity-plus"
        disabled={busy || value >= MAX_QUANTITY_PER_VARIANT}
        onClick={() => onChange(item, 1)}
        aria-label={`Добавить: ${item.name}`}
      />
    </div>
  );
}

function MenuCard({ item, featured, value = 0, onChange, onDetails, enabled, busy }) {
  const unavailable = unavailableLabel(item);
  const photoStatus = featured && item.image_url && unavailable;
  return (
    <article
      data-unavailable={Boolean(unavailable) || undefined}
      className={`menu-card${featured ? ' menu-card-featured' : ''}`}
    >
      {item.image_url && (
        <button
          type="button"
          className="menu-card-photo"
          onClick={() => onDetails(item)}
          aria-label={`Подробнее: ${item.name}`}
          tabIndex={-1}
        >
          <img src={imageSource(item.image_url)} alt="" loading="lazy" />
          {photoStatus && <span className="menu-photo-status">{unavailable}</span>}
        </button>
      )}
      <div className="menu-card-body">
        <h3>
          <button
            type="button"
            className="name-button"
            aria-label={unavailable ? `${item.name} · ${unavailable}` : undefined}
            onClick={() => onDetails(item)}
          >
            {item.name}
          </button>
        </h3>
        {item.description && <p>{item.description}</p>}
        <div className="menu-card-bottom">
          <strong>{money(item.price)}</strong>
          {!photoStatus && <ItemAction {...{ item, value, onChange, onDetails, enabled, busy }} />}
        </div>
      </div>
    </article>
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

export function Menu({ items, cart, onChange, onDetails, enabled, busy, ready }) {
  const toolbar = useRef(null);
  const anchor = useRef(null);
  const strip = useRef(null);
  const catalog = useRef(null);
  const [search, setSearch] = useState('');
  const [onlyAllDay, setOnlyAllDay] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(true);

  const [currentCategory, setCurrentCategory] = useState(null);
  const [canScrollCategories, setCanScrollCategories] = useState(false);

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
  const categories = [...groups.keys()].sort((a, b) => categoryRank(a) - categoryRank(b));
  const active = categories.includes(currentCategory) ? currentCategory : categories[0];
  const categoryKey = JSON.stringify(categories);
  const featured =
    query || onlyAllDay
      ? []
      : presentation.featuredImages
          .flatMap((path) => {
            const item = items.find((row) => row.image_url?.replace(/^\//, '') === path);
            return item && groups.get(item.category)?.includes(item) ? [item] : [];
          })
          .sort(
            (a, b) => Number(Boolean(unavailableLabel(a))) - Number(Boolean(unavailableLabel(b))),
          )
          .slice(0, 4);

  useEffect(() => {
    const controls = toolbar.current;
    const sections = [...catalog.current.querySelectorAll('[data-category]')];
    let frame;
    function update() {
      frame = undefined;
      if (!sections.length || !controls.offsetHeight) return;
      const offset = toolbarOffset(controls) + 26;
      const end = document.documentElement.scrollHeight - window.innerHeight;
      const current =
        end > 0 && window.scrollY >= end - 1
          ? sections.at(-1)
          : sections.findLast((section) => section.getBoundingClientRect().top <= offset);
      setCurrentCategory((current || sections[0]).dataset.category);
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
    const update = () => {
      if (list.offsetWidth) setCanScrollCategories(list.scrollWidth > list.clientWidth + 1);
    };
    const observer = new ResizeObserver(update);
    observer.observe(list);
    list.querySelectorAll('button').forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [categoryKey]);

  useEffect(() => {
    const list = strip.current;
    const selected = list.querySelector('[aria-current]');
    if (!selected || !list.offsetWidth) return;
    const { left, right } = selected.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    if (left < bounds.left || right > bounds.right) {
      list.scrollBy({ left: left - bounds.left - (list.clientWidth - selected.offsetWidth) / 2 });
    }
  }, [active]);

  useEffect(() => {
    if (!('IntersectionObserver' in window) || scrollBehavior() === 'instant') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { isIntersecting, target } of entries) {
          if (!isIntersecting) continue;
          target.classList.add('menu-category-arrived');
          observer.unobserve(target);
        }
      },
      { threshold: 0 },
    );
    catalog.current
      .querySelectorAll('[data-category]')
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [categoryKey]);

  function jumpTo(index) {
    const target = document.getElementById(`order-category-${index}`);
    if (!target) return;
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

  function card(item, isFeatured = false) {
    return (
      <MenuCard
        key={item.id}
        item={item}
        featured={isFeatured}
        value={cart[item.id]?.quantity}
        {...{ onChange, onDetails, enabled, busy }}
      />
    );
  }

  return (
    <>
      <div id="order-menu" ref={anchor} tabIndex={-1} />
      <div className="order-toolbar" ref={toolbar}>
        <div className="w">
          <div className="order-tools">
            <label className="order-search">
              <span className="search-icon" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetResultsPosition();
                }}
                placeholder="Найти блюдо или напиток"
                aria-label="Поиск по меню"
              />
            </label>
            <div className="menu-filters" aria-label="Фильтры меню">
              <button
                type="button"
                aria-pressed={onlyAvailable}
                onClick={() => {
                  setOnlyAvailable(!onlyAvailable);
                  resetResultsPosition();
                }}
              >
                Можно заказать
              </button>
              <button
                type="button"
                aria-pressed={onlyAllDay}
                onClick={() => {
                  setOnlyAllDay(!onlyAllDay);
                  resetResultsPosition();
                }}
              >
                Круглосуточно
              </button>
            </div>
          </div>
          <nav className="menu-category-nav" aria-label="Разделы меню" hidden={!categories.length}>
            <div className="menu-category-strip" ref={strip}>
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
            </div>
            <div className="menu-category-arrows" aria-hidden={!canScrollCategories || undefined}>
              <button
                type="button"
                aria-label="Предыдущие категории"
                disabled={!canScrollCategories}
                onClick={() => strip.current.scrollBy({ left: -320, behavior: scrollBehavior() })}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Следующие категории"
                disabled={!canScrollCategories}
                onClick={() => strip.current.scrollBy({ left: 320, behavior: scrollBehavior() })}
              >
                ›
              </button>
            </div>
          </nav>
        </div>
      </div>
      <div className="w order-catalog" ref={catalog}>
        {featured.length > 0 && (
          <section className="menu-featured" aria-labelledby="featured-heading">
            <h2 id="featured-heading">Фирменные блюда</h2>
            <div className="menu-featured-grid">{featured.map((item) => card(item, true))}</div>
          </section>
        )}
        {categories.map((category, index) => {
          const group = groups.get(category);
          return (
            <section
              className="menu-category"
              data-category={category}
              key={category}
              id={`order-category-${index}`}
              aria-labelledby={`order-category-heading-${index}`}
            >
              <div className="menu-category-heading">
                <h2 id={`order-category-heading-${index}`}>{category}</h2>
                {group.every((item) => item.all_day) && <span>24/7</span>}
              </div>
              <div className="menu-card-grid">{group.map((item) => card(item))}</div>
            </section>
          );
        })}
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
