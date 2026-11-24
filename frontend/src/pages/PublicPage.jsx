import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Sky } from '../components/Sky';
import { contacts } from '../features/public-site/contacts';
import { Home } from '../features/public-site/Home';
import { images } from '../features/public-site/images';
import { PublicMenu } from '../features/public-site/PublicMenu';
import { usePublicMotion } from '../features/public-site/usePublicMotion';

const links = [
  { href: '#zones', header: 'Зоны', footer: 'Игровые зоны' },
  { href: '#prices', header: 'Цены', footer: 'Тарифы' },
  { href: '#menu', header: 'Меню', footer: 'Меню' },
  { href: '#contacts', header: 'Контакты', footer: 'Контакты' },
];

const phone = `tel:${contacts.phone.replace(/[^+\d]/g, '')}`;
const telegram = contacts.telegram.startsWith('@')
  ? `https://t.me/${contacts.telegram.slice(1)}`
  : contacts.telegram;

function subscribeToHash(onChange) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const readHash = () => window.location.hash;

function Footer({ booking }) {
  return (
    <footer className="footer">
      <div className="w ft-grid">
        <div className="ft-brand">
          <a className="ft-logo" href="#home">
            <img src={images.logo} alt="SPACE ARENA" draggable={false} />
          </a>
          <p>Компьютерный клуб в Москве</p>
          <a className="ft-book" {...booking}>
            Забронировать <span aria-hidden="true">↗</span>
          </a>
        </div>

        <nav aria-labelledby="ft-nav-title">
          <h2 className="ft-heading" id="ft-nav-title">
            Разделы сайта
          </h2>
          <ul className="ft-links">
            {links.map(({ href, footer }) => (
              <li key={href}>
                <a href={href}>{footer}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="ft-heading">Связаться с клубом</h2>
          <address className="ft-contact">
            <a className="ft-phone" href={phone}>
              {contacts.phone}
            </a>
            <a className="ft-telegram" href={telegram} target="_blank" rel="noopener">
              Telegram <span aria-hidden="true">↗</span>
            </a>
            <p className="ft-address">{contacts.address}</p>
            <p className="ft-hours">{contacts.hours}</p>
          </address>
        </div>
      </div>
      <div className="ft-bottom">
        <div className="w ft-meta">
          <span>© 2026 SPACE ARENA</span>
          <span>Информация на сайте не является публичной офертой.</span>
        </div>
      </div>
    </footer>
  );
}

export function PublicPage() {
  const hash = useSyncExternalStore(subscribeToHash, readHash);
  const showMenu = hash === '#menu';
  const root = useRef(null);
  const header = useRef(null);
  const [bookingNotice, setBookingNotice] = useState(0);
  usePublicMotion(root);

  useLayoutEffect(() => {
    const element = header.current;
    const page = document.documentElement;
    const setHeaderHeight = () => {
      page.style.setProperty('--public-header-height', `${element.offsetHeight}px`);
    };
    const observer = new ResizeObserver(setHeaderHeight);
    observer.observe(element);
    setHeaderHeight();
    return () => {
      observer.disconnect();
      page.style.removeProperty('--public-header-height');
    };
  }, []);

  useLayoutEffect(() => {
    const target = !showMenu && document.getElementById(hash.slice(1));
    if (target) target.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }, [hash, showMenu]);

  useEffect(() => {
    if (!bookingNotice) return;
    const timer = window.setTimeout(() => setBookingNotice(0), 3400);
    return () => window.clearTimeout(timer);
  }, [bookingNotice]);

  const booking = {
    href: contacts.booking || '#contacts',
    onClick(event) {
      if (contacts.booking) return;
      event.preventDefault();
      setBookingNotice((notice) => notice + 1);
    },
  };

  return (
    <div ref={root}>
      <Sky className="space-sky" cursorGlow />
      <div id="pg" aria-hidden="true" />
      <header className="hd" ref={header}>
        <div className="w hi">
          <a className="header-brand" href="#home" aria-label="SPACE ARENA">
            <img src={images.logo} alt="SPACE ARENA" draggable={false} />
          </a>
          <nav aria-label="Основная навигация">
            {links.map(({ href, header: label }) => (
              <a
                key={href}
                href={href}
                className={href === '#menu' ? 'mo' : undefined}
                aria-current={href === hash ? (showMenu ? 'page' : 'location') : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          <a className="btn s o header-menu" href="#menu">
            Меню ✦
          </a>
          <a className="btn s header-booking" {...booking}>
            Забронировать
          </a>
        </div>
      </header>

      <Home hidden={showMenu} booking={booking} phone={phone} telegram={telegram} />
      <PublicMenu hidden={!showMenu} header={header} />
      <Footer booking={booking} />

      {bookingNotice > 0 && (
        <div className="ts in" role="status">
          Онлайн-бронирование скоро появится
        </div>
      )}
    </div>
  );
}
