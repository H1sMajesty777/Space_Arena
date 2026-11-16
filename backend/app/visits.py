"""Визит объединяет браузеры одного игрового ПК до завершения или истечения срока."""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .models import ClubPC, GuestVisit


async def join_visit(place: dict, db: AsyncSession) -> GuestVisit:
    # Два одновременных сканирования должны получить один визит.
    pc = await db.get(ClubPC, place["pc_id"], with_for_update=True, populate_existing=True)
    if not pc or not pc.active or pc.version != place["pc_version"] or pc.table_id != place["table_id"]:
        raise HTTPException(403, "Доступ отозван. Обновите QR")

    now = datetime.now(timezone.utc)
    query = select(GuestVisit).where(
        GuestVisit.pc_id == pc.id,
        GuestVisit.pc_version == pc.version,
        GuestVisit.table_id == place["table_id"],
        GuestVisit.table_version == place["table_version"],
        GuestVisit.ended_at.is_(None),
        GuestVisit.expires_at > now,
    ).order_by(GuestVisit.expires_at.desc()).limit(1)
    visit = await db.scalar(query)
    if visit is None:
        visit = GuestVisit(
            id=secrets.token_hex(32),
            pc_id=pc.id,
            pc_version=pc.version,
            table_id=place["table_id"],
            table_version=place["table_version"],
            expires_at=now + timedelta(seconds=settings.guest_session_seconds),
        )
        db.add(visit)
        await db.flush()
    return visit


async def get_visit(session: dict, db: AsyncSession, *, for_update: bool = False) -> GuestVisit:
    visit_id = session.get("visit_id")
    if not visit_id:
        raise HTTPException(409, "Откройте свежий QR на компьютере клуба для общей корзины")
    visit = await db.get(GuestVisit, visit_id, with_for_update=for_update, populate_existing=for_update)
    if not visit or visit.ended_at or visit.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(401, "Визит завершён. Откройте свежий QR на компьютере клуба")
    return visit


def check_cart_revision(visit: GuestVisit, visit_id: str, revision: int):
    if visit.id != visit_id or visit.cart_revision != revision:
        raise HTTPException(409, "Корзина изменилась на другом устройстве. Проверьте её и повторите действие.")
