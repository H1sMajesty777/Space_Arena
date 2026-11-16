import { imageSource } from '../api/client';
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
                <h3>{ORDER_STATUS[order.status]?.label}</h3>
              </div>
            </header>
            <div className="guest-ticket-summary">
              {photos.length > 0 && (
                <div className="order-photos">
                  {photos.map((photo) => (
                    <div className="order-photo" key={photo.id}>
                      <img src={imageSource(photo.url)} alt={photo.name} loading="lazy" />
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
