import { useEffect, useState } from 'react';
import { imageSource } from '../../api/client';
import { KITCHEN_HOURS, TEMPERATURE_LABELS } from '../../config/menu';
import { Modal } from '../Modal';

/* Фотография загружается отдельно; форма сохраняет полученный серверный адрес. */
export function ItemEditor({ item, categories, api, onSaved, onClose }) {
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(imageSource(item?.image_url));
  const [removePhoto, setRemovePhoto] = useState(false);
  const [isHit, setIsHit] = useState(Boolean(item?.is_hit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasPhoto = !removePhoto && Boolean(photo || item?.image_url);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function choosePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setError('Выберите фото размером до 12 МБ.');
      return;
    }
    setError('');
    setRemovePhoto(false);
    setPhoto(file);
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const ingredients = fields
      .get('removable_ingredients')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (ingredients.length > 20 || ingredients.some((value) => value.length > 60)) {
      setError('Укажите до 20 ингредиентов, до 60 символов в каждой строке.');
      return;
    }
    if (
      new Set(ingredients.map((value) => value.toLocaleLowerCase('ru'))).size !== ingredients.length
    ) {
      setError('Укажите каждый ингредиент один раз.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let imageUrl = removePhoto ? null : item?.image_url || null;
      if (photo && !removePhoto) {
        const upload = new FormData();
        upload.append('file', photo);
        const result = await api('/api/admin/uploads', { method: 'POST', body: upload });
        imageUrl = result.image_url;
      }
      const body = {
        name: fields.get('name').trim(),
        description: fields.get('description').trim() || null,
        category: fields.get('category').trim(),
        price: fields.get('price'),
        all_day: fields.get('schedule') === 'all_day',
        is_hit: isHit && Boolean(imageUrl),
        removable_ingredients: ingredients,
        temperature_options: fields.getAll('temperature_options'),
        image_url: imageUrl,
      };
      await api(item ? `/api/admin/menu/${item.id}` : '/api/admin/menu', {
        method: item ? 'PATCH' : 'POST',
        body,
      });
      onSaved();
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={item ? 'Изменить позицию' : 'Новая позиция'} onClose={() => !busy && onClose()}>
      <form className="club-form" onSubmit={save}>
        <div className="photo-editor">
          {preview && !removePhoto ? (
            <img
              src={preview}
              alt="Фото позиции"
              onLoad={(event) => {
                event.currentTarget.style.opacity = '1';
              }}
              onError={(event) => {
                event.currentTarget.style.opacity = '0';
              }}
            />
          ) : (
            <span>Фото блюда или напитка</span>
          )}
        </div>
        <div className="photo-buttons">
          <label className="upload-button">
            📷 Снять фото
            <input
              type="file"
              accept="image/*,.heic,.heif"
              capture="environment"
              onChange={choosePhoto}
              disabled={busy}
            />
          </label>
          <label className="upload-button">
            Выбрать из галереи
            <input
              type="file"
              accept="image/*,.heic,.heif"
              onChange={choosePhoto}
              disabled={busy}
            />
          </label>
          {(preview || photo) && !removePhoto && (
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                setRemovePhoto(true);
                setIsHit(false);
                setPhoto(null);
                setPreview('');
              }}
            >
              Убрать фото
            </button>
          )}
        </div>
        {photo && (
          <p className="muted">
            Выбрано: {photo.name}. Если планшет не показывает HEIC, превью появится после
            сохранения.
          </p>
        )}
        <label className="item-hit-toggle">
          <input
            type="checkbox"
            role="switch"
            aria-labelledby="item-hit-label"
            aria-describedby="item-hit-hint"
            disabled={busy || !hasPhoto}
            checked={isHit}
            onChange={(event) => setIsHit(event.target.checked)}
          />
          <span>
            <strong id="item-hit-label">Хит</strong>
            <small id="item-hit-hint">
              {hasPhoto
                ? 'Фото появится под разделом в гостевом меню.'
                : 'Добавьте фото, чтобы сделать позицию хитом.'}
            </small>
          </span>
        </label>
        <label>
          Название
          <input name="name" defaultValue={item?.name || ''} maxLength="160" required />
        </label>
        <label>
          Раздел меню
          <input
            name="category"
            list="menu-categories"
            defaultValue={item?.category || 'Бар · Напитки'}
            maxLength="100"
            required
          />
        </label>
        <datalist id="menu-categories">
          {[...new Set([...categories, 'Бар · Напитки', 'Бар · Снеки'])].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="form-columns">
          <label>
            Цена, ₽
            <input
              name="price"
              type="number"
              min="0.01"
              max="99999999.99"
              step="0.01"
              inputMode="decimal"
              defaultValue={item?.price || ''}
              required
            />
          </label>
          <label>
            Приём заказов
            <select name="schedule" defaultValue={item?.all_day === false ? 'kitchen' : 'all_day'}>
              <option value="all_day">Круглосуточно · 24/7</option>
              <option value="kitchen">Кухня Guliani · {KITCHEN_HOURS}</option>
            </select>
          </label>
        </div>
        <label>
          Описание, состав, объём
          <textarea
            name="description"
            rows="3"
            defaultValue={item?.description || ''}
            placeholder="Например: лимонад, 330 мл"
          />
        </label>
        <label>
          Ингредиенты, которые гость может убрать
          <small>По одному на строку. Оставьте поле пустым, если состав фиксированный.</small>
          <textarea
            name="removable_ingredients"
            rows="3"
            defaultValue={item?.removable_ingredients?.join('\n') || ''}
            placeholder={'Лук\nСоус'}
          />
        </label>
        <fieldset className="choice-group">
          <legend>Температура напитка</legend>
          <div className="choice-options">
            {Object.entries(TEMPERATURE_LABELS).map(([value, label]) => (
              <label className="choice-option" key={value}>
                <input
                  type="checkbox"
                  name="temperature_options"
                  value={value}
                  defaultChecked={item?.temperature_options?.includes(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить позицию'}
        </button>
      </form>
    </Modal>
  );
}
