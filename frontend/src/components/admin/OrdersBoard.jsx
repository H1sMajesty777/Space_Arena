import { useState } from 'react';
import { placeName, tableAliases } from '../../config/floor';
import { money, orderTotal, ORDER_STATUS } from '../../config/orders';
import { Modal } from '../Modal';
import { SelectionSummary } from '../ItemChoices';

export function OrdersBoard({ orders, filter, setFilter, api, onChanged, onError }) {
  const [busy, setBusy] = useState(null);
  const [cancel, setCancel] = useState(null);
  const filtered = orders
    .filter((order) => {
      if (filter === 'active') return !['served', 'cancelled'].includes(order.status);
      if (filter === 'history') return ['served', 'cancelled'].includes(order.status);
      return order.status === filter;
    })
    .sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new'));

  async function changeStatus(order, status) {
    setBusy(order.id);
    try {
      await api(`/api/admin/orders/${order.id}/status`, { method: 'PATCH', body: { status } });
      setCancel(null);
      await onChanged();
    } catch (issue) {
      onError(issue.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="admin-filters">
        {[
          ['active', 'В работе'],
          ['new', 'Новые'],
          ['ready', 'Готовы'],
          ['history', 'История'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? 'active' : ''}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="orders-board">
        {filtered.map((order) => {
          const status = ORDER_STATUS[order.status];
          return (
            <article key={order.id} className={`order-ticket bar-ticket ticket-${order.status}`}>
              <header>
                <div className="bar-ticket-heading">
                  <h3>
                    {order.pc_number && !tableAliases[order.table_number]
                      ? `ПК №${order.pc_number}`
                      : placeName(order.table_number)}
                  </h3>
                  <p>Заказ №{order.id}</p>
                </div>
                <span className="order-ticket-status">{status?.label || order.status}</span>
              </header>
              <p className="bar-ticket-meta">
                <time dateTime={order.created_at}>
                  {new Date(order.created_at).toLocaleString('ru-RU')}
                </time>
                {order.customer_name && <span>{order.customer_name}</span>}
                {order.paid_at && <strong>Оплачен</strong>}
              </p>
              <ul>
                {order.items.map((line) => (
                  <li key={line.id}>
                    <span className="bar-ticket-item">
                      <b className="bar-ticket-quantity">{line.quantity} ×</b>
                      <span>
                        <b>{line.name}</b>
                        <SelectionSummary selection={line} />
                      </span>
                    </span>
                    <span className="bar-ticket-price">
                      {money(Number(line.unit_price) * line.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              {order.note && <p className="order-note">{order.note}</p>}
              <footer>
                <div className="bar-ticket-total">
                  <span>Итого</span>
                  <strong>{money(orderTotal(order))}</strong>
                </div>
                {status?.next && (
                  <div className="ticket-actions">
                    <button
                      type="button"
                      className="ticket-next"
                      disabled={busy === order.id}
                      onClick={() => changeStatus(order, status.next)}
                    >
                      {busy === order.id ? 'Обновляем…' : status.action}
                    </button>
                    <button
                      type="button"
                      className="ticket-cancel"
                      disabled={busy === order.id}
                      onClick={() => setCancel(order)}
                    >
                      Отменить
                    </button>
                  </div>
                )}
              </footer>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <p className="empty-state">Здесь пока нет заказов. Новые появятся автоматически.</p>
      )}
      {cancel && (
        <Modal title={`Отменить заказ №${cancel.id}?`} onClose={() => setCancel(null)}>
          <p>Заказ перейдёт в историю с отметкой «Отменён».</p>
          <button
            className="btn"
            disabled={busy === cancel.id}
            onClick={() => changeStatus(cancel, 'cancelled')}
          >
            Подтвердить отмену
          </button>
        </Modal>
      )}
    </>
  );
}
