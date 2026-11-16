import json

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..cache import redis
from ..database import get_db
from ..kitchen import kitchen_is_open
from ..models import MenuItem
from ..schemas import AvailabilityUpdate, GuestMenuItemOut, MenuItemCreate, MenuItemOut, MenuItemUpdate
from ..security import require_admin
from .access import require_guest

router = APIRouter()

MENU_CACHE_KEY = "menu:all:v4"
MENU_CACHE_SECONDS = 15
REQUIRED_ITEM_FIELDS = ("name", "price", "category", "all_day", "sort_order")


# Каталог и кеш

async def catalog_items(db: AsyncSession):
    query = (
        select(MenuItem)
        .where(MenuItem.is_archived.is_(False))
        .order_by(MenuItem.sort_order, MenuItem.id)
    )
    return (await db.scalars(query)).all()


@router.get("/api/menu", response_model=list[GuestMenuItemOut], dependencies=[Depends(require_guest)])
async def get_menu(db: AsyncSession = Depends(get_db)):
    cached = await redis.get(MENU_CACHE_KEY)
    if cached:
        items = [GuestMenuItemOut.model_validate(item) for item in json.loads(cached)]
    else:
        items = [GuestMenuItemOut.model_validate(item) for item in await catalog_items(db)]
        catalog = [item.model_dump(mode="json", exclude={"unavailable_reason"}) for item in items]
        await redis.set(MENU_CACHE_KEY, json.dumps(catalog), ex=MENU_CACHE_SECONDS)

    # Время кухни проверяется после чтения кеша, чтобы карточки обновились на границе расписания.
    kitchen_open = kitchen_is_open()
    for item in items:
        if not item.is_available:
            item.unavailable_reason = "sold_out"
        elif not item.all_day and not kitchen_open:
            item.unavailable_reason = "kitchen_closed"
    return items


# Редактирование каталога в панели бара

async def get_item_for_update(item_id: int, db: AsyncSession) -> MenuItem:
    item = await db.get(MenuItem, item_id, with_for_update=True)
    if item is None or item.is_archived:
        raise HTTPException(404, "Позиция не найдена")
    return item


async def save_item(item: MenuItem, db: AsyncSession) -> MenuItem:
    await db.commit()
    await db.refresh(item)
    await redis.delete(MENU_CACHE_KEY)
    return item


@router.get("/api/admin/menu", response_model=list[MenuItemOut], dependencies=[Depends(require_admin)])
async def admin_menu(db: AsyncSession = Depends(get_db)):
    return await catalog_items(db)


@router.post("/api/admin/menu", response_model=MenuItemOut, status_code=201, dependencies=[Depends(require_admin)])
async def create_menu_item(payload: MenuItemCreate, db: AsyncSession = Depends(get_db)):
    item = MenuItem(**payload.model_dump())
    db.add(item)
    return await save_item(item, db)


@router.patch("/api/admin/menu/{item_id}", response_model=MenuItemOut, dependencies=[Depends(require_admin)])
async def update_menu_item(item_id: int, payload: MenuItemUpdate, db: AsyncSession = Depends(get_db)):
    item = await get_item_for_update(item_id, db)
    changes = payload.model_dump(exclude_unset=True)
    if any(key in changes and changes[key] is None for key in REQUIRED_ITEM_FIELDS):
        raise HTTPException(422, "Заполните обязательные поля позиции")
    for key, value in changes.items():
        setattr(item, key, value)
    return await save_item(item, db)


@router.patch("/api/admin/menu/{item_id}/availability", response_model=MenuItemOut, dependencies=[Depends(require_admin)])
async def set_availability(item_id: int, payload: AvailabilityUpdate, db: AsyncSession = Depends(get_db)):
    item = await get_item_for_update(item_id, db)
    item.is_available = payload.is_available
    return await save_item(item, db)


@router.delete("/api/admin/menu/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_menu_item(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await get_item_for_update(item_id, db)
    item.is_archived = True
    item.is_available = False
    await db.commit()
    await redis.delete(MENU_CACHE_KEY)
    return Response(status_code=204)
