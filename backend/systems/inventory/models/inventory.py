from decimal import Decimal

from sqlalchemy import Column, Index, Numeric, text
from sqlmodel import Field
from core.base_model import BaseModel
from systems.inventory.quantity import ZERO_QUANTITY

class InventoryItem(BaseModel, table=True):
    __tablename__ = "inventory"

    item_id: str = Field(unique=True, index=True, max_length=50)

    name: str = Field(max_length=255)
    category: str | None = Field(default=None, max_length=100)
    unit_of_measure: str | None = Field(default=None, max_length=50)

    # System-managed operational snapshots derived from units/batches.
    total_qty: Decimal = Field(
        default=ZERO_QUANTITY,
        ge=0,
        sa_column=Column(Numeric(18, 3), nullable=False, server_default=text("0")),
    )
    available_qty: Decimal = Field(
        default=ZERO_QUANTITY,
        ge=0,
        sa_column=Column(Numeric(18, 3), nullable=False, server_default=text("0")),
    )
    status: str = Field(default="healthy", max_length=50)

    item_type: str | None = Field(default=None, max_length=50)
    classification: str | None = Field(default=None, max_length=100)
    is_trackable: bool = Field(default=False)
    description: str | None = Field(default=None, max_length=1000)

    __table_args__ = (
        Index(
            "ix_inventory_item_name_active",
            "name",
            "classification",
            "item_type",
            unique=True,
            postgresql_where=text("is_deleted IS FALSE"),
        ),
        Index(
            "ix_inventory_created_at",
            "created_at",
        ),
        Index(
            "ix_inventory_list_filters",
            "is_deleted",
            "is_archived",
            "is_trackable",
            "name",
        ),
    )
