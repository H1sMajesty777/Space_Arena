import json
from pathlib import Path


# Файл лежит рядом с каталогом app в проекте и в контейнере.
SETTINGS_PATH = Path(__file__).resolve().parents[1] / "club-settings.json"
CLUB_SETTINGS = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))

MAX_ORDER_LINES = CLUB_SETTINGS["orders"]["max_lines"]
MAX_QUANTITY_PER_VARIANT = CLUB_SETTINGS["orders"]["max_quantity_per_variant"]

if any(type(limit) is not int or limit < 1 for limit in (MAX_ORDER_LINES, MAX_QUANTITY_PER_VARIANT)):
    raise ValueError("Лимиты заказа в club-settings.json должны быть целыми числами больше нуля")
