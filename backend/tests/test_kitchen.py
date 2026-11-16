import unittest
from datetime import date, datetime, timedelta, timezone

from app.kitchen import KITCHEN_CLOSES, KITCHEN_OPENS, KITCHEN_TIME_ZONE, kitchen_is_open


class KitchenHoursTest(unittest.TestCase):
    def test_order_window_in_kitchen_time_zone(self):
        day = date(2026, 11, 16)
        opens = datetime.combine(day, KITCHEN_OPENS, KITCHEN_TIME_ZONE).astimezone(timezone.utc)
        closes = datetime.combine(day, KITCHEN_CLOSES, KITCHEN_TIME_ZONE).astimezone(timezone.utc)
        second = timedelta(seconds=1)
        for now, expected in (
            (opens - second, False),
            (opens, True),
            (closes - second, True),
            (closes, False),
        ):
            with self.subTest(utc=now):
                self.assertEqual(kitchen_is_open(now), expected)
