from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .club_settings import MAX_ORDER_LINES, MAX_QUANTITY_PER_VARIANT


def distinct_options(options: list[str]) -> list[str]:
    if len({option.casefold() for option in options}) != len(options):
        raise ValueError("Варианты должны быть уникальными")
    return options


Ingredient = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Ingredients = Annotated[list[Ingredient], Field(max_length=20), AfterValidator(distinct_options)]
Temperature = Literal["cold", "warm"]
Temperatures = Annotated[list[Temperature], Field(max_length=2), AfterValidator(distinct_options)]
ImageUrl = Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)]


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MenuItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(default="Меню", min_length=1, max_length=100)
    image_url: ImageUrl | None = None
    is_hit: bool = False
    all_day: bool = False
    removable_ingredients: Ingredients = Field(default_factory=list)
    temperature_options: Temperatures = Field(default_factory=list)
    sort_order: int = Field(default=10000, ge=0)
    description: str | None = None
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    is_available: bool = True


class MenuItemOut(MenuItemCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class GuestMenuItemOut(MenuItemOut):
    unavailable_reason: Literal["sold_out", "kitchen_closed"] | None = None


class MenuItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    image_url: ImageUrl | None = None
    is_hit: bool | None = None
    all_day: bool | None = None
    removable_ingredients: Ingredients = Field(default_factory=list)
    temperature_options: Temperatures = Field(default_factory=list)
    sort_order: int | None = Field(default=None, ge=0)
    description: str | None = None
    price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)


class AvailabilityUpdate(BaseModel):
    is_available: bool


class OrderLineCreate(BaseModel):
    menu_item_id: int
    quantity: int = Field(ge=1, le=MAX_QUANTITY_PER_VARIANT)
    removed_ingredients: Ingredients = Field(default_factory=list)
    temperature: Temperature | None = None

    def variant(self):
        return self.menu_item_id, frozenset(self.removed_ingredients), self.temperature


class CartUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visit_id: str = Field(min_length=64, max_length=64)
    revision: int = Field(ge=0)
    items: list[OrderLineCreate] = Field(max_length=MAX_ORDER_LINES)

    @model_validator(mode="after")
    def unique_lines(self):
        if len({line.variant() for line in self.items}) != len(self.items):
            raise ValueError("Объедините одинаковые позиции в корзине")
        return self


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_name: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=1000)
    items: list[OrderLineCreate] | None = Field(default=None, min_length=1, max_length=MAX_ORDER_LINES)
    visit_id: str | None = Field(default=None, min_length=64, max_length=64)
    cart_revision: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def order_source(self):
        shared = self.visit_id is not None and self.cart_revision is not None
        direct = self.visit_id is None and self.cart_revision is None and self.items is not None
        if not (direct or (shared and self.items is None)):
            raise ValueError("Укажите позиции или версию общей корзины")
        return self


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    menu_item_id: int | None
    name: str
    image_url: str | None
    quantity: int
    unit_price: Decimal
    removed_ingredients: list[str]
    temperature: Temperature | None


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    table_number: int
    pc_number: int | None
    customer_name: str | None
    note: str | None
    status: str
    created_at: datetime
    paid_at: datetime | None
    items: list[OrderItemOut]


class OrderStatusUpdate(BaseModel):
    status: Literal["new", "accepted", "preparing", "ready", "served", "cancelled"]
