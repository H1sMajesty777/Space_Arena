import { MAX_ORDER_LINES, MAX_QUANTITY_PER_VARIANT, money } from '../config/orders';
import { hasOptions } from '../config/menu';
import { SelectionSummary } from './ItemChoices';
import { Modal } from './Modal';

function CartRow({ row, canEdit, onQuantityChange, onEdit }) {
  const { current, item, quantity, selection, unavailable, needsReview } = row;
  const status =
    unavailable ||
    (needsReview && 'Настройки изменились') ||
    (quantity > MAX_QUANTITY_PER_VARIANT && `Уменьшите количество до ${MAX_QUANTITY_PER_VARIANT}`);

  return (
    <div className="cart-row">
      <div>
        <b>{current?.name || item.name}</b>
        <small>
          {money(current?.price || item.price)} × {quantity}
        </small>
        <SelectionSummary selection={selection} />
        {status && <span className="stop-label">{status}</span>}
        {!unavailable && (hasOptions(current) || needsReview) && (
          <button
            type="button"
            className="name-button cart-edit"
            disabled={!canEdit}
            onClick={() => onEdit(row)}
          >
            Изменить настройки
          </button>
        )}
      </div>
      <div className="quantity">
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => onQuantityChange(item, -1, selection)}
          aria-label="Уменьшить"
        >
          −
        </button>
        <output>{quantity}</output>
        <button
          type="button"
          disabled={
            !canEdit || quantity >= MAX_QUANTITY_PER_VARIANT || Boolean(unavailable || needsReview)
          }
          onClick={() => onQuantityChange(current, 1, selection)}
          aria-label="Увеличить"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function CheckoutDialog({
  placeLabel,
  rows,
  total,
  canEdit,
  sending,
  canSubmit,
  error,
  onClose,
  onSubmit,
  onQuantityChange,
  onEdit,
  onRemoveUnavailable,
}) {
  const title = `Заказ · ${placeLabel}`;

  if (!rows.length) {
    return (
      <Modal title={title} onClose={onClose}>
        <p className="empty-state">Выберите блюда в меню — они появятся здесь.</p>
      </Modal>
    );
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="club-form" onSubmit={onSubmit}>
        {rows.map((row) => (
          <CartRow
            key={row.key}
            row={row}
            canEdit={canEdit}
            onQuantityChange={onQuantityChange}
            onEdit={onEdit}
          />
        ))}
        {rows.some((row) => row.unavailable) && (
          <button
            type="button"
            className="quiet-button"
            disabled={!canEdit}
            onClick={onRemoveUnavailable}
          >
            Убрать недоступные позиции
          </button>
        )}
        <label>
          Ваше имя <small>необязательно</small>
          <input name="name" maxLength="120" autoComplete="given-name" />
        </label>
        <label>
          Пожелания к заказу <small>необязательно</small>
          <textarea name="note" maxLength="1000" rows="3" />
        </label>
        <div className="checkout-total">
          <span>Итого</span>
          <strong>{money(total)}</strong>
        </div>
        {rows.length > MAX_ORDER_LINES && (
          <p className="form-error" role="alert">
            Сократите заказ до {MAX_ORDER_LINES} строк.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" data-m disabled={!canSubmit}>
          {sending ? 'Отправляем…' : 'Отправить заказ в бар'}
        </button>
        <p className="muted">Оплата в клубе. Статус заказа появится в «Моих заказах».</p>
      </form>
    </Modal>
  );
}
