import { useEffect } from 'react';

const MAX_OFFSET = 6;
const pull = (distance) => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, distance * 0.28));

export function useMagneticButtons() {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let active = null;

    function reset() {
      active?.style.removeProperty('--magnet-x');
      active?.style.removeProperty('--magnet-y');
      active = null;
    }

    function move(event) {
      if (event.pointerType !== 'mouse' || reduced.matches) return;
      const button = event.target.closest?.('[data-m]');
      if (button !== active || button?.disabled) reset();
      if (!button || button.disabled) return;
      active = button;
      const rect = button.getBoundingClientRect();
      button.style.setProperty('--magnet-x', `${pull(event.clientX - rect.x - rect.width / 2)}px`);
      button.style.setProperty('--magnet-y', `${pull(event.clientY - rect.y - rect.height / 2)}px`);
    }

    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    reduced.addEventListener('change', reset);
    return () => {
      reset();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
      reduced.removeEventListener('change', reset);
    };
  }, []);
}
