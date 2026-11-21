import { useId, useState } from 'react';
import { imageSource } from '../api/client';
import { MAX_ORDER_LINES, MAX_QUANTITY_PER_VARIANT, money } from '../config/orders';
import { hasOptions } from '../config/menu';
import { ItemOptionsForm, SelectionSummary } from './ItemChoices';

function CartRow({ row, canEdit, revision, onQuantityChange, onEdit, onSave }) {
  const { current, item, quantity, selection, unavailable, needsReview } = row;
  const [draft, setDraft] = useState(null);
  const optionsId = useId();
  const name = current?.name || item.name;
  const price = current?.price ?? item.price;
  const photo = current ? current.image_url : item.image_url;
  const status =
    unavailable ||
    (needsReview && 'Настройки изменились') ||
    (quantity > MAX_QUANTITY_PER_VARIANT && `Уменьшите количество до ${MAX_QUANTITY_PER_VARIANT}`);

  return (
    <li data-unavailable={Boolean(unavailable) || undefined} className="checkout-row">
      {photo && (
        <div className="checkout-media">
          <img src={imageSource(photo)} alt="" className="checkout-thumb" />
        </div>
      )}
      <div className="checkout-row-info">
        <h3>{name}</h3>
        {quantity > 1 && <small>{money(price)} за порцию</small>}
        <SelectionSummary selection={selection} />
        {status && <span className="menu-status">{status}</span>}
        {!unavailable && (hasOptions(current) || needsReview) && (
          <button
            type="button"
            className="name-button cart-edit"
            disabled={!canEdit}
            aria-expanded={photo ? undefined : Boolean(draft)}
            aria-controls={photo ? undefined : optionsId}
            onClick={() => (photo ? onEdit(row) : setDraft(draft ? null : { row, revision }))}
          >
            {draft && !photo ? 'Свернуть настройки' : 'Изменить настройки'}
          </button>
        )}
      </div>
      {!photo && !unavailable && (hasOptions(current) || needsReview) && (
        <div className="checkout-inline-options inline-options" id={optionsId} hidden={!draft}>
          {draft && (
            <ItemOptionsForm
              key={JSON.stringify([current.removable_ingredients, current.temperature_options])}
              item={current}
              row={draft.row}
              enabled={canEdit}
              onClose={() => setDraft(null)}
              onSave={(item, selection, amount) =>
                onSave(item, selection, amount, row.key, draft.revision)
              }
            />
          )}
        </div>
      )}
      <div className="checkout-row-end">
        <strong>{money(Number(price) * quantity)}</strong>
        <div className="quantity order-stepper">
          <button
            className="quantity-minus"
            type="button"
            disabled={!canEdit}
            onClick={() => onQuantityChange(item, -1, selection)}
            aria-label={`Уменьшить: ${name}`}
          />
          <output aria-label="Количество">{quantity}</output>
          <button
            className="quantity-plus"
            type="button"
            disabled={
              !canEdit ||
              quantity >= MAX_QUANTITY_PER_VARIANT ||
              Boolean(unavailable || needsReview)
            }
            onClick={() => onQuantityChange(current, 1, selection)}
            aria-label={`Добавить: ${name}`}
          />
        </div>
      </div>
    </li>
  );
}

export function Checkout({
  rows,
  total,
  quantity,
  placeLabel,
  revision,
  canEdit,
  sending,
  canSubmit,
  error,
  onBack,
  onSubmit,
  onQuantityChange,
  onEdit,
  onSave,
  onRemoveUnavailable,
}) {
  if (!rows.length) {
    return (
      <div className="order-panel order-empty order-empty-feature">
        <span className="cart-icon" aria-hidden="true" />
        <h2>Корзина пуста</h2>
        <p>Выберите блюда или напитки в меню.</p>
        <button type="button" className="order-button order-button-primary" onClick={onBack}>
          Перейти в меню
        </button>
      </div>
    );
  }

  return (
    <div className="checkout-layout">
      <div className="checkout-content">
        <section className="order-panel checkout-items" aria-labelledby="checkout-items">
          <h2 id="checkout-items">Состав заказа</h2>
          <ul>
            {rows.map((row) => (
              <CartRow
                key={row.key}
                {...{ row, canEdit, revision, onQuantityChange, onEdit, onSave }}
              />
            ))}
          </ul>
          {rows.some((row) => row.unavailable) && (
            <button
              type="button"
              className="order-button order-button-secondary"
              disabled={!canEdit}
              onClick={onRemoveUnavailable}
            >
              Убрать недоступные позиции
            </button>
          )}
        </section>
        <form
          className="order-panel checkout-fields club-form"
          aria-labelledby="checkout-fields"
          id="checkout-order"
          onSubmit={onSubmit}
        >
          <h2 id="checkout-fields">Детали заказа</h2>
          <label>
            <span>
              Ваше имя <small>необязательно</small>
            </span>
            <input name="name" maxLength={120} autoComplete="given-name" />
          </label>
          <label>
            <span>
              Пожелания к заказу <small>необязательно</small>
            </span>
            <textarea name="note" maxLength={1000} rows={3} />
          </label>
        </form>
      </div>
      <aside className="order-panel checkout-summary" aria-label="Итог заказа">
        <div className="checkout-destination">
          <span className="cart-icon" aria-hidden="true" />
          <div>
            <small>Место заказа</small>
            <b>{placeLabel}</b>
          </div>
          <span>{quantity} шт.</span>
        </div>
        <div className="checkout-total">
          <span>Итого</span>
          <strong>{money(total)}</strong>
        </div>
        <p className="checkout-payment">Для оплаты назовите бармену место, указанное в заказе.</p>
        {(rows.length > MAX_ORDER_LINES || error) && (
          <div className="checkout-feedback" role="alert">
            {rows.length > MAX_ORDER_LINES && (
              <p className="form-error">Сократите заказ до {MAX_ORDER_LINES} строк.</p>
            )}
            {error && <p className="form-error">{error}</p>}
          </div>
        )}
        <button
          type="submit"
          form="checkout-order"
          className="order-button order-button-primary"
          disabled={!canSubmit}
        >
          {sending ? 'Отправляем…' : 'Отправить заказ в бар'}
        </button>
      </aside>
    </div>
  );
}
