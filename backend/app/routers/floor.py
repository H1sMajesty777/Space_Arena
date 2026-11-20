"""Карта клуба, открытые счета и закрытие столов персоналом."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import ClubTable, GuestVisit, Order, OrderItem
from ..schemas import OrderOut
from ..security import require_admin

router = APIRouter(prefix="/api/admin/floor", dependencies=[Depends(require_admin)])
TableNumber = Annotated[int, Path(ge=1, le=500)]


class TableSummary(BaseModel):
    number: int
    flagged: bool
    order_count: int
    total: Decimal


class TableBill(BaseModel):
    version: int | None
    flagged: bool
    orders: list[OrderOut]


class TableFlag(BaseModel):
    version: int | None = Field(ge=1)
    flagged: bool


class TableClose(BaseModel):
    version: int = Field(ge=1)
    order_ids: list[int]


def unpaid_orders():
    return Order.paid_at.is_(None), Order.billing_archived.is_(False), Order.status != "cancelled"


def table_changed():
    return HTTPException(409, "Счёт или стол изменился. Проверьте данные и повторите действие.")


async def find_table(number: int, db: AsyncSession, *, lock=False):
    query = select(ClubTable).where(ClubTable.number == number)
    return await db.scalar(query.with_for_update() if lock else query)


@router.get("", response_model=list[TableSummary])
async def floor(db: AsyncSession = Depends(get_db)):
    bills = (
        select(
            Order.table_id,
            func.count(func.distinct(Order.id)).label("order_count"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("total"),
        )
        .outerjoin(OrderItem, OrderItem.order_id == Order.id)
        .where(*unpaid_orders())
        .group_by(Order.table_id)
        .subquery()
    )
    query = (
        select(
            ClubTable.number,
            ClubTable.bar_flagged.label("flagged"),
            func.coalesce(bills.c.order_count, 0).label("order_count"),
            func.coalesce(bills.c.total, 0).label("total"),
        )
        .outerjoin(bills, bills.c.table_id == ClubTable.id)
        .order_by(ClubTable.number)
    )
    return (await db.execute(query)).mappings().all()


@router.get("/{number}", response_model=TableBill)
async def table_bill(number: TableNumber, db: AsyncSession = Depends(get_db)):
    table = await find_table(number, db)
    if table is None:
        return {"version": None, "flagged": False, "orders": []}
    query = (
        select(Order)
        .where(Order.table_id == table.id, *unpaid_orders())
        .order_by(Order.id)
    )
    return {
        "version": table.version,
        "flagged": table.bar_flagged,
        "orders": (await db.scalars(query)).all(),
    }


@router.patch("/{number}/flag", status_code=204)
async def flag_table(number: TableNumber, payload: TableFlag, db: AsyncSession = Depends(get_db)):
    if payload.version is None and payload.flagged:
        added = await db.scalar(
            insert(ClubTable)
            .values(number=number, bar_flagged=True)
            .on_conflict_do_nothing(index_elements=[ClubTable.number])
            .returning(ClubTable.id)
        )
        if added is None:
            raise table_changed()
    else:
        table = await find_table(number, db, lock=True)
        if table is None or table.version != payload.version:
            raise table_changed()
        table.bar_flagged = payload.flagged
    await db.commit()


@router.post("/{number}/close", status_code=204)
async def close_table(number: TableNumber, payload: TableClose, db: AsyncSession = Depends(get_db)):
    # Создание заказов, смена статусов и вход по QR берут эту же блокировку.
    table = await find_table(number, db, lock=True)
    if table is None or table.version != payload.version:
        raise table_changed()

    orders = select(Order.id).where(Order.table_id == table.id, *unpaid_orders()).order_by(Order.id)
    order_ids = (await db.scalars(orders)).all()
    if order_ids != sorted(payload.order_ids):
        raise table_changed()
    if not order_ids and not table.bar_flagged:
        raise HTTPException(409, "У этого места нет открытого счёта или ручной отметки.")

    now = datetime.now(timezone.utc)
    if order_ids:
        await db.execute(
            update(Order).where(Order.table_id == table.id, *unpaid_orders()).values(paid_at=now)
        )
    await db.execute(
        update(GuestVisit)
        .where(GuestVisit.table_id == table.id, GuestVisit.ended_at.is_(None))
        .values(ended_at=now, cart_items=[])
    )
    table.bar_flagged = False
    table.version += 1
    await db.commit()
