"""Фото с камеры или из галереи. В хранилище попадают только проверенные WebP."""

from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener
from starlette.concurrency import run_in_threadpool

from ..config import settings
from ..security import require_admin

router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])
register_heif_opener()
Image.MAX_IMAGE_PIXELS = 24_000_000
MAX_UPLOAD_BYTES = 12 * 1024 * 1024


def save_photo(content: bytes) -> str:
    """Поворот по EXIF, ограничение размера, удаление метаданных камеры."""
    try:
        with Image.open(BytesIO(content)) as source:
            if source.width * source.height > Image.MAX_IMAGE_PIXELS:
                raise ValueError("Слишком большое изображение")
            photo = ImageOps.exif_transpose(source).convert("RGB")
            photo.thumbnail((1600, 1600))
            clean = Image.new("RGB", photo.size)
            clean.paste(photo)
            filename = f"{uuid4().hex}.webp"
            clean.save(Path(settings.uploads_dir) / filename, "WEBP", quality=88)
            return f"/uploads/{filename}"
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "Не удалось прочитать фото. Используйте JPEG, PNG, WebP или HEIC до 24 Мп.")


@router.post("/uploads", status_code=201)
async def upload_photo(file: UploadFile):
    try:
        content = await file.read(MAX_UPLOAD_BYTES + 1)
    finally:
        await file.close()
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Размер фото должен быть от 1 байта до 12 МБ")
    image_url = await run_in_threadpool(save_photo, content)
    return {"image_url": image_url}
