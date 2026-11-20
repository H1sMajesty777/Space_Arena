import { imageSource } from '../api/client';
import { placeName } from '../config/floor';
import { money, orderTotal, ORDER_STATUS } from '../config/orders';
import { SelectionSummary } from './ItemChoices';

export function GuestOrders({ orders, menuItems = [] }) {
  if (!orders.length) return <p className="empty-state">Здесь появятся отправленные заказы.</p>;
  return (
    <div className="order-list">
      {orders.map((order) => {
        const photos = order.items
          .flatMap((item) => {
            const url =
              item.image_url || menuItems.find((row) => row.id === item.menu_item_id)?.image_url;
            return url ? [{ id: item.id, name: item.name, url }] : [];
          })
          .slice(0, 4);
        return (
          <article className={`order-ticket guest-ticket ticket-${order.status}`} key={order.id}>
            <header className="guest-ticket-heading">
              <div>
                <small>ЗАКАЗ №{order.id}</small>
                <h2>{ORDER_STATUS[order.status]?.label || order.status}</h2>
              </div>
              <span className="guest-ticket-place">{placeName(order.table_number)}</span>
            </header>
            <div className="guest-ticket-summary">
              <div className="order-photos">
                {Array.from({ length: 4 }, (_, index) => {
                  const photo = photos[index];
                  return (
                    <div className="order-photo" key={photo?.id ?? `empty-${index}`}>
                      {photo ? (
                        <img src={imageSource(photo.url)} alt={photo.name} loading="lazy" />
                      ) : (
                        <span aria-hidden="true">✦</span>
                      )}
                    </div>
                  );
                })}
              </div>
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
