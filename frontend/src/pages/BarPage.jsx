import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../api/client';
import { OrdersBoard } from '../components/admin/OrdersBoard';
import { Catalog } from '../components/admin/Catalog';
import { ItemEditor } from '../components/admin/ItemEditor';
import { TableAccess } from '../components/admin/TableAccess';
import { ClubMap } from '../components/admin/ClubMap';
import { SiteBrand } from '../components/SiteBrand';
import { usePolling } from '../hooks/usePolling';
import { useOrderSound } from '../hooks/useOrderSound';
import { BAR_REFRESH_MS } from '../config/orders';

/* ---------- 1. Авторизация ---------- */
export function BarPage() {
  const token = useRef(sessionStorage.getItem('space_bar_token') || '');
  const renewing = useRef(null);
  const signingOut = useRef(false);
  const [signedIn, setSignedIn] = useState(Boolean(token.current));
  const [restoring, setRestoring] = useState(!token.current);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem('space_bar_token');
    token.current = '';
    setSignedIn(false);
  }, []);

  const renew = useCallback(() => {
    renewing.current ??= request('/api/admin/refresh', { method: 'POST' })
      .then(({ access_token }) => {
        sessionStorage.removeItem('space_bar_token');
        token.current = access_token;
        setSignedIn(true);
      })
      .catch((issue) => {
        if (issue.status === 401) clearSession();
        throw issue;
      })
      .finally(() => {
        renewing.current = null;
      });
    return renewing.current;
  }, [clearSession]);

  const restore = useCallback(async () => {
    setRestoring(true);
    setError('');
    try {
      await renew();
    } catch (issue) {
      if (issue.status !== 401) setError(issue.message);
    } finally {
      setRestoring(false);
    }
  }, [renew]);

  useEffect(() => {
    if (!token.current) restore();
  }, [restore]);

  const api = useCallback(
    async (path, options) => {
      if (signingOut.current) throw new Error('Идёт выход из панели бара');
      const previous = token.current;
      try {
        return await request(path, { ...options, token: previous });
      } catch (issue) {
        if (issue.status !== 401 || signingOut.current) throw issue;
        if (!token.current || previous === token.current) await renew();
        return request(path, { ...options, token: token.current });
      }
    },
    [renew],
  );

  async function logout() {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await renewing.current?.catch(() => {});
      await request('/api/admin/logout', { method: 'POST' });
      clearSession();
      setError('');
    } finally {
      signingOut.current = false;
    }
  }

  async function login(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await request('/api/admin/login', {
        method: 'POST',
        body: { username: fields.get('username'), password: fields.get('password') },
      });
      sessionStorage.removeItem('space_bar_token');
      token.current = result.access_token;
      setSignedIn(true);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  if (restoring)
    return (
      <main className="w admin-main" role="status">
        Восстанавливаем сессию бара…
      </main>
    );

  return signedIn ? (
    <Dashboard api={api} logout={logout} />
  ) : (
    <main className="login-layout w">
      <section>
        <SiteBrand className="login-logo" src="/assets/logo.png" alt="SPACE ARENA" />
        <p className="eb">ПАНЕЛЬ БАРА</p>
        <h1>
          Всё под
          <br />
          <span className="gr">контролем.</span>
        </h1>
        <p className="muted">Заказы, фотографии, меню и стоп-лист.</p>
      </section>
      <form className="club-form login-form gl" onSubmit={login}>
        <h2>Вход для команды</h2>
        <label>
          Логин
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Пароль
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {error && (
          <button type="button" className="quiet-button" onClick={restore}>
            Восстановить сессию
          </button>
        )}
        <button className="btn" disabled={busy}>
          {busy ? 'Входим…' : 'Войти в бар'}
        </button>
      </form>
    </main>
  );
}

/* ---------- 2. Рабочий экран бармена ---------- */
function Dashboard({ api, logout }) {
  const [view, setView] = useState('orders');
  const [ordersFilter, setOrdersFilter] = useState('active');
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [floor, setFloor] = useState(null);
  const [editor, setEditor] = useState(undefined);
  const [error, setError] = useState('');
  const [ordersError, setOrdersError] = useState('');
  const [updated, setUpdated] = useState('');
  const refreshAttempt = useRef(0);
  const ordersAttempt = useRef(0);
  const knownOrders = useRef(null);
  const { notify, toggleSound, soundState } = useOrderSound();
  const newCount = orders.filter((order) => order.status === 'new').length;

  const refreshOrders = useCallback(async () => {
    const attempt = ++ordersAttempt.current;
    try {
      const current = await api('/api/admin/orders?limit=500');
      if (attempt !== ordersAttempt.current) return;
      if (
        knownOrders.current &&
        current.some((order) => order.status === 'new' && !knownOrders.current.has(order.id))
      ) {
        notify();
      }
      knownOrders.current = new Set(current.map((order) => order.id));
      setOrders(current);
      setUpdated(new Date().toLocaleTimeString('ru-RU'));
      setOrdersError('');
    } catch (issue) {
      if (attempt === ordersAttempt.current) setOrdersError(issue.message);
    }
  }, [api, notify]);
  usePolling(refreshOrders, BAR_REFRESH_MS, true);

  const refreshCatalog = useCallback(async () => {
    const attempt = ++refreshAttempt.current;
    try {
      const [currentItems, currentFloor] = await Promise.all([
        api('/api/admin/menu'),
        view === 'floor' ? api('/api/admin/floor') : null,
      ]);
      if (attempt !== refreshAttempt.current) return;
      setItems(currentItems);
      if (currentFloor) setFloor(currentFloor);
      setError('');
    } catch (issue) {
      if (attempt === refreshAttempt.current) setError(issue.message);
    }
  }, [api, view]);
  usePolling(refreshCatalog, BAR_REFRESH_MS);
  const refresh = () => Promise.all([refreshOrders(), refreshCatalog()]);

  return (
    <>
      <header className="hd">
        <div className="w hi club-header">
          <SiteBrand className="club-logo" src="/assets/logo.png" alt="SPACE ARENA" />
          <span className="table-indicator">Панель бара</span>
          <button
            className="quiet-button"
            onClick={() => logout().catch((issue) => setError(issue.message))}
          >
            Выйти
          </button>
        </div>
      </header>
      <main className="w admin-main">
        <div className="admin-heading">
          <div>
            <p className="eb">SPACE ARENA · КОМАНДА</p>
            <h1>
              Бар <span className="gr">и кухня</span>
            </h1>
          </div>
          <div className="admin-heading-actions">
            <button
              type="button"
              className="quiet-button bar-sound"
              data-sound={soundState}
              onClick={toggleSound}
              aria-label={soundState === 'on' ? 'Выключить звук' : 'Включить звук'}
            >
              {soundState === 'on' ? 'Звук включён' : 'Включить звук'}
            </button>
            <button type="button" className="quiet-button" onClick={refresh}>
              Обновить ↻<small>{updated && `Обновлено ${updated}`}</small>
            </button>
          </div>
        </div>
        <div className="admin-metrics">
          <div className="ticket-new">
            <small>Новые</small>
            <b>{newCount}</b>
          </div>
          <div className="ticket-preparing">
            <small>Готовятся</small>
            <b>
              {orders.filter((order) => ['accepted', 'preparing'].includes(order.status)).length}
            </b>
          </div>
          <div className="ticket-ready">
            <small>Готовы</small>
            <b>{orders.filter((order) => order.status === 'ready').length}</b>
          </div>
          <div>
            <small>В стоп-листе</small>
            <b>{items.filter((item) => !item.is_available).length}</b>
          </div>
        </div>
        <nav className="admin-tabs" aria-label="Разделы панели">
          {[
            ['orders', 'Заказы'],
            ['floor', 'Карта клуба'],
            ['menu', 'Меню и стоп-лист'],
            ['tables', 'Столики · QR'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={view === value ? 'active' : ''}
              aria-pressed={view === value}
              onClick={() => {
                if (value === 'orders' && view !== 'orders') setOrdersFilter('active');
                setView(value);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="bar-arrivals" role="status" hidden={!newCount}>
          <span>
            Новые заказы <b>{newCount}</b>
          </span>
          <button
            type="button"
            onClick={() => {
              setOrdersFilter('new');
              setView('orders');
            }}
          >
            Показать новые →
          </button>
        </div>
        {(ordersError || error) && (
          <p className="form-error" role="alert">
            {ordersError || error}
          </p>
        )}
        {view === 'orders' && (
          <OrdersBoard
            orders={orders}
            filter={ordersFilter}
            setFilter={setOrdersFilter}
            api={api}
            onChanged={refresh}
            onError={setError}
          />
        )}
        {view === 'floor' && <ClubMap tables={floor} api={api} onChanged={refresh} />}
        {view === 'menu' && (
          <>
            <div className="section-actions">
              <h2>
                Все позиции <small>{items.length}</small>
              </h2>
              <button className="btn s" onClick={() => setEditor(null)}>
                + Добавить позицию
              </button>
            </div>
            <Catalog
              items={items}
              api={api}
              onEdit={setEditor}
              onChanged={refresh}
              onError={setError}
            />
          </>
        )}
        {view === 'tables' && <TableAccess api={api} />}
      </main>
      {editor !== undefined && (
        <ItemEditor
          item={editor}
          categories={[...new Set(items.map((item) => item.category))]}
          api={api}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            refresh();
          }}
        />
      )}
    </>
  );
}
