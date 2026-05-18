from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Annotated, Any

from pydantic import Field

QUANTITY_MAX_DIGITS = 18
QUANTITY_DECIMAL_PLACES = 3
QUANTITY_STEP = Decimal("0.001")
ZERO_QUANTITY = Decimal("0.000")
TRACKABLE_UNIT_QUANTITY = Decimal("1.000")

QuantityDecimal = Annotated[
    Decimal,
    Field(max_digits=QUANTITY_MAX_DIGITS, decimal_places=QUANTITY_DECIMAL_PLACES),
]
PositiveQuantityDecimal = Annotated[
    Decimal,
    Field(gt=0, max_digits=QUANTITY_MAX_DIGITS, decimal_places=QUANTITY_DECIMAL_PLACES),
]
NonNegativeQuantityDecimal = Annotated[
    Decimal,
    Field(ge=0, max_digits=QUANTITY_MAX_DIGITS, decimal_places=QUANTITY_DECIMAL_PLACES),
]
SignedQuantityDecimal = Annotated[
    Decimal,
    Field(max_digits=QUANTITY_MAX_DIGITS, decimal_places=QUANTITY_DECIMAL_PLACES),
]


def quantize_quantity(value: Decimal | int | str | float) -> Decimal:
    decimal_value = Decimal(str(value))
    normalized = decimal_value.normalize() if decimal_value != 0 else Decimal("0")
    if normalized.as_tuple().exponent < -QUANTITY_DECIMAL_PLACES:
        raise ValueError(
            f"Quantity '{value}' exceeds the maximum scale of {QUANTITY_DECIMAL_PLACES} decimal places."
        )
    return decimal_value.quantize(QUANTITY_STEP)


def parse_quantity(value: Any, *, field_name: str = "quantity") -> Decimal:
    if value is None:
        raise ValueError(f"{field_name} is required")

    text = str(value).strip()
    if not text:
        raise ValueError(f"{field_name} is required")

    try:
        return quantize_quantity(text)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid {field_name}: {value}") from exc


def is_whole_quantity(value: Decimal | int | str | float) -> bool:
    quantity = quantize_quantity(value)
    return quantity == quantity.to_integral_value()


def require_whole_quantity(
    value: Decimal | int | str | float,
    *,
    field_name: str = "quantity",
) -> Decimal:
    quantity = quantize_quantity(value)
    if not is_whole_quantity(quantity):
        raise ValueError(f"{field_name} must be a whole number for trackable items.")
    return quantity


def serialize_quantity(value: Decimal | int | str | float | None) -> int | float | None:
    if value is None:
        return None

    quantity = quantize_quantity(value)
    if is_whole_quantity(quantity):
        return int(quantity)
    return float(quantity)


def format_quantity(value: Decimal | int | str | float | None) -> str:
    if value is None:
        return "0"

    quantity = quantize_quantity(value)
    rendered = format(quantity, "f")
    if "." not in rendered:
        return rendered
    return rendered.rstrip("0").rstrip(".")
