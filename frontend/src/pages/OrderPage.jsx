import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../api/client';
import { CheckoutDialog } from '../components/CheckoutDialog';
import { Menu } from '../components/Menu';
import { ItemDetails } from '../components/ItemChoices';
import { GuestOrders } from '../components/GuestOrders';
import { Modal } from '../components/Modal';
import {
  GUEST_REFRESH_MS,
  MAX_ORDER_LINES,
  MAX_QUANTITY_PER_VARIANT,
  money,
  TOAST_MS,
} from '../config/orders';
import {
  KITCHEN_HOURS,
  KITCHEN_TIME_ZONE_LABEL,
  selectionMatches,
  unavailableLabel,
} from '../config/menu';
import { usePolling } from '../hooks/usePolling';
import { useMagneticButtons } from '../hooks/useMagneticButtons';

const CART_STORAGE_KEY = 'space-cart';

/* ---------- Корзина в браузере ---------- */
function readCart() {
  try {
    return JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function cartKey(id, selection) {
  const ingredients = selection.removed_ingredients || [];
  if (!selection.temperature && !ingredients.length) return String(id);
  return JSON.stringify([id, selection.temperature, [...ingredients].sort()]);
}

function cartLines(cart) {
  return Object.values(cart).map(({ item, quantity, selection }) => ({
    menu_item_id: item.id,
    quantity,
    ...selection,
  }));
}

function sharedRows(snapshot, itemsById) {
  return Object.fromEntries(
    snapshot.items.map(({ menu_item_id, quantity, removed_ingredients, temperature }) => {
      const selection = { removed_ingredients, temperature };
      const item = itemsById.get(menu_item_id) || {
        id: menu_item_id,
        name: `Позиция №${menu_item_id}`,
        price: 0,
      };
      return [cartKey(item.id, selection), { item, quantity, selection }];
    }),
  );
}

export function OrderPage() {
  useMagneticButtons();
  const [items, setItems] = useState([]);
  const [localCart, setLocalCart] = useState(readCart);
  const [visitCart, setVisitCart] = useState(null);
  const [orders, setOrders] = useState([]);
  const [session, setSession] = useState(null);
  const table = session?.table_number;
  const placeLabel = `Столик ${table || '—'}`;
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
  const [details, setDetails] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [online, setOnline] = useState(false);
  const [sending, setSending] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const writingCart = useRef(false);
  const refreshAttempt = useRef(0);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const sharedCart =
    session?.visit_id && visitCart?.visit_id === session.visit_id ? visitCart : null;
  const cart = session?.visit_id
    ? sharedCart
      ? sharedRows(sharedCart, itemsById)
      : {}
    : localCart;

  useEffect(() => {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(localCart));
  }, [localCart]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const acceptCart = useCallback((snapshot) => {
    setVisitCart((previous) =>
      previous?.visit_id === snapshot.visit_id && previous.revision > snapshot.revision
        ? previous
        : snapshot,
    );
  }, []);

  /* ---------- Актуальное меню, корзина и история ---------- */
  const refresh = useCallback(async () => {
    const attempt = ++refreshAttempt.current;
    try {
      const access = await request('/api/session');
      const [current, history, snapshot] = await Promise.all([
        request('/api/menu'),
        request('/api/orders/my'),
        access.visit_id ? request('/api/cart') : null,
      ]);
      if (attempt !== refreshAttempt.current) return;
      setSession(access);
      setItems(current);
      setOrders(history);
      if (snapshot) acceptCart(snapshot);
      else setVisitCart(null);
      setOnline(true);
    } catch (issue) {
      if (attempt !== refreshAttempt.current) return;
      setOnline(false);
      if (issue.status === 401 || issue.status === 403) {
        setSession(null);
        setOrders([]);
        setItems([]);
        setVisitCart(null);
        setOrdersOpen(false);
      }
      setError(issue.message);
    }
  }, [acceptCart]);
  usePolling(refresh, GUEST_REFRESH_MS);

  /* ---------- Редактирование корзины ---------- */
  async function saveCart(next) {
    if (!session?.visit_id) {
      setLocalCart(next);
      return '';
    }
    if (!sharedCart || writingCart.current || sending) return 'Подождите, корзина обновляется.';
    writingCart.current = true;
    setCartBusy(true);
    try {
      const snapshot = await request('/api/cart', {
        method: 'PUT',
        body: {
          visit_id: sharedCart.visit_id,
          revision: sharedCart.revision,
          items: cartLines(next),
        },
      });
      acceptCart(snapshot);
      return '';
    } catch (issue) {
      if ([401, 403, 409].includes(issue.status)) await refresh();
      return issue.message;
    } finally {
      writingCart.current = false;
      setCartBusy(false);
    }
  }

  async function changeQuantity(item, delta, selection = {}) {
    const key = cartKey(item.id, selection);
    if (sending || cartBusy) return;
    if (delta > 0 && !(key in cart) && Object.keys(cart).length >= MAX_ORDER_LINES) {
      setError(`В одном заказе может быть до ${MAX_ORDER_LINES} строк.`);
      return;
    }
    const next = { ...cart };
    const changed = Math.max(0, (next[key]?.quantity || 0) + delta);
    const quantity = delta > 0 ? Math.min(MAX_QUANTITY_PER_VARIANT, changed) : changed;
    if (quantity) next[key] = { item, quantity, selection };
    else delete next[key];
    const issue = await saveCart(next);
    if (issue) (cartOpen ? setCheckoutError : setError)(issue);
  }

  async function saveSelection(item, selection, amount, previousKey) {
    if (previousKey && sharedCart && details.revision !== sharedCart.revision) {
      return 'Корзина изменилась на другом устройстве. Откройте позицию заново.';
    }
    const key = cartKey(item.id, selection);
    const next = { ...cart };
    if (previousKey) delete next[previousKey];
    const quantity = (next[key]?.quantity || 0) + amount;
    if (quantity > MAX_QUANTITY_PER_VARIANT)
      return `В одной строке может быть до ${MAX_QUANTITY_PER_VARIANT} порций.`;
    if (!previousKey && !(key in next) && Object.keys(next).length >= MAX_ORDER_LINES)
      return `В одном заказе может быть до ${MAX_ORDER_LINES} строк.`;
    next[key] = { item, quantity, selection };
    const issue = await saveCart(next);
    if (issue) return issue;
    setCheckoutError('');
    if (!previousKey) setMessage(`В корзине: ${item.name} × ${amount}`);
  }

  const rows = Object.entries(cart).map(([key, row]) => {
    const current = itemsById.get(row.item.id);
    const selection = row.selection || {};
    return {
      ...row,
      key,
      current,
      selection,
      unavailable: unavailableLabel(current),
      needsReview: current && !selectionMatches(current, selection),
    };
  });
  const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const total =
    rows.reduce(
      (sum, row) =>
        sum + Math.round(Number(row.current?.price || row.item.price) * 100) * row.quantity,
      0,
    ) / 100;
  const hasBlocked = rows.some(
    (row) => row.unavailable || row.needsReview || row.quantity > MAX_QUANTITY_PER_VARIANT,
  );
  const orderEnabled = Boolean(table && online && (!session?.visit_id || sharedCart));
  const canEdit = orderEnabled && !sending && !cartBusy;
  const canSubmit = canEdit && !hasBlocked && rows.length > 0 && rows.length <= MAX_ORDER_LINES;
  const currentDetails =
    details && (itemsById.get(details.item.id) || { ...details.item, is_available: false });

  async function removeUnavailable() {
    const availableKeys = rows.filter((row) => !row.unavailable).map((row) => row.key);
    const issue = await saveCart(Object.fromEntries(availableKeys.map((key) => [key, cart[key]])));
    setCheckoutError(issue);
  }

  /* ---------- Отправка заказа ---------- */
  function openCart() {
    setCheckoutError('');
    setCartOpen(true);
  }

  function closeCart() {
    if (!sending) setCartOpen(false);
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!canSubmit) return;
    const fields = new FormData(event.currentTarget);
    setSending(true);
    setCheckoutError('');
    try {
      const order = await request('/api/orders', {
        method: 'POST',
        body: {
          customer_name: fields.get('name') || null,
          note: fields.get('note') || null,
          ...(sharedCart
            ? { visit_id: sharedCart.visit_id, cart_revision: sharedCart.revision }
            : { items: cartLines(cart) }),
        },
      });
      if (sharedCart) acceptCart({ ...sharedCart, items: [], revision: sharedCart.revision + 1 });
      else setLocalCart({});
      refreshAttempt.current++;
      setOrders((previous) => [order, ...previous.filter((item) => item.id !== order.id)]);
      setCartOpen(false);
      setOrdersOpen(true);
      setMessage(`Заказ №${order.id} отправлен в бар`);
    } catch (issue) {
      setCheckoutError(
        issue.status && issue.status < 500
          ? issue.message
          : `${issue.message} Проверьте «Мои заказы» перед повторной отправкой.`,
      );
      if (issue.status === 401 || issue.status === 403) setSession(null);
      await refresh();
    } finally {
      setSending(false);
    }
  }

  async function finishVisit() {
    setEnding(true);
    setEndError('');
    try {
      await request('/api/session/end', { method: 'POST' });
      refreshAttempt.current++;
      setSession(null);
      setOnline(false);
      setVisitCart(null);
      setOrders([]);
      setEndOpen(false);
      setOrdersOpen(false);
      setError('');
      setMessage('Визит завершён. Новый QR появится на ПК после обновления баннера.');
    } catch (issue) {
      setEndError(issue.message);
    } finally {
      setEnding(false);
    }
  }

  return (
    <>
      <header className="hd order-header">
        <div className="w order-header-inner">
          <img src="/assets/logo.png" alt="SPACE ARENA" className="club-logo" />
          {table && <span className="order-place">{placeLabel}</span>}
        </div>
      </header>
      <main id="menuv">
        <section className="w order-intro">
          <h1 aria-label="Меню">
            {[...'Меню'].map((letter, index) => (
              <span key={letter} className="ch" style={{ '--i': index }} aria-hidden="true">
                {letter}
              </span>
            ))}
          </h1>
          <p className="order-kitchen-name">BY GULIANI</p>
          <img
            className="order-orbit order-orbit-left"
            src="/assets/dishes/hachapuriImeretian.jpg"
            alt=""
            loading="lazy"
          />
          <img
            className="order-orbit order-orbit-right"
            src="/assets/dishes/plov.jpg"
            alt=""
            loading="lazy"
          />
          {items.some((item) => item.unavailable_reason === 'kitchen_closed') ? (
            <p className="kitchen-status" role="status">
              <strong>Кухня закрыта.</strong> Доступно меню 24/7.
            </p>
          ) : (
            <p className="kitchen-status">
              Кухня {KITCHEN_HOURS} {KITCHEN_TIME_ZONE_LABEL}
            </p>
          )}
        </section>
        <div className="w">
          {!table && (error || message) && (
            <p className="club-notice">
              Для заказа откройте свежий QR или баннер на компьютере клуба.
            </p>
          )}
          {!online && !message && (table || !error) && (
            <p className="club-notice" role="status">
              {items.length
                ? 'Нет связи с баром. Оформление временно недоступно.'
                : 'Загружаем меню…'}{' '}
              <button onClick={refresh}>Обновить</button>
            </p>
          )}
        </div>
        <Menu
          items={items}
          cart={cart}
          onChange={changeQuantity}
          onDetails={(item) => setDetails({ item })}
          enabled={orderEnabled}
          busy={cartBusy || sending}
        />
      </main>
      <footer className="w club-footer">
        SPACE ARENA · Меню клуба · Вопросы по составу и аллергенам уточняйте у бармена.
      </footer>
      {table && (
        <nav className="order-dock" aria-label="Действия с заказом">
          <button
            type="button"
            className="order-dock-history"
            data-m
            onClick={() => setOrdersOpen(true)}
            aria-haspopup="dialog"
          >
            Мои заказы
            {orders.length > 0 && <span className="dock-count">{orders.length}</span>}
          </button>
          <button
            type="button"
            className="order-dock-cart"
            data-m
            onClick={openCart}
            aria-haspopup="dialog"
          >
            <span>Корзина {quantity > 0 && `(${quantity})`}</span>
            <strong>{money(total)}</strong>
          </button>
        </nav>
      )}
      {message && (
        <div className="club-toast" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="club-alert" role="alert">
          {error}
          <button aria-label="Закрыть сообщение" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}

      {ordersOpen && (
        <Modal title="Мои заказы" className="visit-dialog" onClose={() => setOrdersOpen(false)}>
          <div className="visit-toolbar">
            <p className="muted">
              {placeLabel}
              {session?.visit_id && ' · Текущий визит'}
            </p>
            <button type="button" className="quiet-button" onClick={refresh}>
              Обновить
            </button>
          </div>
          {!session?.visit_id && (
            <p className="muted visit-hint">
              Откройте свежий QR на телефоне и в меню на ПК, чтобы связать заказы и корзину.
            </p>
          )}
          <GuestOrders orders={orders} menuItems={items} />
          {session?.visit_id && (
            <button
              type="button"
              className="quiet-button visit-end"
              onClick={() => {
                setEndError('');
                setEndOpen(true);
              }}
            >
              Завершить визит
            </button>
          )}
        </Modal>
      )}
      {endOpen && (
        <Modal title="Завершить визит?" onClose={() => !ending && setEndOpen(false)}>
          <p>
            Корзина очистится и доступ закроется на всех подключённых устройствах. Отправленные
            заказы останутся у бармена.
          </p>
          {endError && (
            <p className="form-error" role="alert">
              {endError}
            </p>
          )}
          <button
            type="button"
            className="btn visit-confirm"
            disabled={ending}
            onClick={finishVisit}
          >
            {ending ? 'Завершаем…' : 'Завершить визит'}
          </button>
        </Modal>
      )}
      {cartOpen && (
        <CheckoutDialog
          placeLabel={placeLabel}
          rows={rows}
          total={total}
          canEdit={canEdit}
          sending={sending}
          canSubmit={canSubmit}
          error={checkoutError}
          onClose={closeCart}
          onSubmit={submitOrder}
          onQuantityChange={changeQuantity}
          onEdit={(row) => setDetails({ item: row.current, row, revision: sharedCart?.revision })}
          onRemoveUnavailable={removeUnavailable}
        />
      )}
      {currentDetails && (
        <ItemDetails
          key={JSON.stringify([
            currentDetails.id,
            currentDetails.removable_ingredients,
            currentDetails.temperature_options,
          ])}
          item={currentDetails}
          row={details.row}
          enabled={orderEnabled && !sending}
          onClose={() => setDetails(null)}
          onSave={saveSelection}
        />
      )}
    </>
  );
}
