from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from systems.inventory.quantity import (
    NonNegativeQuantityDecimal,
    serialize_quantity,
)


class InventoryItemBase(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    category: Optional[str] = Field(default=None, max_length=100)

    item_type: Optional[str] = Field(default=None, max_length=50)
    classification: Optional[str] = Field(default=None, max_length=100)
    unit_of_measure: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=1000)

class InventoryItemCreate(InventoryItemBase):
    name: str = Field(..., max_length=255)
    category: Optional[str] = Field(default=None, max_length=100)
    is_trackable: bool = Field(default=False)

class InventoryItemUpdate(InventoryItemBase):
    pass

class InventoryItemRead(InventoryItemBase):
    model_config = ConfigDict(from_attributes=True)

    item_id: str
    total_qty: NonNegativeQuantityDecimal = 0
    available_qty: NonNegativeQuantityDecimal = 0
    condition: str = "good"
    is_trackable: bool
    status_condition: Optional[str] = None

    @field_serializer("total_qty", "available_qty")
    def serialize_quantities(self, value):
        return serialize_quantity(value)
    
class InventoryCatalogItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: str
    name: str
    category: Optional[str] = None
    total_qty: NonNegativeQuantityDecimal = 0
    available_qty: NonNegativeQuantityDecimal = 0
    condition: str = "good"
    item_type: Optional[str] = None
    classification: Optional[str] = None
    unit_of_measure: Optional[str] = None
    is_trackable: bool = False
    description: Optional[str] = None
    status_condition: Optional[str] = None

    @field_serializer("total_qty", "available_qty")
    def serialize_quantities(self, value):
        return serialize_quantity(value)

