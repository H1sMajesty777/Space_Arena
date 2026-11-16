from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import GuestVisit
from ..schemas import CartUpdate
from ..visits import check_cart_revision, get_visit
from .access import check_origin, require_guest

router = APIRouter()


def cart_snapshot(visit: GuestVisit):
    return {"visit_id": visit.id, "revision": visit.cart_revision, "items": visit.cart_items}


@router.get("/api/cart", response_model=CartUpdate)
async def get_cart(session: dict = Depends(require_guest), db: AsyncSession = Depends(get_db)):
    return cart_snapshot(await get_visit(session, db))


@router.put("/api/cart", response_model=CartUpdate)
async def update_cart(
    payload: CartUpdate,
    request: Request,
    session: dict = Depends(require_guest),
    db: AsyncSession = Depends(get_db),
):
    check_origin(request)
    visit = await get_visit(session, db, for_update=True)
    check_cart_revision(visit, payload.visit_id, payload.revision)
    visit.cart_items = [line.model_dump() for line in payload.items]
    visit.cart_revision += 1
    await db.commit()
    return cart_snapshot(visit)
