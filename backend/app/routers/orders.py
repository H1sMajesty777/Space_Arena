from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..kitchen import KITCHEN_CLOSES, KITCHEN_OPENS, KITCHEN_TIME_ZONE_LABEL, kitchen_is_open
from ..models import MenuItem, Order, OrderItem
from ..schemas import OrderCreate, OrderLineCreate, OrderOut, OrderStatusUpdate
from ..security import require_admin
from ..visits import check_cart_revision, get_visit
from .access import check_origin, rate_limit, require_guest

router = APIRouter()

GUEST_HISTORY_MINUTES = 15
MAX_HISTORY_RESULTS = 500
ORDER_REQUEST_LIMIT = 20
ORDER_REQUEST_WINDOW_SECONDS = 60
ORDER_TRANSITIONS = {
    "new": {"accepted", "cancelled"},
    "accepted": {"preparing", "cancelled"},
    "preparing": {"ready", "cancelled"},
    "ready": {"served", "cancelled"},
    "served": set(),
    "cancelled": set(),
}


def build_order_items(lines: list[OrderLineCreate], menu: dict[int, MenuItem]) -> list[OrderItem]:
    """Проверяет варианты и сохраняет состав каждой строки на момент заказа."""
    items = []
    variants = set()
    for line in lines:
        item = menu[line.menu_item_id]
        allowed_temperatures = item.temperature_options or [None]
        removed = frozenset(line.removed_ingredients)
        if line.temperature not in allowed_temperatures or not removed.issubset(item.removable_ingredients):
            raise HTTPException(409, f"Проверьте настройки позиции «{item.name}» в корзине")

        variant = line.variant()
        if variant in variants:
            raise HTTPException(422, "Объедините позиции с одинаковыми настройками в одну строку")
        variants.add(variant)
        items.append(OrderItem(
            menu_item_id=item.id,
            name=item.name,
            image_url=item.image_url,
            unit_price=item.price,
            quantity=line.quantity,
            removed_ingredients=line.removed_ingredients,
            temperature=line.temperature,
        ))
    return items


# Заказы гостя

@router.get("/api/orders/my", response_model=list[OrderOut])
async def my_orders(session: dict = Depends(require_guest), db: AsyncSession = Depends(get_db)):
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=GUEST_HISTORY_MINUTES)
    owner = (
        Order.visit_id == session["visit_id"]
        if session.get("visit_id")
        else Order.session_id == session["id"]
    )
    query = (
        select(Order)
        .options(selectinload(Order.items))
        .where(
            owner,
            Order.table_id == session["table_id"],
            or_(Order.status != "served", Order.served_at > cutoff),
        )
        .order_by(Order.created_at.desc())
        .limit(MAX_HISTORY_RESULTS)
    )
    return (await db.scalars(query)).all()


@router.post("/api/orders", response_model=OrderOut, status_code=201)
async def create_order(
    payload: OrderCreate,
    request: Request,
    session: dict = Depends(require_guest),
    db: AsyncSession = Depends(get_db),
):
    await rate_limit("order:" + (session.get("visit_id") or session["id"]), ORDER_REQUEST_LIMIT, ORDER_REQUEST_WINDOW_SECONDS)
    check_origin(request)

    visit = await get_visit(session, db, for_update=True) if session.get("visit_id") else None
    lines = payload.items
    if payload.cart_revision is not None:
        if visit is None:
            raise HTTPException(409, "Откройте свежий QR на компьютере клуба для общей корзины")
        check_cart_revision(visit, payload.visit_id, payload.cart_revision)
        lines = [OrderLineCreate.model_validate(line) for line in visit.cart_items]
        if not lines:
            raise HTTPException(409, "Добавьте позицию в корзину")

    ids = {line.menu_item_id for line in lines}
    query = (
        select(MenuItem)
        .where(MenuItem.id.in_(ids), MenuItem.is_available.is_(True), MenuItem.is_archived.is_(False))
        .order_by(MenuItem.id)
        .with_for_update()
    )
    menu = {item.id: item for item in await db.scalars(query)}
    if len(menu) != len(ids):
        raise HTTPException(400, "Одна или несколько позиций недоступны")
    if any(not item.all_day for item in menu.values()) and not kitchen_is_open():
        raise HTTPException(
            409,
            f"Кухня Guliani принимает заказы с {KITCHEN_OPENS:%H:%M} до {KITCHEN_CLOSES:%H:%M} "
            f"{KITCHEN_TIME_ZONE_LABEL}. Уберите блюда кухни из корзины.",
        )

    order = Order(
        table_number=session["table_number"],
        table_id=session["table_id"],
        session_id=session["id"],
        visit_id=session.get("visit_id"),
        customer_name=payload.customer_name,
        note=payload.note,
        status="new",
        items=build_order_items(lines, menu),
    )
    if visit and payload.cart_revision is not None:
        visit.cart_items = []
        visit.cart_revision += 1
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order

# Панель бара

@router.get("/api/admin/orders", response_model=list[OrderOut], dependencies=[Depends(require_admin)])
async def list_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=MAX_HISTORY_RESULTS),
    db: AsyncSession = Depends(get_db),
):
    query = select(Order).options(selectinload(Order.items)).order_by(Order.created_at.desc()).limit(limit)
    if status_filter:
        query = query.where(Order.status == status_filter)
    return (await db.scalars(query)).all()

@router.get("/api/admin/orders/{order_id}", response_model=OrderOut, dependencies=[Depends(require_admin)])
async def get_order(order_id: int, db: AsyncSession = Depends(get_db)):
    order = await db.scalar(select(Order).options(selectinload(Order.items)).where(Order.id == order_id))
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    return order

@router.patch("/api/admin/orders/{order_id}/status", response_model=OrderOut, dependencies=[Depends(require_admin)])
async def update_order_status(
    order_id: int, payload: OrderStatusUpdate, db: AsyncSession = Depends(get_db)
):
    query = select(Order).options(selectinload(Order.items)).where(Order.id == order_id).with_for_update()
    order = await db.scalar(query)
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    if payload.status != order.status and payload.status not in ORDER_TRANSITIONS.get(order.status, ()):
        raise HTTPException(409, "Этот переход статуса недоступен. Обновите список заказов.")
    if payload.status == "served" and order.status != "served":
        order.served_at = datetime.now(timezone.utc)
    order.status = payload.status
    await db.commit()
    await db.refresh(order)
    return order



