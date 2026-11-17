import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type GuestLink = { order_url: string | null; expires_at: number; status: string };

const LINK_POLL_INTERVAL_MS = 5000;
const QR_QUIET_ZONE_MODULES = 4;

function useGuestLink() {
  const [link, setLink] = useState<GuestLink>({ order_url: null, expires_at: 0, status: "Подключаемся…" });
  useEffect(() => {
    let mounted = true;
    async function refresh() {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/current", { cache: "no-store" });
        if (!response.ok) throw new Error("Агент недоступен");
        const next: GuestLink = await response.json();
        if (mounted) setLink(next);
      } catch {
        if (mounted) setLink({ order_url: null, expires_at: 0, status: "Запустите агент на клубном ПК" });
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, LINK_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  if (link.order_url && Date.now() >= link.expires_at * 1000) {
    return { ...link, order_url: null, status: "Обновляем QR…" };
  }
  return link;
}

// Фиксированное небо без одинаковых рядов, с разными размерами и яркостью звёзд.
function starCoordinate(index: number, frequency: number) {
  const value = Math.sin((index + 1) * frequency) * 43758.5453;
  return (value - Math.floor(value)) * 100;
}

const stars = Array.from({ length: 112 }, (_, index) => ({
  x: starCoordinate(index, 12.9898),
  y: starCoordinate(index, 78.233),
  size: 0.65 + ((index * 31) % 17) / 10,
  opacity: 0.25 + ((index * 13) % 19) / 30,
}));

function App() {
  const guest = useGuestLink();

  function openOrder() {
    if (!guest.order_url) return;
    void fetch("/api/open-order", { method: "POST", cache: "no-store" });
  }

  return (
    <main className="banner" aria-label="Анимированный баннер SPACE ARENA X GULIANI">
      <div className="scene">
        <div className="wake-layer wake-heat" aria-hidden="true" />
        <div className="wake-layer backdrop" aria-hidden="true">
          <div className="sky-glow" />
          <div className="star-field">
            {stars.map((star, index) => (
              <i
                key={index}
                style={{
                  left: `${star.x}%`,
                  top: `${star.y}%`,
                  width: star.size,
                  opacity: star.opacity,
                }}
              />
            ))}
          </div>
          <div className="shooting-star" />
        </div>

        <div className="launch-mark" aria-hidden="true">
          <div className="rocket-body">
            <img className="mark-main" src={`${import.meta.env.BASE_URL}space-mark.png`} alt="" />
            <div className="exhaust">
              <div className="engine-plume" />
              <div className="engine-core" />
            </div>
          </div>
        </div>

        <section className="final-lockup" aria-label="SPACE ARENA X GULIANI">
          <div className="orbital-halo" aria-hidden="true" />
          <div className="logo-shell">
            <img className="arena-logo" src={`${import.meta.env.BASE_URL}space-arena.png`} alt="SPACE ARENA" />
          </div>
          <div className="collaboration">
            <span />
            <p>X GULIANI</p>
            <span />
          </div>
        </section>

        <div className="frame-corner frame-corner--tl" />
        <div className="frame-corner frame-corner--tr" />
        <div className="frame-corner frame-corner--bl" />
        <div className="frame-corner frame-corner--br" />

        <div className="guest-access">
          <div className="guest-qr">
            {guest.order_url ? (
              <QRCodeSVG
                value={guest.order_url}
                title="QR-код для заказа"
                size={112}
                level="M"
                marginSize={QR_QUIET_ZONE_MODULES}
              />
            ) : (
              <span>QR<br />недоступен</span>
            )}
          </div>
          <div className="guest-access-text">
            <strong>МЕНЮ И ЗАКАЗ</strong>
            <span>{guest.order_url ? "Наведите камеру или нажмите на баннер" : guest.status}</span>
          </div>
        </div>

        {guest.order_url && (
          <button
            className="order-hitbox"
            type="button"
            onClick={openOrder}
            aria-label="Открыть меню и заказать"
          />
        )}
      </div>
    </main>
  );
}

export default App;
