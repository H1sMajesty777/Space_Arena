"""Точка входа: подключения, маршруты, CORS и каталог загруженных фотографий."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .bootstrap import initialize_database
from .cache import redis
from .config import settings
from .database import engine, get_db
from .routers import auth, cart, floor, menu, orders, access, uploads


@asynccontextmanager
async def lifespan(_: FastAPI):
    await initialize_database()
    yield
    await redis.aclose()
    await engine.dispose()


Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Space Arena API", version="3.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(auth.router, tags=["Вход администратора"])
app.include_router(menu.router, tags=["Меню"])
app.include_router(orders.router, tags=["Заказы"])
app.include_router(floor.router, tags=["Карта клуба"])
app.include_router(cart.router, tags=["Корзина"])
app.include_router(access.router, tags=["Доступ и устройства"])
app.include_router(uploads.router, tags=["Фотографии"])
app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")


@app.get("/health", tags=["Состояние"])
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(select(1))
    await redis.ping()
    return {"status": "ok", "database": "ok", "redis": "ok"}


@app.middleware("http")
async def private_responses(request, call_next):
    from redis.exceptions import RedisError
    from fastapi.responses import JSONResponse
    try:
        response = await call_next(request)
    except RedisError:
        response = JSONResponse({"detail": "Сервис временно недоступен. Попробуйте позже."}, status_code=503)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response
