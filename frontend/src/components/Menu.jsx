import { useEffect, useRef, useState } from 'react';
import { imageSource } from '../api/client';
import { MAX_QUANTITY_PER_VARIANT, money } from '../config/orders';
import { hasOptions, unavailableLabel } from '../config/menu';
import presentation from '../config/presentation.json';

function ItemAction({ item, value = 0, onChange, onDetails, enabled, busy }) {
  const unavailable = unavailableLabel(item);
  if (unavailable) return <span className="stop-label">{unavailable}</span>;
  if (!enabled) return null;
  if (hasOptions(item)) {
    return (
      <button
        type="button"
        className="quiet-button choose-item"
        data-m
        disabled={busy}
        onClick={() => onDetails(item)}
        aria-label={`Настроить: ${item.name}`}
      >
        Выбрать
      </button>
    );
  }
  return (
    <div className="quantity">
      {value > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange(item, -1)}
          aria-label={`Уменьшить: ${item.name}`}
        >
          −
        </button>
      )}
      {value > 0 && <output>{value}</output>}
      <button
        type="button"
        disabled={busy || value >= MAX_QUANTITY_PER_VARIANT}
        onClick={() => onChange(item, 1)}
        aria-label={`Добавить: ${item.name}`}
      >
        +
      </button>
    </div>
  );
}

function Scatter({ items, seed, onDetails }) {
  if (!items.length) return null;
  const height = Math.ceil(items.length / 2) * 0.4 + 0.1;
  return (
    <div className="scatter" data-enter style={{ aspectRatio: 1 / height }}>
      {items.map((item, index) => {
        const alone = items.length % 2 === 1 && index === items.length - 1;
        const rotation = ((index * 7 + seed * 3) % 18) - 9;
        return (
          <figure
            key={item.id}
            className={`pic ${unavailableLabel(item) ? 'stopped-photo' : ''}`}
            style={{
              left: `${alone ? 27 : (index % 2) * 52}%`,
              top: `${((Math.floor(index / 2) * 0.4) / height) * 100}%`,
              width: '46%',
              '--r': `${rotation}deg`,
              '--fx': `${index % 2 === 0 ? -65 : 65}vw`,
              '--fy': '35px',
              '--d': `${index * 0.08}s`,
            }}
          >
            <button
              className="photo-open"
              onClick={() => onDetails(item)}
              aria-label={`Подробнее: ${item.name}`}
            >
              <img src={imageSource(item.image_url)} alt={item.name} loading="lazy" />
              <figcaption>
                {item.name} · {money(item.price)}
                {unavailableLabel(item) && ` · ${unavailableLabel(item)}`}
              </figcaption>
            </button>
          </figure>
        );
      })}
    </div>
  );
}

export function Menu({ items, cart, onChange, onDetails, enabled, busy }) {
  const catalog = useRef(null);
  const [search, setSearch] = useState('');
  const [onlyAllDay, setOnlyAllDay] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState(null);
  const onlyAvailable =
    availabilityFilter ?? items.some((item) => item.unavailable_reason === 'kitchen_closed');
  const query = search.trim().toLocaleLowerCase('ru');
  const visible = items.filter(
    (item) =>
      (!onlyAllDay || item.all_day) &&
      (!onlyAvailable || !unavailableLabel(item)) &&
      `${item.name} ${item.description || ''} ${item.category}`
        .toLocaleLowerCase('ru')
        .includes(query),
  );
  const categories = [...new Set(visible.map((item) => item.category))].sort((a, b) => {
    const rank = (name) =>
      presentation.categories.includes(name) ? presentation.categories.indexOf(name) : 999;
    return rank(a) - rank(b);
  });
  const featured = presentation.featuredImages.flatMap((path) => {
    const item = visible.find((row) => row.image_url?.replace(/^\//, '') === path);
    return item ? [item] : [];
  });
  const revision = visible
    .map((item) => `${item.id}:${item.image_url}:${item.category}:${unavailableLabel(item)}`)
    .join('|');

  useEffect(() => {
    const targets = catalog.current.querySelectorAll(
      '[data-enter]:not(.in), .scatter:has(.pic:not(.in))',
    );
    function reveal(element) {
      element.classList.add('in');
      element.querySelectorAll('.pic').forEach((photo) => photo.classList.add('in'));
    }
    if (
      !('IntersectionObserver' in window) ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      targets.forEach(reveal);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          if (!isIntersecting) continue;
          reveal(target);
          observer.unobserve(target);
        }
      },
      { threshold: 0.08 },
    );
    targets.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [revision, query]);

  return (
    <>
      <div className="bar">
        <div className="w">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти блюдо или напиток…"
            aria-label="Поиск по меню"
          />
          <div className="chs">
            <button
              data-m
              className={onlyAvailable ? 'on' : ''}
              aria-pressed={onlyAvailable}
              onClick={() => setAvailabilityFilter(!onlyAvailable)}
            >
              Можно заказать
            </button>
            <button
              data-m
              className={onlyAllDay ? 'on' : ''}
              aria-pressed={onlyAllDay}
              onClick={() => setOnlyAllDay(!onlyAllDay)}
            >
              Круглосуточно
            </button>
            {categories.map((category, index) => (
              <button
                key={category}
                data-m
                onClick={() =>
                  document
                    .getElementById(`category-${index}`)
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>
      {!query && featured.length > 0 && (
        <div className="w order-featured">
          <p className="eb">Фирменные блюда</p>
          <div className="sg">
            {featured.map((item) => (
              <article
                key={item.id}
                className={`sc gl ${unavailableLabel(item) ? 'stopped-photo' : ''}`}
              >
                <button
                  className="photo-open"
                  onClick={() => onDetails(item)}
                  aria-label={`Подробнее: ${item.name}`}
                >
                  <img src={imageSource(item.image_url)} alt={item.name} loading="lazy" />
                </button>
                <div className="featured-caption">
                  <h4>{item.name}</h4>
                  <p>{item.description}</p>
                  <section className="featured-price">
                    <b>{money(item.price)}</b>
                    <ItemAction
                      item={item}
                      value={cart[item.id]?.quantity}
                      onChange={onChange}
                      onDetails={onDetails}
                      enabled={enabled}
                      busy={busy}
                    />
                  </section>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      <div className={`w ${query ? 'searching' : ''}`} ref={catalog}>
        <div className="mg">
          {categories.map((category, index) => {
            const group = visible.filter((item) => item.category === category);
            if (!group.length) return null;
            const allDayCategory = group.every((item) => item.all_day);
            return (
              <div className="mc" key={category} id={`category-${index}`}>
                <section className="ms gl">
                  <div className="mh2">
                    <span className="no">{String(index + 1).padStart(2, '0')}</span>
                    <h3>{category}</h3>
                    {allDayCategory && <em>24/7</em>}
                  </div>
                  <ul>
                    {group.map((item, itemIndex) => (
                      <li
                        key={item.id}
                        data-enter
                        style={{ '--entry-delay': `${(itemIndex % 5) * 35}ms` }}
                        className={`menu-line ${unavailableLabel(item) ? 'stopped-line' : ''}`}
                      >
                        <div className="menu-line-title">
                          <button
                            type="button"
                            className="name-button menu-item-name"
                            onClick={() => onDetails(item)}
                          >
                            {item.image_url && (
                              <img
                                className="menu-thumb"
                                src={imageSource(item.image_url)}
                                alt=""
                                loading="lazy"
                              />
                            )}
                            <span className="menu-name-copy">
                              {item.name}
                              {item.description && <small>{item.description}</small>}
                              {item.all_day && !allDayCategory && <small>24/7</small>}
                            </span>
                          </button>
                        </div>
                        <s />
                        <span className="line-price">{money(item.price)}</span>
                        <div className="menu-line-action">
                          <ItemAction
                            item={item}
                            value={cart[item.id]?.quantity}
                            onChange={onChange}
                            onDetails={onDetails}
                            enabled={enabled}
                            busy={busy}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
                <Scatter
                  items={group.filter((item) => item.image_url)}
                  seed={index}
                  onDetails={onDetails}
                />
              </div>
            );
          })}
        </div>
        {!visible.length && (
          <p className="empty-state">Ничего не найдено. Попробуйте другой запрос.</p>
        )}
      </div>
    </>
  );
}
