from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .cache import redis
from .config import settings
from .database import get_db
from .models import AdminUser

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
ALGORITHM = "HS256"


def make_token(username: str, session_id: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": username, "sid": session_id, "exp": expires}, settings.secret_key, algorithm=ALGORITHM)


def admin_session_key(session_id: str) -> str:
    return f"admin-session:{session_id}"


async def active_admin(username: str, db: AsyncSession) -> AdminUser | None:
    return await db.scalar(select(AdminUser).where(AdminUser.username == username, AdminUser.is_active.is_(True)))


async def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: AsyncSession = Depends(get_db)) -> AdminUser:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Нужна авторизация", headers={"WWW-Authenticate": "Bearer"})
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[ALGORITHM])
        username = payload.get("sub")
    except jwt.PyJWTError:
        raise unauthorized
    session_id = payload.get("sid")
    if session_id and await redis.get(admin_session_key(session_id)) != username:
        raise unauthorized
    user = await active_admin(username, db)
    if user is None:
        raise unauthorized
    return user
