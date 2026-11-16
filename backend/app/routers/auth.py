"""Вход администратора с ограничением попыток через Redis."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from ..models import AdminUser
from ..schemas import LoginRequest, TokenResponse
from ..security import make_token, password_hash
from ..cache import redis

router = APIRouter()
LIMIT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 300) end
return count
"""


@router.post("/api/admin/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Счётчик и TTL устанавливаются атомарно, даже при одновременных запросах.
    key = f"login-attempts:{payload.username}"
    attempts = await redis.eval(LIMIT_SCRIPT, 1, key)
    if attempts > 10:
        raise HTTPException(status_code=429, detail="Слишком много попыток. Попробуйте через 5 минут.")
    user = await db.scalar(select(AdminUser).where(AdminUser.username == payload.username, AdminUser.is_active.is_(True)))
    if user is None or not await run_in_threadpool(password_hash.verify, payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    await redis.delete(key)
    return TokenResponse(access_token=make_token(user.username))



