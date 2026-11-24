import { useEffect } from 'react';

export const COMPACT_EFFECTS = '(max-width: 820px), (hover: none)';
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function usePublicMotion(root) {
  useEffect(() => {
    const page = root.current;
    const compact = matchMedia(COMPACT_EFFECTS);
    const reduced = matchMedia(REDUCED_MOTION);
    const progress = page.querySelector('#pg');
    const targets = page.querySelectorAll('.rv, .scatter');
    const cards = page.querySelectorAll('[data-tilt]');
    const buttons = page.querySelectorAll('[data-m]');
    const parallax = page.querySelectorAll('[data-p]');
    const timers = new Set();

    function reveal(element) {
      if (element.classList.contains('scatter')) {
        element.querySelectorAll('.pic').forEach((photo) => photo.classList.add('in'));
        return;
      }
      element.classList.add('in');
      const delay = parseFloat(getComputedStyle(element).getPropertyValue('--d')) || 0;
      const timer = window.setTimeout(
        () => {
          element.classList.add('done');
          timers.delete(timer);
        },
        1100 + delay * 1000,
      );
      timers.add(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const { isIntersecting, target } of entries) {
          if (!isIntersecting) continue;
          observer.unobserve(target);
          reveal(target);
        }
      },
      { threshold: 0.1 },
    );

    function syncMotion() {
      observer.disconnect();
      for (const element of targets) {
        if (reduced.matches) reveal(element);
        else if (!element.classList.contains('in')) observer.observe(element);
      }
    }

    function resetTilt(event) {
      event.currentTarget.style.setProperty('--rx', '0deg');
      event.currentTarget.style.setProperty('--ry', '0deg');
    }

    function onPointerMove(event) {
      if (reduced.matches || event.pointerType !== 'mouse') return;
      const { clientX, clientY } = event;
      const card = event.target.closest('.gl');
      if (card && page.contains(card)) {
        const box = card.getBoundingClientRect();
        const x = (clientX - box.left) / box.width;
        const y = (clientY - box.top) / box.height;
        card.style.setProperty('--mx', `${x * 100}%`);
        card.style.setProperty('--my', `${y * 100}%`);
        if (card.hasAttribute('data-tilt')) {
          card.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
          card.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
        }
      }

      const limit = compact.matches ? 4 : 10;
      const pull = (offset) => Math.max(-limit, Math.min(limit, offset));
      for (const button of buttons) {
        const box = button.getBoundingClientRect();
        const dx = clientX - (box.left + box.width / 2);
        const dy = clientY - (box.top + box.height / 2);
        button.style.transform =
          Math.hypot(dx, dy) < 90 ? `translate(${pull(dx * 0.25)}px, ${pull(dy * 0.35)}px)` : '';
      }
    }

    function onScroll() {
      if (reduced.matches) return;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      progress.style.transform = `scaleX(${window.scrollY / maxScroll})`;
      if (compact.matches) return;
      for (const element of parallax) {
        const box = element.getBoundingClientRect();
        if (box.bottom < -200 || box.top > window.innerHeight + 200) continue;
        element.style.translate = `0 ${(box.top + box.height / 2 - window.innerHeight / 2) * -element.dataset.p}px`;
      }
    }

    syncMotion();
    onScroll();
    reduced.addEventListener('change', syncMotion);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    cards.forEach((card) => card.addEventListener('pointerleave', resetTilt));
    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      reduced.removeEventListener('change', syncMotion);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      cards.forEach((card) => card.removeEventListener('pointerleave', resetTilt));
    };
  }, [root]);
}
