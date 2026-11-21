import { useEffect } from 'react';

// Не создаём перекрывающиеся запросы и не опрашиваем сервер в скрытой вкладке.
export function usePolling(callback, interval = 15000, inBackground = false) {
  useEffect(() => {
    let disposed = false;
    let timer;
    async function poll() {
      try {
        if (inBackground || !document.hidden) await callback();
      } finally {
        if (!disposed) timer = setTimeout(poll, interval);
      }
    }
    poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [callback, interval, inBackground]);
}
