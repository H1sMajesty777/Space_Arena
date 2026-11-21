"""Вход и возобновление сессии администратора через Redis."""

from hashlib import sha256
from secrets import token_urlsafe

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from ..config import settings
from ..database import get_db
from ..schemas import LoginRequest, TokenResponse
from ..security import active_admin, admin_session_key, make_token, password_hash
from ..cache import redis

router = APIRouter()
COOKIE = "space_bar_session"
COOKIE_PATH = "/api/admin"
LIMIT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 300) end
return count
"""


def check_admin_origin(request: Request):
    site = request.headers.get("sec-fetch-site")
    origin = request.headers.get("origin")
    allowed_origins = {settings.public_origin.rstrip("/"), *settings.allowed_origins}
    if (site and site != "same-origin") or (
        not site and origin and origin not in allowed_origins
    ):
        raise HTTPException(403, "Откройте панель на сайте клуба")


def session_id(secret: str) -> str:
    return sha256(secret.encode()).hexdigest()


def set_session_cookie(response: Response, secret: str):
    response.set_cookie(
        COOKIE, secret, max_age=settings.admin_session_seconds, path=COOKIE_PATH,
        httponly=True, secure=settings.public_origin.startswith("https://"), samesite="strict",
    )


@router.post("/api/admin/login", response_model=TokenResponse, dependencies=[Depends(check_admin_origin)])
async def login(payload: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # Счётчик и TTL устанавливаются атомарно, даже при одновременных запросах.
    key = f"login-attempts:{payload.username}"
    attempts = await redis.eval(LIMIT_SCRIPT, 1, key)
    if attempts > 10:
        raise HTTPException(status_code=429, detail="Слишком много попыток. Попробуйте через 5 минут.")
    user = await active_admin(payload.username, db)
    if user is None or not await run_in_threadpool(password_hash.verify, payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    await redis.delete(key)
    previous = request.cookies.get(COOKIE)
    if previous:
        await redis.delete(admin_session_key(session_id(previous)))
    secret = token_urlsafe(32)
    sid = session_id(secret)
    await redis.set(admin_session_key(sid), user.username, ex=settings.admin_session_seconds)
    set_session_cookie(response, secret)
    return TokenResponse(access_token=make_token(user.username, sid))


@router.post("/api/admin/refresh", response_model=TokenResponse, dependencies=[Depends(check_admin_origin)])
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    secret = request.cookies.get(COOKIE)
    if not secret:
        raise HTTPException(401, "Войдите в панель бара")
    sid = session_id(secret)
    key = admin_session_key(sid)
    username = await redis.get(key)
    if not (
        username
        and await active_admin(username, db)
        and await redis.expire(key, settings.admin_session_seconds)
    ):
        raise HTTPException(401, "Сессия завершена. Войдите в панель бара")
    set_session_cookie(response, secret)
    return TokenResponse(access_token=make_token(username, sid))


@router.post("/api/admin/logout", status_code=204, dependencies=[Depends(check_admin_origin)])
async def logout(request: Request):
    secret = request.cookies.get(COOKIE)
    if secret:
        await redis.delete(admin_session_key(session_id(secret)))
    response = Response(status_code=204)
    response.delete_cookie(COOKIE, path=COOKIE_PATH, httponly=True, samesite="strict",
                           secure=settings.public_origin.startswith("https://"))
    return response

