import { useRef, useState } from 'react';
import { MenuBrand } from '../../components/SiteBrand';
import { PUBLIC_KITCHEN_HOURS } from '../../config/menu';
import { DISHES, MENU } from './content';
import { images } from './images';
import { HeadlineWord } from './AnimatedText';
import { REDUCED_MOTION } from './usePublicMotion';

const dishesById = new Map(DISHES.map((dish) => [dish.id, dish]));
const photoDirections = [
  [-80, 0],
  [80, 0],
  [0, -70],
  [0, 70],
  [-75, -55],
  [75, -55],
  [-75, 55],
  [75, 55],
];

function PhotoScatter({ photos, categoryIndex }) {
  if (!photos.length) return null;

  let seed = categoryIndex * 97 + 13;
  const random = (min, max) => {
    seed = (seed * 16807) % 2147483647;
    return min + (seed / 2147483647) * (max - min);
  };
  const rowHeight = 0.4;
  const height = Math.ceil(photos.length / 2) * rowHeight + 0.1;

  return (
    <div className="scatter" style={{ aspectRatio: (1 / height).toFixed(3) }}>
      {photos.map((id, index) => {
        const dish = dishesById.get(id);
        const alone = photos.length % 2 === 1 && index === photos.length - 1;
        const left = alone ? 27 : (index % 2) * 52 + random(-2, 2);
        const top = ((Math.floor(index / 2) * rowHeight + random(-0.02, 0.04)) / height) * 100;
        const rotation = random(-9, 9);
        const [x, y] = photoDirections[Math.floor(random(0, photoDirections.length))];

        return (
          <figure
            className="pic"
            key={id}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: '46%',
              '--r': `${rotation}deg`,
              '--fx': `${x}vw`,
              '--fy': `${y}vh`,
              '--d': `${(index * 0.12).toFixed(2)}s`,
            }}
          >
            <img src={images[id]} alt={dish.name} loading="lazy" />
            <figcaption>
              {dish.name} · {dish.price} ₽
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function FeaturedDishes() {
  const [expanded, setExpanded] = useState(false);

  function toggle(event) {
    setExpanded(!expanded);
    if (expanded) {
      const button = event.currentTarget;
      requestAnimationFrame(() => button.scrollIntoView({ block: 'nearest' }));
    }
  }

  return (
    <div className="w menu-featured">
      <p className="eb">Фирменные блюда</p>
      <div className="sg" id="sg">
        {DISHES.map((dish, index) => (
          <article
            key={dish.id}
            className="sc gl rv tl"
            data-tilt=""
            style={{ '--d': `${(index % 4) * 0.08}s` }}
          >
            <img src={images[dish.id]} alt={dish.name} loading="lazy" draggable={false} />
            <div>
              <h4>{dish.name}</h4>
              <p>{dish.note}</p>
              <b>{dish.price} ₽</b>
            </div>
          </article>
        ))}
      </div>
      <button
        className="btn o public-featured-toggle"
        type="button"
        aria-controls="sg"
        aria-expanded={expanded}
        onClick={toggle}
      >
        {expanded ? 'Свернуть подборку' : 'Все фирменные блюда'}
      </button>
    </div>
  );
}

export function PublicMenu({ hidden, header }) {
  const [search, setSearch] = useState('');
  const [onlyAllDay, setOnlyAllDay] = useState(false);
  const bar = useRef(null);
  const query = search.trim().toLowerCase();
  const categories = MENU.map((category, index) => {
    const items = category.items.map(([name, note, price]) => ({
      name,
      note,
      price,
      visible:
        (!onlyAllDay || category.allDay) &&
        `${name}${note} ${price} ₽`.toLowerCase().includes(query),
    }));
    return { ...category, id: `m${index}`, items, visible: items.some((item) => item.visible) };
  });

  function scrollToCategory(id) {
    const block = document.getElementById(id);
    const safeTop = parseFloat(getComputedStyle(header.current).top) || 0;
    const stickyBar =
      getComputedStyle(bar.current).position === 'sticky' ? bar.current.offsetHeight : 0;
    const offset = header.current.offsetHeight + safeTop + stickyBar + 12;
    window.scrollTo({
      top: window.scrollY + block.getBoundingClientRect().top - offset,
      behavior: matchMedia(REDUCED_MOTION).matches ? 'instant' : 'smooth',
    });
  }

  return (
    <main id="menuv" className={query ? 'searching' : undefined} hidden={hidden}>
      <section className="mh w">
        <MenuBrand src={images.logo} />
        <h1 className="sp gr" aria-label="Меню">
          <HeadlineWord text="Меню" />
        </h1>
        <p className="by">BY GULIANI</p>
        <div className="tg">
          <span>Кухня {PUBLIC_KITCHEN_HOURS}</span>
          <span>Позиции с отметкой 24/7 доступны круглосуточно</span>
        </div>
        <img
          className="fd a"
          src={images.hachapuriImeretian}
          alt=""
          loading="lazy"
          data-p=".12"
          draggable={false}
        />
        <img
          className="fd b"
          src={images.plov}
          alt=""
          loading="lazy"
          data-p="-.1"
          draggable={false}
        />
        <img
          className="fd c"
          src={images.caesar}
          alt=""
          loading="lazy"
          data-p=".08"
          draggable={false}
        />
      </section>

      <div className="bar" ref={bar}>
        <div className="w">
          <input
            id="q"
            type="search"
            placeholder="Найти блюдо…"
            aria-label="Поиск по меню"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="chs" id="chs">
            <button
              type="button"
              className={onlyAllDay ? 'on' : undefined}
              aria-pressed={onlyAllDay}
              onClick={() => setOnlyAllDay(!onlyAllDay)}
            >
              Круглосуточно
            </button>
            {categories.map(({ id, title, visible }) => (
              <button type="button" key={id} hidden={!visible} onClick={() => scrollToCategory(id)}>
                {title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <FeaturedDishes />
      <div className="w">
        <div className="mg" id="mg">
          {categories.map(({ id, title, visible, allDay, items, photos }, index) => (
            <div className="mc" id={id} key={id} hidden={!visible}>
              <section className="ms gl rv" data-g="" style={{ '--d': `${(index % 2) * 0.1}s` }}>
                <div className="mh2">
                  <span className="no">{String(index + 1).padStart(2, '0')}</span>
                  <h3>{title}</h3>
                  {allDay && <em>24/7</em>}
                </div>
                <ul>
                  {items.map(({ name, note, price, visible }) => (
                    <li key={name} hidden={!visible}>
                      <div>
                        <b>{name}</b>
                        {note && <small>{note}</small>}
                      </div>
                      <s />
                      <span>{price} ₽</span>
                    </li>
                  ))}
                </ul>
              </section>
              <PhotoScatter photos={photos} categoryIndex={index} />
            </div>
          ))}
        </div>
        <p
          className="no2"
          id="no"
          role="status"
          hidden={categories.some((category) => category.visible)}
        >
          Ничего не найдено
        </p>
      </div>
    </main>
  );
}
