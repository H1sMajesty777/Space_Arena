import { useCallback, useState } from 'react';
import { request } from '../api/client';
import { OrdersBoard } from '../components/admin/OrdersBoard';
import { Catalog } from '../components/admin/Catalog';
import { ItemEditor } from '../components/admin/ItemEditor';
import { TableAccess } from '../components/admin/TableAccess';
import { usePolling } from '../hooks/usePolling';
import { BAR_REFRESH_MS } from '../config/orders';

/* ---------- 1. Авторизация ---------- */
export function BarPage() {
  const [token, setToken] = useState(sessionStorage.getItem('space_bar_token') || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function logout() {
    sessionStorage.removeItem('space_bar_token');
    setToken('');
  }

  const api = useCallback(
    async (path, options) => {
      try {
        return await request(path, { ...options, token });
      } catch (issue) {
        if (issue.status === 401) logout();
        throw issue;
      }
    },
    [token],
  );

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
      sessionStorage.setItem('space_bar_token', result.access_token);
      setToken(result.access_token);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return token ? (
    <Dashboard api={api} logout={logout} />
  ) : (
    <main className="login-layout w">
      <section>
        <img className="login-logo" src="/assets/logo.png" alt="SPACE ARENA" />
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
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [editor, setEditor] = useState(undefined);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [currentOrders, currentItems] = await Promise.all([
        api('/api/admin/orders?limit=500'),
        api('/api/admin/menu'),
      ]);
      setOrders(currentOrders);
      setItems(currentItems);
      setUpdated(new Date().toLocaleTimeString('ru-RU'));
      setError('');
    } catch (issue) {
      setError(issue.message);
    }
  }, [api]);
  usePolling(refresh, BAR_REFRESH_MS);

  return (
    <>
      <header className="hd">
        <div className="w hi club-header">
          <img className="club-logo" src="/assets/logo.png" alt="SPACE ARENA" />
          <span className="table-indicator">Панель бара</span>
          <button className="quiet-button" onClick={logout}>
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
          <button className="quiet-button" onClick={refresh}>
            Обновить ↻<small>{updated && `Обновлено ${updated}`}</small>
          </button>
        </div>
        <div className="admin-metrics">
          <div>
            <small>Новые</small>
            <b>{orders.filter((order) => order.status === 'new').length}</b>
          </div>
          <div>
            <small>Готовятся</small>
            <b>
              {orders.filter((order) => ['accepted', 'preparing'].includes(order.status)).length}
            </b>
          </div>
          <div>
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
            ['menu', 'Меню и стоп-лист'],
            ['tables', 'Столики · QR'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={view === value ? 'active' : ''}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </nav>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {view === 'orders' && (
          <OrdersBoard orders={orders} api={api} onChanged={refresh} onError={setError} />
        )}
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
