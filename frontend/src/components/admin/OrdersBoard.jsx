import { useState } from 'react';
import { money, orderTotal, ORDER_STATUS } from '../../config/orders';
import { Modal } from '../Modal';
import { SelectionSummary } from '../ItemChoices';

export function OrdersBoard({ orders, api, onChanged, onError }) {
  const [filter, setFilter] = useState('active');
  const [busy, setBusy] = useState(null);
  const [cancel, setCancel] = useState(null);
  const filtered = orders.filter((order) => {
    if (filter === 'active') return !['served', 'cancelled'].includes(order.status);
    if (filter === 'history') return ['served', 'cancelled'].includes(order.status);
    return order.status === filter;
  });

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
            className={filter === value ? 'active' : ''}
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
            <article key={order.id} className={`order-ticket gl ticket-${order.status}`}>
              <header>
                <div>
                  <p className="eb">ЗАКАЗ №{order.id}</p>
                  <h3>
                    {order.pc_number ? `ПК №${order.pc_number}` : `Столик ${order.table_number}`}
                  </h3>
                </div>
                <span className={`status status-${order.status}`}>{status?.label}</span>
              </header>
              <p className="muted">
                {new Date(order.created_at).toLocaleString('ru-RU')}
                {order.customer_name && ` · ${order.customer_name}`}
              </p>
              <ul>
                {order.items.map((line) => (
                  <li key={line.id}>
                    <span>
                      <b>{line.quantity} ×</b> {line.name}
                      <SelectionSummary selection={line} />
                    </span>
                    <span>{money(Number(line.unit_price) * line.quantity)}</span>
                  </li>
                ))}
              </ul>
              {order.note && <p className="order-note">{order.note}</p>}
              <footer>
                <span>Итого</span>
                <strong>{money(orderTotal(order))}</strong>
              </footer>
              {status?.next && (
                <div className="ticket-actions">
                  <button
                    className="btn"
                    disabled={busy === order.id}
                    onClick={() => changeStatus(order, status.next)}
                  >
                    {busy === order.id ? 'Обновляем…' : status.action}
                  </button>
                  <button
                    className="quiet-button"
                    disabled={busy === order.id}
                    onClick={() => setCancel(order)}
                  >
                    Отменить
                  </button>
                </div>
              )}
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
