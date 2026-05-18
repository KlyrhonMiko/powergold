from typing import Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_serializer
from systems.inventory.quantity import NonNegativeQuantityDecimal, serialize_quantity
from utils.time_utils import format_datetime

class InventoryBatchBase(BaseModel):
    expiration_date: Optional[datetime] = None
    description: Optional[str] = Field(default=None, max_length=1000)

class InventoryBatchCreate(InventoryBatchBase):
    """Create a new batch (Metadata only). Initial quantity is 0."""
    pass

class InventoryBatchUpdate(BaseModel):
    """Update batch metadata (status and/or expiration)."""
    expiration_date: Optional[datetime] = None
    status: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=1000)

class InventoryBatchRead(InventoryBatchBase):
    model_config = ConfigDict(from_attributes=True)

    """Batch read schema with server-assigned fields."""
    batch_id: str
    inventory_uuid: UUID
    status: str
    description: Optional[str] = None
    # Actually, in this system, we tend to follow human-readable IDs.
    total_qty: NonNegativeQuantityDecimal
    available_qty: NonNegativeQuantityDecimal
    received_at: datetime
    
    # We might need the item_id in the response for convenience
    inventory_id: Optional[str] = None

    @field_serializer("received_at", "expiration_date")
    def serialize_dates(self, dt: datetime | None) -> str | None:
        if dt is None:
            return None
        return format_datetime(dt)

    @field_serializer("total_qty", "available_qty")
    def serialize_quantities(self, value):
        return serialize_quantity(value)
