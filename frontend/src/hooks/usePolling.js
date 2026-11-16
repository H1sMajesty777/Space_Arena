import { useEffect } from 'react';

// Не создаём перекрывающиеся запросы и не опрашиваем сервер в скрытой вкладке.
export function usePolling(callback, interval = 15000) {
  useEffect(() => {
    let disposed = false;
    let timer;
    async function poll() {
      try {
        if (!document.hidden) await callback();
      } finally {
        if (!disposed) timer = setTimeout(poll, interval);
      }
    }
    poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [callback, interval]);
}
