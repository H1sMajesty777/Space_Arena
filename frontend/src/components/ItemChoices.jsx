import { useState } from 'react';
import { imageSource } from '../api/client';
import {
  KITCHEN_HOURS,
  selectionMatches,
  TEMPERATURE_LABELS,
  unavailableLabel,
} from '../config/menu';
import { MAX_QUANTITY_PER_VARIANT, money } from '../config/orders';
import { Modal } from './Modal';

export function SelectionSummary({ selection }) {
  const temperature = TEMPERATURE_LABELS[selection.temperature];
  const ingredients = selection.removed_ingredients || [];
  if (!ingredients.length && !temperature) return null;
  return (
    <span className="selection-summary">
      {ingredients.length > 0 && <span>Убрать: {ingredients.join(', ')}</span>}
      {temperature && <span>Подача: {temperature.toLocaleLowerCase('ru')}</span>}
    </span>
  );
}

export function ItemDetails({ item, row, enabled, onClose, onSave }) {
  const ingredients = item.removable_ingredients || [];
  const temperatures = item.temperature_options || [];
  const [removed, setRemoved] = useState(() =>
    ingredients.filter((ingredient) => row?.selection?.removed_ingredients?.includes(ingredient)),
  );
  const [temperature, setTemperature] = useState(
    temperatures.includes(row?.selection?.temperature)
      ? row.selection.temperature
      : temperatures.length === 1
        ? temperatures[0]
        : null,
  );
  const [quantity, setQuantity] = useState(row?.quantity || 1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selection = { removed_ingredients: removed, temperature };
  const unavailable = unavailableLabel(item);

  async function save(event) {
    event.preventDefault();
    if (saving || !enabled || unavailable || !selectionMatches(item, selection)) return;
    setSaving(true);
    setError('');
    try {
      const issue = await onSave(item, selection, quantity, row?.key);
      if (issue) setError(issue);
      else onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={item.name} onClose={() => !saving && onClose()}>
      {item.image_url && (
        <img className="detail-image" src={imageSource(item.image_url)} alt={item.name} />
      )}
      {item.description && <p className="detail-description">{item.description}</p>}
      {!item.all_day && <p className="muted">Кухня Guliani · {KITCHEN_HOURS}</p>}
      {unavailable && (
        <p className="form-error" role="status">
          {unavailable}
        </p>
      )}
      {enabled && !unavailable && (
        <form className="club-form" onSubmit={save}>
          {ingredients.length > 0 && (
            <fieldset className="choice-group">
              <legend>Убрать из блюда</legend>
              <div className="choice-options">
                {ingredients.map((ingredient) => (
                  <label className="choice-option" key={ingredient}>
                    <input
                      type="checkbox"
                      checked={removed.includes(ingredient)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setRemoved((current) =>
                          checked
                            ? [...current, ingredient]
                            : current.filter((value) => value !== ingredient),
                        );
                      }}
                    />
                    <span>{ingredient}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {temperatures.length > 0 && (
            <fieldset className="choice-group">
              <legend>Температура напитка</legend>
              <div className="choice-options">
                {temperatures.map((value) => (
                  <label className="choice-option" key={value}>
                    <input
                      type="radio"
                      name="temperature"
                      value={value}
                      checked={temperature === value}
                      onChange={() => setTemperature(value)}
                      required
                    />
                    <span>{TEMPERATURE_LABELS[value]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="detail-actions">
            <div className="quantity">
              <button
                type="button"
                disabled={quantity <= 1}
                onClick={() => setQuantity(quantity - 1)}
                aria-label="Уменьшить количество"
              >
                −
              </button>
              <output aria-label="Количество">{quantity}</output>
              <button
                type="button"
                disabled={quantity >= MAX_QUANTITY_PER_VARIANT}
                onClick={() => setQuantity(quantity + 1)}
                aria-label="Увеличить количество"
              >
                +
              </button>
            </div>
            <strong>{money(Number(item.price) * quantity)}</strong>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn" data-m disabled={saving || !selectionMatches(item, selection)}>
            {saving ? 'Сохраняем…' : row ? 'Сохранить изменения' : 'Добавить в корзину'}
          </button>
        </form>
      )}
    </Modal>
  );
}
