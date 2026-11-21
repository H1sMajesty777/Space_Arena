import { useState } from 'react';
import { imageSource } from '../../api/client';
import { money } from '../../config/orders';
import { hasOptions, KITCHEN_HOURS } from '../../config/menu';
import { Modal } from '../Modal';

export function Catalog({ items, onEdit, api, onChanged, onError }) {
  const [search, setSearch] = useState('');
  const [stoppedOnly, setStoppedOnly] = useState(false);
  const [schedule, setSchedule] = useState('all');
  const [busy, setBusy] = useState(null);
  const [archive, setArchive] = useState(null);
  const visible = items.filter(
    (item) =>
      (!stoppedOnly || !item.is_available) &&
      (schedule === 'all' || item.all_day === (schedule === 'all_day')) &&
      `${item.name} ${item.category}`
        .toLocaleLowerCase('ru')
        .includes(search.toLocaleLowerCase('ru')),
  );

  async function toggle(item) {
    setBusy(item.id);
    try {
      await api(`/api/admin/menu/${item.id}/availability`, {
        method: 'PATCH',
        body: { is_available: !item.is_available },
      });
      await onChanged();
    } catch (issue) {
      onError(issue.message);
    } finally {
      setBusy(null);
    }
  }

  async function archiveItem() {
    setBusy(archive.id);
    try {
      await api(`/api/admin/menu/${archive.id}`, { method: 'DELETE' });
      setArchive(null);
      await onChanged();
    } catch (issue) {
      onError(issue.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="catalog-toolbar">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Найти позицию или раздел…"
          aria-label="Поиск позиций"
        />
        <select
          aria-label="Расписание позиций"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
        >
          <option value="all">Все позиции</option>
          <option value="all_day">Круглосуточные</option>
          <option value="kitchen">Кухня Guliani</option>
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={stoppedOnly}
            onChange={(event) => setStoppedOnly(event.target.checked)}
          />{' '}
          Только стоп-лист
        </label>
      </div>
      <div className="catalog-list">
        {visible.map((item) => (
          <article
            key={item.id}
            className={`catalog-item ${!item.is_available ? 'catalog-stopped' : ''}`}
          >
            <button
              className="catalog-photo"
              onClick={() => onEdit(item)}
              aria-label={`Изменить фото: ${item.name}`}
            >
              {item.image_url ? (
                <img src={imageSource(item.image_url)} alt={item.name} loading="lazy" />
              ) : (
                <span>+ фото</span>
              )}
            </button>
            <div className="catalog-title">
              <small>
                {item.category}
                {item.all_day ? ' · 24/7' : ` · ${KITCHEN_HOURS}`}
              </small>
              <h3>{item.name}</h3>
              <span>{money(item.price)}</span>
              {item.is_hit && <b className="catalog-hit-label">✦ Хит</b>}
              {hasOptions(item) && (
                <small className="catalog-options">Есть настройки для гостя</small>
              )}
              {!item.is_available && <b className="stop-label">Временно нет</b>}
            </div>
            <div className="catalog-actions">
              <button
                className="switch-button"
                aria-pressed={!item.is_available}
                disabled={busy === item.id}
                onClick={() => toggle(item)}
              >
                {item.is_available ? 'В стоп-лист' : 'Вернуть в меню'}
              </button>
              <button className="quiet-button" onClick={() => onEdit(item)}>
                Изменить
              </button>
              <button className="quiet-button" onClick={() => setArchive(item)}>
                В архив
              </button>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && <p className="empty-state">Нет подходящих позиций.</p>}
      {archive && (
        <Modal title="Убрать позицию из меню?" onClose={() => setArchive(null)}>
          <p>
            «{archive.name}» будет скрыта из меню. В прошлых заказах она сохранится. Для временной
            недоступности используйте стоп-лист.
          </p>
          <button className="btn" disabled={busy === archive.id} onClick={archiveItem}>
            Убрать в архив
          </button>
        </Modal>
      )}
    </>
  );
}
