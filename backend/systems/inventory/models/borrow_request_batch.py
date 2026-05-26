from decimal import Decimal
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Column, Index, Numeric, text
from sqlmodel import Field, Relationship

from core.base_model import BaseModel
from systems.inventory.quantity import ZERO_QUANTITY
from utils.time_utils import get_now_manila

if TYPE_CHECKING:
    from .borrow_request import BorrowRequest
    from .inventory_batch import InventoryBatch


class BorrowRequestBatch(BaseModel, table=True):
    __tablename__ = "borrow_request_batches"

    borrow_batch_id: str = Field(unique=True, index=True, max_length=50)
    borrow_uuid: UUID | None = Field(default=None, foreign_key="borrow_requests.id", index=True)
    batch_uuid: UUID | None = Field(default=None, foreign_key="inventory_batches.id", index=True)

    qty_assigned: Decimal = Field(
        default=ZERO_QUANTITY,
        ge=0,
        sa_column=Column(Numeric(18, 3), nullable=False, server_default=text("0")),
    )
    
    assigned_by: UUID | None = Field(default=None, foreign_key="users.id")
    assigned_at: datetime | None = Field(default_factory=get_now_manila)

    released_at: datetime | None = Field(default=None)
    returned_at: datetime | None = Field(default=None)

    borrow_request: "BorrowRequest" = Relationship(
        back_populates="assigned_batches",
        sa_relationship_kwargs={"foreign_keys": "[BorrowRequestBatch.borrow_uuid]"},
    )
    inventory_batch: "InventoryBatch" = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[BorrowRequestBatch.batch_uuid]"},
    )

    @property
    def batch_id(self) -> str:
        if self.inventory_batch:
            return self.inventory_batch.batch_id
        return ""

    __table_args__ = (
        Index(
            "ix_borrow_request_batches_request_created",
            "borrow_uuid",
            "is_deleted",
            "created_at",
        ),
        Index(
            "ix_borrow_request_batches_batch_active",
            "batch_uuid",
            "is_deleted",
        ),
    )
