from decimal import Decimal
from uuid import UUID
from datetime import datetime
from sqlalchemy import Column, Numeric
from sqlmodel import Field
from core.base_model import BaseModel
from utils.time_utils import get_now_manila

class InventoryMovement(BaseModel, table=True):
    __tablename__ = "inventory_movements"

    movement_id: str = Field(unique=True, index=True, max_length=50)
    inventory_uuid: UUID | None = Field(default=None, foreign_key="inventory.id", index=True)
    batch_uuid: UUID | None = Field(default=None, foreign_key="inventory_batches.id", index=True)
    unit_uuid: UUID | None = Field(default=None, foreign_key="inventory_units.id", index=True)
    
    actor_id: UUID | None = Field(
        default=None, 
        foreign_key="users.id", # Link to the UUID primary key
        index=True
    )
    
    # How much changed (+5, -2, etc.)
    qty_change: Decimal = Field(
        ...,
        ge=-10000,
        le=10000,
        sa_column=Column(Numeric(18, 3), nullable=False),
    )
    
    # type: "manual_adjustment", "borrow_release", "borrow_return", "procurement"
    movement_type: str = Field(max_length=50)

    reason_code: str | None = Field(default=None, index=True, max_length=50)
    
    # Optional link to an external or internal domain record.
    reference_id: str | None = Field(default=None, index=True, max_length=50)
    reference_type: str | None = Field(default=None, index=True, max_length=50)
    
    note: str | None = Field(default=None, max_length=500)
    occurred_at: datetime = Field(default_factory=get_now_manila, index=True)
