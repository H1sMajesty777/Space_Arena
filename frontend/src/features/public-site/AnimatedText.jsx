import { useEffect, useRef } from 'react';
import { COMPACT_EFFECTS, REDUCED_MOTION } from './usePublicMotion';

export function HeadlineWord({ text, start = 0 }) {
  return [...text].map((letter, index) => (
    <span className="ch" key={index} style={{ '--i': start + index }} aria-hidden="true">
      {letter}
    </span>
  ));
}

export function AnimatedNumber({ value, rubles = false }) {
  const number = useRef(null);

  useEffect(() => {
    const element = number.current;
    const format = (amount) => amount.toLocaleString('ru-RU') + (rubles ? ' ₽' : '');
    if (matchMedia(COMPACT_EFFECTS).matches || matchMedia(REDUCED_MOTION).matches) {
      element.textContent = format(value);
      return;
    }

    let frame;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      element.textContent = format(0);
      const start = performance.now() + (rubles ? 250 : 0);
      function count(now) {
        const progress = Math.min(1, Math.max(0, (now - start) / 1100));
        element.textContent = format(Math.round(value * (1 - (1 - progress) ** 4)));
        if (progress < 1) frame = requestAnimationFrame(count);
      }
      frame = requestAnimationFrame(count);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, rubles]);

  if (rubles) return <b ref={number}>{value.toLocaleString('ru-RU')} ₽</b>;
  return (
    <u ref={number} style={{ textDecoration: 'none' }}>
      {value}
    </u>
  );
}
