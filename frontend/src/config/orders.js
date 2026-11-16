import { orders } from '../../../backend/club-settings.json';

export const MAX_ORDER_LINES = orders.max_lines;
export const MAX_QUANTITY_PER_VARIANT = orders.max_quantity_per_variant;

// Интервалы интерфейса в миллисекундах.
export const GUEST_REFRESH_MS = 5000;
export const BAR_REFRESH_MS = 10000;
export const TOAST_MS = 5000;

/* Статусы и подписи кнопок. Переходы дополнительно проверяет сервер. */
export const ORDER_STATUS = {
  new: { label: 'Новый', next: 'accepted', action: 'Принять заказ' },
  accepted: { label: 'Принят', next: 'preparing', action: 'Начать готовить' },
  preparing: { label: 'Готовится', next: 'ready', action: 'Заказ готов' },
  ready: { label: 'Готов', next: 'served', action: 'Выдать гостю' },
  served: { label: 'Выдан' },
  cancelled: { label: 'Отменён' },
};

const rubles = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export const money = (value) => rubles.format(Number(value));

export const orderTotal = (order) =>
  order.items.reduce(
    (sum, item) => sum + Math.round(Number(item.unit_price) * 100) * item.quantity,
    0,
  ) / 100;
