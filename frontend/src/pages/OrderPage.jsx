import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../api/client';
import { Checkout } from '../components/Checkout';
import { Menu } from '../components/Menu';
import { ItemDetails } from '../components/ItemChoices';
import { GuestOrders } from '../components/GuestOrders';
import { MenuBrand, SiteBrand } from '../components/SiteBrand';
import { placeName } from '../config/floor';
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
import { useOrderView } from '../hooks/useOrderView';

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
  const header = useRef(null);
  useEffect(() => {
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty('--order-header-height', `${header.current.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(header.current);
    update();
    return () => {
      observer.disconnect();
      root.style.removeProperty('--order-header-height');
    };
  }, []);
  const { view, navigate, back, progress } = useOrderView();
  const [items, setItems] = useState([]);
  const [localCart, setLocalCart] = useState(readCart);
  const [visitCart, setVisitCart] = useState(null);
  const [orders, setOrders] = useState([]);
  const [session, setSession] = useState(null);
  const table = session?.table_number;
  const placeLabel = placeName(table);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [accessError, setAccessError] = useState('');
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
      setAccessError('');
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
        setLocalCart({});
        setMessage('');
        setError('');
        setAccessError(issue.message);
      } else {
        setError(issue.message);
      }
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
    if (issue) (view.name === 'cart' ? setCheckoutError : setError)(issue);
  }

  async function saveSelection(item, selection, amount, previousKey, editRevision) {
    if (previousKey && sharedCart && editRevision !== sharedCart.revision) {
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
  const editingRow = view.name === 'item' && view.rowKey;
  const detailRow = editingRow && rows.find((row) => row.key === editingRow);
  const requestedItem = view.name === 'item' && itemsById.get(view.itemId);
  const detailItem = requestedItem?.image_url ? requestedItem : null;

  async function removeUnavailable() {
    const availableKeys = rows.filter((row) => !row.unavailable).map((row) => row.key);
    const issue = await saveCart(Object.fromEntries(availableKeys.map((key) => [key, cart[key]])));
    setCheckoutError(issue);
  }

  /* ---------- Отправка заказа ---------- */
  function openCart() {
    setCheckoutError('');
    navigate('cart');
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
      navigate('orders', { replace: true });
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

  const shopView =
    accessError ||
    (view.name === 'item' && !detailItem && (table || online)) ||
    (!table && view.name !== 'item')
      ? 'menu'
      : view.name;
  const kitchenClosed = items.some((item) => item.unavailable_reason === 'kitchen_closed');
  const menuAction = () => back('menu');
  const orderAction = () => navigate('orders');
  const cartAction = shopView === 'cart' ? undefined : openCart;
  const backFromItem = () => back(editingRow ? 'cart' : 'menu');

  return (
    <>
      <div id="pg" ref={progress} aria-hidden="true" />
      <header className="hd order-header" ref={header}>
        <div className="w hi">
          <a className="header-brand" href="/#home" aria-label="SPACE ARENA — главная">
            <SiteBrand src="/assets/logo.png" alt="SPACE ARENA" />
          </a>
          <nav aria-label="Основная навигация">
            <a
              href="#menu"
              aria-current={shopView === 'menu' ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                if (shopView === 'menu') window.scrollTo({ top: 0 });
                else menuAction();
              }}
            >
              Меню
            </a>
          </nav>
          {table && (
            <>
              <button className="btn s o header-menu" onClick={orderAction}>
                Мои заказы {orders.length > 0 && <span>{orders.length}</span>}
              </button>
              <button className="btn s header-booking order-header-cart" onClick={cartAction}>
                Корзина {quantity > 0 && <span>{quantity}</span>}
              </button>
            </>
          )}
        </div>
      </header>
      <main id="menuv" hidden={shopView !== 'menu'} tabIndex={-1}>
        <section className="mh w order-intro">
          <MenuBrand src="/assets/logo.png" />
          <h1 className="sp gr" tabIndex={-1} aria-label="Меню">
            {[...'Меню'].map((letter, index) => (
              <span key={letter} className="ch" style={{ '--i': index }} aria-hidden="true">
                {letter}
              </span>
            ))}
          </h1>
          <p className="by">BY GULIANI</p>
          <div className="tg">
            {table && <span>{placeLabel}</span>}
            <span>
              {kitchenClosed
                ? 'Кухня закрыта · Доступно меню 24/7'
                : `Кухня ${KITCHEN_HOURS} ${KITCHEN_TIME_ZONE_LABEL}`}
            </span>
          </div>
          <img className="fd a" src="/assets/dishes/hachapuriImeretian.jpg" alt="" />
          <img className="fd b" src="/assets/dishes/plov.jpg" alt="" />
          <img className="fd c" src="/assets/dishes/caesar.jpg" alt="" />
        </section>
        {(!table && accessError) || (!online && !accessError) ? (
          <div className="w">
            <p className="order-notice" role="status">
              {accessError ||
                (error || items.length
                  ? 'Нет связи с баром. Оформление временно недоступно.'
                  : 'Загружаем меню…')}
              {!accessError && (
                <button
                  type="button"
                  className="order-button order-button-secondary"
                  onClick={refresh}
                >
                  Обновить
                </button>
              )}
            </p>
          </div>
        ) : null}
        <Menu
          items={items}
          cart={cart}
          onChange={changeQuantity}
          onDetails={(item) => item.image_url && navigate('item', { itemId: item.id })}
          onSave={saveSelection}
          enabled={orderEnabled}
          busy={cartBusy || sending}
          ready={online || items.length > 0}
        />
        <footer className="w order-footer">
          <span>SPACE ARENA</span>
          <p>Вопросы по составу и аллергенам уточняйте у бармена.</p>
          <button type="button" onClick={() => window.scrollTo({ top: 0 })}>
            Наверх ↑
          </button>
        </footer>
      </main>

      {table && (shopView === 'cart' || editingRow) && (
        <main className="w order-subpage checkout-page" hidden={shopView !== 'cart'} tabIndex={-1}>
          <OrderHeading title="Корзина" label={placeLabel} backLabel="К меню" onBack={menuAction} />
          {!online && (
            <p className="order-notice" role="status">
              Нет связи с баром. Оформление временно недоступно.
            </p>
          )}
          <Checkout
            rows={rows}
            total={total}
            quantity={quantity}
            placeLabel={placeLabel}
            revision={sharedCart?.revision}
            canEdit={canEdit}
            sending={sending}
            canSubmit={canSubmit}
            error={checkoutError}
            onBack={menuAction}
            onSubmit={submitOrder}
            onQuantityChange={changeQuantity}
            onSave={saveSelection}
            onEdit={(row) =>
              navigate('item', {
                itemId: row.current.id,
                rowKey: row.key,
                editRevision: sharedCart?.revision,
              })
            }
            onRemoveUnavailable={removeUnavailable}
          />
        </main>
      )}

      {shopView === 'orders' && (
        <main className="w order-subpage order-history-page" tabIndex={-1}>
          <OrderHeading
            title="Мои заказы"
            label={placeLabel}
            backLabel="К меню"
            onBack={menuAction}
            action={
              <button
                type="button"
                className="order-button order-button-secondary"
                onClick={refresh}
              >
                Обновить
              </button>
            }
          />
          {!session?.visit_id && (
            <p className="order-notice">
              Чтобы связать заказы на телефоне и ПК, откройте свежий QR на обоих устройствах.
            </p>
          )}
          {orders.length > 0 ? (
            <>
              {orders.some((order) => order.status !== 'cancelled') && (
                <p className="order-notice order-history-note">
                  Для оплаты назовите бармену место, указанное в заказе.
                </p>
              )}
              <GuestOrders orders={orders} menuItems={items} />
            </>
          ) : (
            <div className="order-panel order-empty order-empty-feature">
              <span className="history-icon" aria-hidden="true" />
              <h2>Заказов пока нет</h2>
              <p>Здесь появятся отправленные заказы и их статусы.</p>
              <button
                type="button"
                className="order-button order-button-primary"
                onClick={menuAction}
              >
                Перейти в меню
              </button>
            </div>
          )}
        </main>
      )}

      {shopView === 'item' && (
        <main className="w order-subpage item-subpage" tabIndex={-1}>
          <OrderHeading
            title={detailItem?.name || (online ? 'Позиция недоступна' : 'Загружаем позицию…')}
            label={detailItem?.category}
            backLabel={editingRow ? 'К корзине' : 'К меню'}
            onBack={backFromItem}
          />
          {detailItem && (
            <ItemDetails
              key={JSON.stringify([
                detailItem.id,
                view.rowKey,
                detailItem.removable_ingredients,
                detailItem.temperature_options,
              ])}
              item={detailItem}
              row={detailRow}
              enabled={orderEnabled && !sending}
              onClose={backFromItem}
              onSave={(item, selection, count) =>
                saveSelection(item, selection, count, view.rowKey, view.editRevision)
              }
            />
          )}
        </main>
      )}

      {table && (shopView !== 'cart' || !rows.length) && (
        <nav className="order-dock" aria-label="Действия с заказом">
          <button
            type="button"
            onClick={menuAction}
            aria-current={shopView === 'menu' ? 'page' : undefined}
          >
            <span className="menu-icon" aria-hidden="true" />
            Меню
          </button>
          <button
            type="button"
            onClick={orderAction}
            aria-current={shopView === 'orders' ? 'page' : undefined}
          >
            <span className="history-icon" aria-hidden="true" />
            Мои заказы
          </button>
          <button
            type="button"
            className="order-dock-cart"
            onClick={cartAction}
            aria-current={shopView === 'cart' ? 'page' : undefined}
          >
            <span className="cart-icon" aria-hidden="true" />
            <span>Корзина</span>
            {quantity > 0 && <strong>{money(total)}</strong>}
          </button>
        </nav>
      )}
      {message && (
        <div className="order-toast" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="order-toast order-error" role="alert">
          {error}
          <button type="button" aria-label="Закрыть сообщение" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
    </>
  );
}

function OrderHeading({ title, label, backLabel, onBack, action }) {
  return (
    <div className="order-page-heading">
      <button type="button" className="order-back" onClick={onBack}>
        <span aria-hidden="true">←</span> {backLabel}
      </button>
      <div className="order-page-title">
        <div>
          {label && <p>{label}</p>}
          <h1 className="gr" tabIndex={-1}>
            {title}
          </h1>
        </div>
        {action}
      </div>
    </div>
  );
}
