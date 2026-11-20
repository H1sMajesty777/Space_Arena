import { useCallback, useState } from 'react';
import { placeName, tableAliases } from '../../config/floor';
import { usePolling } from '../../hooks/usePolling';
import { BAR_REFRESH_MS } from '../../config/orders';

export function TableAccess({ api }) {
  const [data, setData] = useState({ tables: [], pcs: [] });
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [newPlace, setNewPlace] = useState('');
  const refresh = useCallback(async () => {
    try {
      setData(await api('/api/admin/access'));
    } catch (issue) {
      setError(issue.message);
    }
  }, [api]);
  usePolling(refresh, BAR_REFRESH_MS);

  async function change(path, method, body) {
    setBusy(true);
    setError('');
    try {
      const result = await api(path, { method, body });
      if (result.enrollment_code) setSecret(result.enrollment_code);
      await refresh();
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  function addTable(event) {
    event.preventDefault();
    change('/api/admin/tables', 'POST', {
      number: Number(newPlace || new FormData(event.currentTarget).get('number')),
    });
  }
  function addPC(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    change('/api/admin/pcs', 'POST', {
      name: fields.get('name'),
      table_id: Number(fields.get('table')),
    });
  }
  return (
    <section className="club-form">
      <h2>Места и компьютеры</h2>
      {error && <p className="form-error">{error}</p>}
      {secret && (
        <div className="club-notice">
          <p>Одноразовый код подключения действует 10 минут. Введите его в Windows-агенте.</p>
          <input
            aria-label="Код подключения"
            readOnly
            value={secret}
            onFocus={(event) => event.target.select()}
          />
          <button onClick={() => setSecret('')}>Скрыть код</button>
        </div>
      )}
      <form className="club-form" onSubmit={addTable}>
        <label>
          Новое место
          <select value={newPlace} onChange={(event) => setNewPlace(event.target.value)}>
            <option value="">Стол по номеру</option>
            {Object.entries(tableAliases).map(([number, name]) => (
              <option key={number} value={number}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {!newPlace && (
          <label>
            Номер стола
            <input name="number" type="number" min="1" max="500" required />
          </label>
        )}
        <button className="btn" disabled={busy}>
          Добавить место
        </button>
      </form>
      {data.tables.map((table) => (
        <div className="catalog-item" key={table.id}>
          <b>{placeName(table.number)}</b>
          <span>{table.active ? 'Доступен' : 'Отключён'}</span>
          <button
            className="quiet-button"
            disabled={busy}
            onClick={() =>
              change(`/api/admin/tables/${table.id}/active`, 'PATCH', { active: !table.active })
            }
          >
            {table.active ? 'Отключить' : 'Включить'}
          </button>
        </div>
      ))}
      <form className="club-form" onSubmit={addPC}>
        <label>
          Название ПК
          <input name="name" maxLength="100" required />
        </label>
        <label>
          Место
          <select name="table" required>
            {data.tables.map((table) => (
              <option key={table.id} value={table.id}>
                {placeName(table.number)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" disabled={busy || !data.tables.length}>
          Подключить ПК
        </button>
      </form>
      {data.pcs.map((pc) => (
        <article className="order-ticket gl" key={pc.id}>
          <h3>
            {pc.name} · {placeName(data.tables.find((table) => table.id === pc.table_id)?.number)}
          </h3>
          <p className="muted">
            {pc.active ? 'Активен' : 'Отключён'} · Последняя связь{' '}
            {pc.last_seen ? new Date(pc.last_seen).toLocaleString('ru-RU') : 'ещё не подключался'}
          </p>
          <button
            className="quiet-button"
            disabled={busy}
            onClick={() =>
              change(`/api/admin/pcs/${pc.id}/active`, 'PATCH', { active: !pc.active })
            }
          >
            {pc.active ? 'Отключить' : 'Включить'}
          </button>
          <button
            className="quiet-button"
            disabled={busy}
            onClick={() => {
              if (confirm('Заменить секрет? Потребуется заново настроить агент на этом ПК.'))
                change(`/api/admin/pcs/${pc.id}/rotate`, 'POST');
            }}
          >
            Заменить секрет
          </button>
        </article>
      ))}
    </section>
  );
}
