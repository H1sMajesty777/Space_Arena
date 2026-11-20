import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const MENU = { name: 'menu' };

function readView() {
  const hash = window.location.hash;
  const saved = history.state?.orderView;
  if (saved?.hash === hash) return saved;
  if (hash === '#cart') return { name: 'cart' };
  if (hash === '#orders') return { name: 'orders' };
  const item = /^#item-(\d+)$/.exec(hash);
  return item ? { name: 'item', itemId: Number(item[1]) } : MENU;
}

export function useOrderView() {
  const [view, setView] = useState(readView);
  const positions = useRef(new Map());
  const lastFocus = useRef(null);
  const progress = useRef(null);

  useEffect(() => {
    const restoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const restore = () => setView(readView());
    const rememberFocus = (event) => {
      if (
        event.target.closest('main:not([hidden])') &&
        event.target.matches('button, input, textarea, a')
      ) {
        lastFocus.current = { name: readView().name, element: event.target };
      }
    };
    window.addEventListener('popstate', restore);
    document.addEventListener('focusin', rememberFocus);
    return () => {
      history.scrollRestoration = restoration;
      window.removeEventListener('popstate', restore);
      document.removeEventListener('focusin', rememberFocus);
    };
  }, []);

  useLayoutEffect(() => {
    const main = document.querySelector('main:not([hidden])');
    const position = positions.current.get(view.name);
    const focus = position?.focus;
    const heading = main?.querySelector('h1') || main;
    (focus?.isConnected && main?.contains(focus) ? focus : heading)?.focus({ preventScroll: true });
    window.scrollTo({ top: position?.top || 0, behavior: 'instant' });
    positions.current.delete(view.name);
  }, [view]);

  useEffect(() => {
    let frame;
    function paint() {
      frame = undefined;
      const range = document.documentElement.scrollHeight - window.innerHeight;
      const fraction = range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0;
      progress.current.style.transform = `scaleX(${fraction})`;
    }
    function update() {
      frame ??= requestAnimationFrame(paint);
    }
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  function navigate(name, options = {}) {
    const { replace = false, ...details } = options;
    const current = readView();
    if (name === current.name && name !== 'item') return;
    if (!replace) {
      const previousFocus = lastFocus.current;
      positions.current.set(current.name, {
        top: window.scrollY,
        focus: previousFocus?.name === current.name ? previousFocus.element : null,
      });
    }
    const hash = name === 'menu' ? '' : name === 'item' ? `#item-${details.itemId}` : `#${name}`;
    const next = { name, hash, from: replace ? current.from : current.name, ...details };
    history[replace ? 'replaceState' : 'pushState'](
      { ...history.state, orderView: next },
      '',
      `${location.pathname}${location.search}${hash}`,
    );
    setView(next);
  }

  function back(name = 'menu') {
    if (readView().from === name) history.back();
    else navigate(name, { replace: true });
  }

  return { view, navigate, back, progress };
}
