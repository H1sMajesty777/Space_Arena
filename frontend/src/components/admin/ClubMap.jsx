import { useCallback, useEffect, useRef, useState } from 'react';
import { FLOOR_HEIGHT, floors, placeName, tableAliases, tableRooms } from '../../config/floor';
import { money, orderTotal, ORDER_STATUS } from '../../config/orders';
import { SelectionSummary } from '../ItemChoices';
import { Modal } from '../Modal';

function tableStatus(table) {
  if (table?.order_count) return 'Есть неоплаченные заказы';
  if (table?.flagged) return 'Отмечен вручную';
  return 'Нет открытого счёта';
}

function FloorPlan({ floor, tables, onSelect }) {
  return (
    <section className="floor-panel" aria-label={floor.name}>
      <h3 className="floor-panel-title">
        {floor.name}
        <span className="floor-pan-hint" aria-hidden="true">
          Листайте схему ↔
        </span>
      </h3>
      <div className="floor-scroll">
        <div className="floor-plan" style={{ minWidth: floor.minWidth }}>
          <svg
            className="floor-corridors"
            viewBox={`0 0 ${floor.width} ${FLOOR_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={floor.corridors} />
          </svg>
          {floor.rooms.map(({ name, box: [x, y, width, height], rows, landmark, icon, zone }) => (
            <div
              key={`${x}:${y}`}
              className={`floor-room${landmark ? ' floor-landmark' : ''}${zone ? ' floor-room-zone' : ''}`}
              style={{
                left: `${(x / floor.width) * 100}%`,
                top: `${(y / FLOOR_HEIGHT) * 100}%`,
                width: `${(width / floor.width) * 100}%`,
                height: `${(height / FLOOR_HEIGHT) * 100}%`,
              }}
            >
              {icon && <span className={`floor-symbol floor-symbol-${icon}`} aria-hidden="true" />}
              {!zone && <span className="floor-room-name">{name}</span>}
              {rows && (
                <div className="floor-seats">
                  {rows.map((row) => (
                    <div className="floor-seat-row" key={row[0]}>
                      {row.map((number) => {
                        if (!number) return <span key="gap" className="floor-seat-gap" />;
                        const table = tables?.get(number);
                        const affected = table?.order_count || table?.flagged;
                        const label = placeName(number);
                        const status = tables ? tableStatus(table) : 'Загружаем статус';
                        return (
                          <button
                            key={number}
                            type="button"
                            className="floor-seat"
                            data-bill={tables ? (affected ? 'open' : 'clear') : 'loading'}
                            aria-label={`${label}${zone ? '' : `, ${name}`}. ${status}`}
                            title={`${label} · ${status}`}
                            aria-haspopup="dialog"
                            onClick={() => onSelect(number)}
                          >
                            {tableAliases[number] || number}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ClubMap({ tables, api, onChanged }) {
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const byNumber = tables && new Map(tables.map((table) => [table.number, table]));
  const open = tables?.filter((table) => table.order_count || table.flagged) || [];
  const offMap = tables?.filter((table) => !tableRooms.has(table.number)) || [];

  function select(number) {
    setMessage('');
    setSelected(number);
  }

  async function onSaved(message) {
    setSelected(null);
    setMessage(message);
    await onChanged();
  }

  return (
    <section className="club-map" aria-labelledby="club-map-title">
      <header className="club-map-header">
        <h2 id="club-map-title">Карта клуба</h2>
        <div className="floor-legend">
          <span>
            <i className="floor-dot floor-dot-clear" /> Нет открытого счёта
          </span>
          <span>
            <i className="floor-dot floor-dot-open" /> Не оплачено или отмечено
          </span>
        </div>
      </header>
      <div className="floor-open">
        <h3>Требуют внимания {tables && <span>{open.length}</span>}</h3>
        {open.length > 0 ? (
          <div className="floor-links">
            {open.map(({ number, order_count, total }) => (
              <button
                type="button"
                key={number}
                onClick={() => select(number)}
                aria-haspopup="dialog"
              >
                <strong>{placeName(number)}</strong>
                <span>{order_count ? money(total) : 'Отметка'}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">{tables ? 'Открытых счетов и отметок нет.' : 'Загружаем карту…'}</p>
        )}
      </div>
      {message && (
        <p className="floor-feedback" role="status">
          {message}
        </p>
      )}
      <div className="floor-grid">
        {floors.map((floor) => (
          <FloorPlan key={floor.name} floor={floor} tables={byNumber} onSelect={select} />
        ))}
      </div>
      {offMap.length > 0 && (
        <section className="floor-extra">
          <h3>Столы вне схемы</h3>
          <div className="floor-links">
            {offMap.map((table) => (
              <button
                key={table.number}
                type="button"
                aria-haspopup="dialog"
                onClick={() => select(table.number)}
              >
                <strong>{placeName(table.number)}</strong>
                <span>{tableStatus(table)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {selected !== null && (
        <TableBill
          key={selected}
          number={selected}
          summary={byNumber?.get(selected)}
          api={api}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}

function TableBill({ number, summary, api, onClose, onSaved }) {
  const [bill, setBill] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadAttempt = useRef(0);
  const path = `/api/admin/floor/${number}`;
  const label = placeName(number);
  const room = tableRooms.get(number);
  const canClose = bill && (bill.orders.length > 0 || bill.flagged);
  const total =
    (bill?.orders ?? []).reduce((sum, order) => sum + Math.round(orderTotal(order) * 100), 0) / 100;
  const { order_count: orderCount = 0, flagged = false, total: billTotal = 0 } = summary ?? {};

  const load = useCallback(async () => {
    const attempt = ++loadAttempt.current;
    setBill(null);
    try {
      const current = await api(path);
      if (attempt === loadAttempt.current) setBill(current);
    } catch (issue) {
      if (attempt === loadAttempt.current) setError(issue.message);
    }
  }, [api, path]);
  useEffect(() => {
    setError('');
    load();
  }, [load, orderCount, flagged, billTotal]);

  async function change(closeTable) {
    setBusy(true);
    setError('');
    try {
      if (closeTable) {
        await api(`${path}/close`, {
          method: 'POST',
          body: { version: bill.version, order_ids: bill.orders.map((order) => order.id) },
        });
        await onSaved(`${label} · Счёт закрыт.`);
      } else {
        await api(`${path}/flag`, {
          method: 'PATCH',
          body: { version: bill.version, flagged: !bill.flagged },
        });
        await onSaved(`${label} · ${bill.flagged ? 'Отметка снята.' : 'Отметка добавлена.'}`);
      }
    } catch (issue) {
      setError(issue.message);
      if (issue.status === 409) await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={label} onClose={() => !busy && onClose()} className="floor-bill">
      {room && room !== label && <p className="muted">{room}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!bill &&
        (error ? (
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              setError('');
              load();
            }}
          >
            Повторить
          </button>
        ) : (
          <p role="status">Загружаем счёт…</p>
        ))}
      {bill && (
        <>
          {bill.flagged && <p className="floor-flag">Отмечен вручную</p>}
          {bill.orders.length ? (
            <>
              <ul className="floor-bill-orders">
                {bill.orders.map((order) => (
                  <li key={order.id}>
                    <div className="floor-bill-row">
                      <strong>Заказ №{order.id}</strong>
                      <span>{ORDER_STATUS[order.status]?.label}</span>
                    </div>
                    <ul>
                      {order.items.map((item) => (
                        <li className="floor-bill-row" key={item.id}>
                          <span>
                            {item.quantity} × {item.name}
                            <SelectionSummary selection={item} />
                          </span>
                          <span>{money(Number(item.unit_price) * item.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <div className="floor-bill-total">
                <span>К оплате</span>
                <strong>{money(total)}</strong>
              </div>
            </>
          ) : (
            <p className="floor-bill-empty">Неоплаченных заказов нет.</p>
          )}
          {canClose && (
            <p className="muted floor-bill-note">
              Закрытие очистит гостевую историю и корзину на всех устройствах этого места.
            </p>
          )}
          <div className="floor-bill-actions">
            {canClose && (
              <button type="button" className="btn" disabled={busy} onClick={() => change(true)}>
                {bill.orders.length ? 'Оплата получена · Закрыть счёт' : 'Закрыть счёт'}
              </button>
            )}
            <button
              type="button"
              className="quiet-button"
              disabled={busy}
              onClick={() => change(false)}
            >
              {bill.flagged ? 'Снять отметку' : 'Отметить вручную'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
