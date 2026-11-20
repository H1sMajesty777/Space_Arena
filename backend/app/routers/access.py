"""Устройства, временные QR и гостевые cookie. Redis хранит только хэши ключей."""
import ipaddress
import hashlib
import json
import math
import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, RedirectResponse, HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from ..cache import redis
from ..config import settings
from ..database import get_db
from ..models import ClubTable, ClubPC, Order
from ..security import require_admin
from ..visits import get_visit, join_visit

router = APIRouter()
COOKIE = "space_guest"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


async def rate_limit(key, limit, seconds):
    count = await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, "limit:" + key, seconds)
    if count > limit:
        raise HTTPException(429, "Слишком много запросов. Попробуйте позже.")


def check_origin(request):
    if request.headers.get("origin", "") != settings.public_origin.rstrip("/"):
        raise HTTPException(403, "Откройте заказ на сайте клуба")


def require_transport():
    origin = urlsplit(settings.public_origin)
    try:
        address = ipaddress.ip_address(origin.hostname)
        local = address.is_private or address.is_loopback
    except ValueError:
        local = origin.hostname == "localhost"
    if origin.scheme != "https" and not (settings.allow_insecure_local and local):
        raise HTTPException(503, "Для доступа требуется HTTPS")


async def validate_place(data, db, *, lock_table=False):
    table = await db.get(
        ClubTable, data["table_id"], with_for_update=lock_table, populate_existing=lock_table
    )
    pc = await db.get(ClubPC, data["pc_id"])
    if not table or not pc or not table.active or not pc.active:
        raise HTTPException(403, "Стол или компьютер отключён")
    if table.version != data["table_version"] or pc.version != data["pc_version"] or pc.table_id != table.id:
        raise HTTPException(403, "Доступ отозван. Обновите QR")
    return table


async def require_guest(request: Request, db: AsyncSession = Depends(get_db)):
    raw = request.cookies.get(COOKIE, "")
    value = await redis.get("session:" + digest(raw)) if raw else None
    if not value:
        raise HTTPException(401, "Сессия завершена. Откройте свежий QR на компьютере клуба")
    data = json.loads(value)
    await validate_place(data, db)
    if data.get("visit_id"):
        await get_visit(data, db)
    data["id"] = digest(raw)
    return data


@router.get("/api/session")
async def session_info(session: dict = Depends(require_guest)):
    return {
        "table_id": session["table_id"],
        "table_number": session["table_number"],
        "visit_id": session.get("visit_id"),
        "expires_at": session["expires_at"],
    }


@router.get("/api/pc/qr-token")
async def pc_token(request: Request, db: AsyncSession = Depends(get_db)):
    require_transport()
    await rate_limit("device-ip:" + request.client.host, 120, 60)
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Device ") or len(auth) > 256:
        raise HTTPException(401, "Нужен секрет устройства")
    pc = await db.scalar(select(ClubPC).where(ClubPC.secret_hash == digest(auth[7:])))
    if not pc or not pc.active:
        raise HTTPException(403, "Компьютер отключён или секрет заменён")
    table = await db.get(ClubTable, pc.table_id)
    if not table or not table.active:
        raise HTTPException(403, "Стол отключён")
    await rate_limit("device:" + str(pc.id), 5, 60)
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    data = {"table_id": table.id, "table_number": table.number, "pc_id": pc.id,
            "pc_version": pc.version, "table_version": table.version, "created_at": now.timestamp(), "scan_count": 0}
    await redis.set("qr:" + digest(token), json.dumps(data), ex=settings.qr_token_seconds)
    pc.last_seen = now
    await db.commit()
    return {"temp_token": token, "table_id": table.id, "access_version": f"{pc.version}:{table.version}",
            "expires_at": datetime.fromtimestamp(now.timestamp() + settings.qr_token_seconds, timezone.utc).isoformat(),
            "order_url": settings.public_origin.rstrip("/") + "/order?" + urlencode({"table": table.id, "t": token})}


@router.get("/api/pc/status")
async def device_status(request: Request, db: AsyncSession = Depends(get_db)):
    require_transport()
    await rate_limit("heartbeat:" + request.client.host, 300, 60)
    auth = request.headers.get("authorization", "")
    pc = await db.scalar(select(ClubPC).where(ClubPC.secret_hash == digest(auth[7:]))) if auth.startswith("Device ") else None
    table = await db.get(ClubTable, pc.table_id) if pc else None
    if not pc or not table or not pc.active or not table.active:
        raise HTTPException(403, "Устройство или стол отключены")
    pc.last_seen = datetime.now(timezone.utc)
    await db.commit()
    return {"active": True, "access_version": f"{pc.version}:{table.version}"}


@router.get("/order")
async def enter(request: Request, db: AsyncSession = Depends(get_db)):
    require_transport()
    await rate_limit("entry:" + request.client.host, 120, 60)
    token = request.query_params.get("t")
    try:
        if token is None:
            await require_guest(request, db)
            return Response(headers={"X-Accel-Redirect": "/_guest_page", "Cache-Control": "no-store"})
        value = await redis.get("qr:" + digest(token))
        if not value:
            raise HTTPException(403, "QR истёк. Отсканируйте новый код на компьютере клуба")
        data = json.loads(value)
        if str(data["table_id"]) != request.query_params.get("table"):
            raise HTTPException(403, "QR принадлежит другому столу")
        await validate_place(data, db)
        # Многоразовый QR. Счётчик не продлевает срок его действия.
        scanned = await redis.eval("local v=redis.call('GET',KEYS[1]); if not v then return 0 end; local d=cjson.decode(v); d.scan_count=d.scan_count+1; redis.call('SET',KEYS[1],cjson.encode(d),'KEEPTTL'); return 1", 1, "qr:" + digest(token))
        if not scanned:
            raise HTTPException(403, "QR истёк")
        try:
            existing = await require_guest(request, db)
        except HTTPException:
            existing = None
        await validate_place(data, db, lock_table=True)
        visit = await join_visit(data, db)
        if existing and existing.get("visit_id") == visit.id:
            return RedirectResponse("/order", status_code=303)

        # Переносим старые заказы только из подтверждённой cookie этого же ПК.
        if existing and not existing.get("visit_id") and existing["pc_id"] == data["pc_id"]:
            await db.execute(
                update(Order)
                .where(
                    Order.session_id == existing["id"],
                    Order.table_id == visit.table_id,
                    Order.visit_id.is_(None),
                    Order.paid_at.is_(None),
                    Order.billing_archived.is_(False),
                )
                .values(visit_id=visit.id)
            )
        await db.commit()

        session_token = secrets.token_urlsafe(32)
        data["visit_id"] = visit.id
        data["expires_at"] = visit.expires_at.isoformat()
        data["ip"] = request.client.host
        data["user_agent"] = request.headers.get("user-agent", "")[:500]
        remaining = max(1, math.ceil((visit.expires_at - datetime.now(timezone.utc)).total_seconds()))
        await redis.set("session:" + digest(session_token), json.dumps(data), ex=remaining)
        response = RedirectResponse("/order", status_code=303)
        response.set_cookie(COOKIE, session_token, max_age=remaining,
                            httponly=True, secure=settings.public_origin.startswith("https://"), samesite="lax", path="/")
        return response
    except HTTPException as issue:
        return HTMLResponse('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="background:#10091c;color:#eee;font:20px system-ui;padding:8vw"><h1>Откройте свежий QR</h1><p>Доступ к заказу завершён или код недействителен. Отсканируйте QR на компьютере клуба.</p></body>', status_code=403)


class TableInput(BaseModel):
    number: int = Field(ge=1, le=500)


class PCInput(BaseModel):
    table_id: int
    name: str = Field(min_length=1, max_length=100)


class ActiveInput(BaseModel):
    active: bool


@router.get("/api/admin/access", dependencies=[Depends(require_admin)])
async def list_access(db: AsyncSession = Depends(get_db)):
    tables = (await db.scalars(select(ClubTable).order_by(ClubTable.number))).all()
    pcs = (await db.scalars(select(ClubPC).order_by(ClubPC.id))).all()
    return {"tables": [{"id": t.id, "number": t.number, "active": t.active} for t in tables],
            "pcs": [{"id": p.id, "name": p.name, "table_id": p.table_id, "active": p.active, "last_seen": p.last_seen} for p in pcs]}


@router.post("/api/admin/tables", dependencies=[Depends(require_admin)])
async def create_table(payload: TableInput, db: AsyncSession = Depends(get_db)):
    table = ClubTable(number=payload.number)
    db.add(table)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Такой стол уже существует")
    return {"id": table.id, "number": table.number}


@router.post("/api/admin/pcs", dependencies=[Depends(require_admin)])
async def create_pc(payload: PCInput, db: AsyncSession = Depends(get_db)):
    if not await db.get(ClubTable, payload.table_id):
        raise HTTPException(404, "Стол не найден")
    secret = secrets.token_urlsafe(48)
    pc = ClubPC(name=payload.name, table_id=payload.table_id, secret_hash=digest(secret))
    db.add(pc)
    await db.commit()
    return {"id": pc.id, "enrollment_code": await enrollment_code(pc)}


@router.patch("/api/admin/{kind}/{identifier}/active", dependencies=[Depends(require_admin)])
async def set_active(kind: str, identifier: int, payload: ActiveInput, db: AsyncSession = Depends(get_db)):
    model = {"tables": ClubTable, "pcs": ClubPC}.get(kind)
    if not model:
        raise HTTPException(404)
    record = await db.get(model, identifier, with_for_update=True)
    if not record:
        raise HTTPException(404)
    if record.active != payload.active:
        record.version += 1
    record.active = payload.active
    await db.commit()
    return {"active": record.active}


@router.post("/api/admin/pcs/{identifier}/rotate", dependencies=[Depends(require_admin)])
async def rotate(identifier: int, db: AsyncSession = Depends(get_db)):
    pc = await db.get(ClubPC, identifier, with_for_update=True)
    if not pc:
        raise HTTPException(404)
    secret = secrets.token_urlsafe(48)
    pc.secret_hash = digest(secret)
    pc.version += 1
    await db.commit()
    return {"enrollment_code": await enrollment_code(pc)}


async def enrollment_code(pc):
    code = secrets.token_urlsafe(24)
    await redis.set("enroll:" + digest(code), json.dumps({"id": pc.id, "version": pc.version}), ex=600)
    return code


class EnrollmentInput(BaseModel):
    code: str = Field(min_length=20, max_length=128)


@router.post("/api/pc/enroll")
async def enroll(payload: EnrollmentInput, request: Request, db: AsyncSession = Depends(get_db)):
    require_transport()
    await rate_limit("enroll:" + request.client.host, 10, 60)
    value = await redis.getdel("enroll:" + digest(payload.code))
    if not value:
        raise HTTPException(403, "Код подключения истёк или уже использован")
    data = json.loads(value)
    pc = await db.get(ClubPC, data["id"], with_for_update=True)
    if not pc or not pc.active or pc.version != data["version"]:
        raise HTTPException(403, "Подключение отменено")
    secret = secrets.token_urlsafe(48)
    pc.secret_hash = digest(secret)
    await db.commit()
    return {"device_secret": secret}
