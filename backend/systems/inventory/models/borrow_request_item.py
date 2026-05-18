from decimal import Decimal
from uuid import UUID

from sqlalchemy import Column, Numeric
from sqlmodel import Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .borrow_request import BorrowRequest
    from .inventory import InventoryItem

from core.base_model import BaseModel


class BorrowRequestItem(BaseModel, table=True):
    """Represents a single item in a multi-item borrow request."""
    __tablename__ = "borrow_request_items"

    borrow_uuid: UUID | None = Field(default=None, foreign_key="borrow_requests.id", index=True)
    item_uuid: UUID | None = Field(default=None, foreign_key="inventory.id", index=True)
    
    qty_requested: Decimal = Field(
        gt=0,
        sa_column=Column(Numeric(18, 3), nullable=False),
    )

    # Relationships
    borrow_request: "BorrowRequest" = Relationship(
        back_populates="items",
        sa_relationship_kwargs={"foreign_keys": "[BorrowRequestItem.borrow_uuid]"},
    )
    inventory_item: "InventoryItem" = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[BorrowRequestItem.item_uuid]"},
    )
