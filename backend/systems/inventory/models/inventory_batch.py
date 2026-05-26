from decimal import Decimal
from datetime import datetime
from uuid import UUID
from sqlalchemy import Column, Index, Numeric, text
from sqlmodel import Field
from core.base_model import BaseModel
from systems.inventory.quantity import ZERO_QUANTITY
from utils.time_utils import get_now_manila

class InventoryBatch(BaseModel, table=True):
    __tablename__ = "inventory_batches"

    batch_id: str = Field(unique=True, index=True, max_length=50)
    inventory_uuid: UUID = Field(foreign_key="inventory.id", index=True)
    
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
    
    expiration_date: datetime | None = Field(default=None, index=True, nullable=True)
    
    # status: "healthy", "low_stock", "out_of_stock", "near_expiry", "expired"
    status: str = Field(default="available", max_length=50)
    description: str | None = Field(default=None, max_length=1000)
    
    received_at: datetime = Field(default_factory=get_now_manila)

    __table_args__ = (
        Index(
            "ix_inventory_batches_item_received_active",
            "inventory_uuid",
            "is_deleted",
            "received_at",
        ),
        Index(
            "ix_inventory_batches_item_available_active",
            "inventory_uuid",
            "is_deleted",
            "available_qty",
        ),
    )
