import { imageSource } from '../api/client';
import { placeName } from '../config/floor';
import { money, orderTotal, ORDER_STATUS } from '../config/orders';
import { SelectionSummary } from './ItemChoices';

const steps = [
  ['new', 'Отправлен'],
  ['accepted', 'Принят'],
  ['preparing', 'Готовится'],
  ['ready', 'Готов'],
  ['served', 'Выдан'],
];

export function GuestOrders({ orders, menuItems = [] }) {
  if (!orders.length) return <p className="empty-state">Здесь появятся отправленные заказы.</p>;
  return (
    <div className="order-list">
      {orders.map((order) => {
        const stage = steps.findIndex(([status]) => status === order.status);
        const photos = order.items
          .flatMap((item) => {
            const url =
              item.image_url || menuItems.find((row) => row.id === item.menu_item_id)?.image_url;
            return url ? [{ id: item.id, name: item.name, url }] : [];
          })
          .slice(0, 3);
        return (
          <article className={`order-ticket guest-ticket ticket-${order.status}`} key={order.id}>
            <header className="guest-ticket-heading">
              <div>
                <span className="guest-ticket-place">{placeName(order.table_number)}</span>
                <h2>Заказ №{order.id}</h2>
              </div>
              <span className="order-ticket-status">
                {steps[stage]?.[1] || ORDER_STATUS[order.status]?.label || order.status}
              </span>
            </header>
            {stage !== -1 && (
              <ol className="guest-order-progress" aria-label="Этапы заказа">
                {steps.map(([status, label], index) => (
                  <li
                    key={status}
                    aria-current={index === stage ? 'step' : undefined}
                    data-complete={index < stage || undefined}
                  >
                    <span aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ol>
            )}
            <div className="guest-ticket-summary">
              {photos.length > 0 && (
                <div className="order-photos" aria-hidden="true">
                  {photos.map((photo) => (
                    <div className="order-photo" key={photo.id}>
                      <img src={imageSource(photo.url)} alt="" loading="lazy" />
                    </div>
                  ))}
                </div>
              )}
              <div className="guest-ticket-facts">
                <strong>{money(orderTotal(order))}</strong>
                <time dateTime={order.created_at}>
                  {new Date(order.created_at).toLocaleString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            </div>
            <ul>
              {order.items.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.name} × {item.quantity}
                    <SelectionSummary selection={item} />
                  </span>
                  <b>{money(Number(item.unit_price) * item.quantity)}</b>
                </li>
              ))}
            </ul>
            {order.note && <p className="order-note">{order.note}</p>}
          </article>
        );
      })}
    </div>
  );
}
