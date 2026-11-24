import { useEffect, useRef } from 'react';

const COMPACT_SKY = '(max-width: 820px), (hover: none)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const COMPACT_FRAME_MS = 50;
const MAX_COMPACT_STARS = 56;

export function Sky({ className = 'space-sky club-sky', cursorGlow = false }) {
  const reference = useRef(null);
  const glowRef = useRef(null);

  useEffect(() => {
    const canvas = reference.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    const glow = glowRef.current;

    const compact = matchMedia(COMPACT_SKY);
    const reduced = matchMedia(REDUCED_MOTION);
    let width = 0;
    let height = 0;
    let stars = [];
    let comet = null;
    let frame = null;
    let timer = null;
    let mouseX = 0;
    let mouseY = 0;

    function drawComet() {
      if (!comet && Math.random() < 0.004) {
        comet = { x: Math.random() * width, y: Math.random() * height * 0.5, life: 0 };
      }
      if (!comet) return;
      comet.x += 14;
      comet.y += 6;
      comet.life++;
      const { x, y } = comet;
      const trail = context.createLinearGradient(x - 120, y - 52, x, y);
      trail.addColorStop(0, 'transparent');
      trail.addColorStop(1, '#fff');
      context.globalAlpha = 1;
      context.strokeStyle = trail;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x - 120, y - 52);
      context.lineTo(x, y);
      context.stroke();
      if (comet.life > 70) comet = null;
    }

    function paint(time) {
      const still = reduced.matches;
      const full = !compact.matches && !still;
      const scroll = full ? window.scrollY : 0;
      context.clearRect(0, 0, width, height);
      for (const star of stars) {
        const y = (((star.y * height - scroll * star.depth * 0.25) % height) + height) % height;
        const x = star.x * width - (full ? mouseX * star.depth * 40 : 0);
        context.globalAlpha = still
          ? 0.7
          : 0.35 + 0.65 * Math.abs(Math.sin(time / 900 + star.phase));
        context.fillStyle = star.depth > 0.75 ? '#c9a7ff' : '#fff';
        const size = star.depth * 2.2;
        context.fillRect(x, y + (full ? mouseY * star.depth * 18 : 0), size, size);
      }
      if (full) drawComet();
    }

    function schedule() {
      if (reduced.matches || document.hidden) return;
      if (compact.matches) {
        timer = setTimeout(() => {
          timer = null;
          frame = requestAnimationFrame(draw);
        }, COMPACT_FRAME_MS);
      } else {
        frame = requestAnimationFrame(draw);
      }
    }

    function draw(time) {
      frame = null;
      paint(time);
      schedule();
    }

    function stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
      frame = null;
      timer = null;
    }

    function resize() {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      if (width !== w) width = canvas.width = w;
      if (height !== h) height = canvas.height = h;
      const count = Math.floor(Math.min(compact.matches ? MAX_COMPACT_STARS : 240, width / 5));
      stars = stars.slice(0, count);
      while (stars.length < count) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          depth: Math.random() * 0.9 + 0.1,
          phase: Math.random() * 6,
        });
      }
      if (!document.hidden) paint(performance.now());
    }

    function sync() {
      stop();
      if (document.hidden || compact.matches || reduced.matches) hideGlow();
      if (document.hidden) return;
      if (compact.matches || reduced.matches) comet = null;
      resize();
      schedule();
    }

    function pointer(event) {
      if (compact.matches || reduced.matches || event.pointerType !== 'mouse') return;
      mouseX = event.clientX / width - 0.5;
      mouseY = event.clientY / height - 0.5;
      if (glow) {
        glow.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
        glow.hidden = false;
      }
    }

    function hideGlow() {
      if (glow) glow.hidden = true;
    }

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', pointer, { passive: true });
    document.addEventListener('visibilitychange', sync);
    compact.addEventListener('change', sync);
    reduced.addEventListener('change', sync);
    if (glow) {
      document.documentElement.addEventListener('pointerleave', hideGlow);
      window.addEventListener('blur', hideGlow);
    }
    sync();
    return () => {
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', pointer);
      document.removeEventListener('visibilitychange', sync);
      compact.removeEventListener('change', sync);
      reduced.removeEventListener('change', sync);
      document.documentElement.removeEventListener('pointerleave', hideGlow);
      window.removeEventListener('blur', hideGlow);
    };
  }, [cursorGlow]);

  return (
    <div className={className} aria-hidden="true">
      <canvas id="sky" ref={reference} />
      <div className="au a" />
      <div className="au b" />
      {cursorGlow && <div id="cg" ref={glowRef} hidden />}
    </div>
  );
}
