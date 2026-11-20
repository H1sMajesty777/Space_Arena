"""Создание таблиц и совместимое обновление базы предыдущей версии."""

import json
from pathlib import Path

from sqlalchemy import select, text

from .config import settings
from .database import Base, SessionLocal, engine
from .models import AdminUser, MenuItem
from .security import password_hash


async def initialize_database():
    # ADD COLUMN IF NOT EXISTS сохраняет уже созданные заказы и позиции.
    migrations = [
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id INTEGER REFERENCES tables(id)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ",
        "ALTER TABLE tables ADD COLUMN IF NOT EXISTS bar_flagged BOOLEAN NOT NULL DEFAULT FALSE",
        "CREATE INDEX IF NOT EXISTS ix_orders_open_table ON orders (table_id) WHERE paid_at IS NULL AND status <> 'cancelled'",
        "CREATE INDEX IF NOT EXISTS ix_orders_session_id ON orders(session_id)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS visit_id VARCHAR(64) REFERENCES guest_visits(id)",
        "CREATE INDEX IF NOT EXISTS ix_orders_visit_id ON orders(visit_id)",
        "CREATE INDEX IF NOT EXISTS ix_guest_visits_open_table ON guest_visits (table_id) WHERE ended_at IS NULL",
        # Архивируем только старую выданную историю, которая уже исчезла из гостевого интерфейса.
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_archived BOOLEAN",
        """
        UPDATE orders
        SET billing_archived = (
            status = 'served'
            AND COALESCE(served_at, created_at) <= NOW() - INTERVAL '15 minutes'
            AND NOT EXISTS (
                SELECT 1 FROM guest_visits
                WHERE guest_visits.id = orders.visit_id
                  AND ended_at IS NULL AND expires_at > NOW()
            )
        )
        WHERE billing_archived IS NULL
        """,
        "ALTER TABLE orders ALTER COLUMN billing_archived SET DEFAULT FALSE, ALTER COLUMN billing_archived SET NOT NULL",
        "INSERT INTO tables (number, active, version) SELECT DISTINCT table_number, TRUE, 1 FROM orders ON CONFLICT (number) DO NOTHING",
        "UPDATE orders SET table_id = tables.id FROM tables WHERE orders.table_number = tables.number AND orders.table_id IS NULL",
        "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url VARCHAR(255)",
        "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS removed_ingredients JSON NOT NULL DEFAULT '[]'",
        "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS temperature VARCHAR(12)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS pc_number INTEGER",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_key_hash VARCHAR(64)",
        "CREATE INDEX IF NOT EXISTS ix_orders_guest_key_hash ON orders (guest_key_hash)",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category VARCHAR(100) NOT NULL DEFAULT 'Меню'",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url VARCHAR(255)",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS removable_ingredients JSON NOT NULL DEFAULT '[]'",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS temperature_options JSON NOT NULL DEFAULT '[]'",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE",
    ]
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        for statement in migrations:
            await connection.execute(text(statement))

    seed = json.loads((Path(__file__).parent / "menu_seed.json").read_text(encoding="utf-8"))
    async with SessionLocal() as session:
        admin = await session.scalar(select(AdminUser).where(AdminUser.username == settings.admin_username))
        if admin is None:
            session.add(AdminUser(
                username=settings.admin_username,
                password_hash=password_hash.hash(settings.admin_password),
            ))

        existing = (await session.scalars(select(MenuItem))).all()
        if not existing:
            session.add_all(MenuItem(**item) for item in seed)
        else:
            # Обогащаем только записи старой версии; изменения бармена не заменяем.
            by_name = {item["name"]: item for item in seed}
            for item in existing:
                sample = by_name.get(item.name)
                if sample and item.sort_order == 0:
                    item.all_day = sample["all_day"]
                    item.sort_order = sample["sort_order"]
                    if item.category == "Меню":
                        item.category = sample["category"]
        await session.commit()
