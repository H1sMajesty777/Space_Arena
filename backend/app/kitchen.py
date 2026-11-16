from datetime import datetime, time
from zoneinfo import ZoneInfo

from .club_settings import CLUB_SETTINGS


kitchen_settings = CLUB_SETTINGS["kitchen"]
KITCHEN_TIME_ZONE = ZoneInfo(kitchen_settings["time_zone"])
KITCHEN_TIME_ZONE_LABEL = kitchen_settings["time_zone_label"]
KITCHEN_OPENS = time.fromisoformat(kitchen_settings["opens"])
KITCHEN_CLOSES = time.fromisoformat(kitchen_settings["closes"])

if (
    KITCHEN_OPENS.strftime("%H:%M") != kitchen_settings["opens"]
    or KITCHEN_CLOSES.strftime("%H:%M") != kitchen_settings["closes"]
    or KITCHEN_OPENS >= KITCHEN_CLOSES
):
    raise ValueError("Укажите часы кухни в формате ЧЧ:ММ. Открытие должно быть раньше закрытия.")


def kitchen_is_open(now: datetime | None = None) -> bool:
    local_time = (now or datetime.now(KITCHEN_TIME_ZONE)).astimezone(KITCHEN_TIME_ZONE).time()
    return KITCHEN_OPENS <= local_time < KITCHEN_CLOSES
