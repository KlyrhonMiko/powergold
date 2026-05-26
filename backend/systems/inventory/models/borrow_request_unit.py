from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Index
from sqlmodel import Field, Relationship

from core.base_model import BaseModel
from utils.time_utils import get_now_manila

if TYPE_CHECKING:
    from .borrow_request import BorrowRequest
    from .inventory_unit import InventoryUnit


class BorrowRequestUnit(BaseModel, table=True):
    __tablename__ = "borrow_request_units"

    borrow_unit_id: str = Field(unique=True, index=True, max_length=50)
    borrow_uuid: UUID | None = Field(default=None, foreign_key="borrow_requests.id", index=True)
    unit_uuid: UUID | None = Field(default=None, foreign_key="inventory_units.id", index=True)

    requested_by: UUID | None = Field(default=None, foreign_key="users.id")
    requested_at: datetime | None = Field(default=None)

    approved_by: UUID | None = Field(default=None, foreign_key="users.id")
    approved_at: datetime | None = Field(default=None)

    assigned_by: UUID | None = Field(default=None, foreign_key="users.id")
    assigned_at: datetime | None = Field(default_factory=get_now_manila)

    released_by: UUID | None = Field(default=None, foreign_key="users.id")
    released_at: datetime | None = Field(default=None)
    condition_on_release: str | None = Field(default=None, max_length=100)

    returned_by: UUID | None = Field(default=None, foreign_key="users.id")
    returned_at: datetime | None = Field(default=None)
    condition_on_return: str | None = Field(default=None, max_length=100)
    return_notes: str | None = Field(default=None, max_length=500)

    borrow_request: "BorrowRequest" = Relationship(
        back_populates="assigned_units",
        sa_relationship_kwargs={"foreign_keys": "[BorrowRequestUnit.borrow_uuid]"},
    )
    inventory_unit: "InventoryUnit" = Relationship(
        back_populates="borrow_assignments",
        sa_relationship_kwargs={"foreign_keys": "[BorrowRequestUnit.unit_uuid]"},
    )

    @property
    def unit_id(self) -> str:
        if self.inventory_unit:
            return self.inventory_unit.unit_id
        return ""

    @property
    def serial_number(self) -> str | None:
        if self.inventory_unit:
            return self.inventory_unit.serial_number
        return None

    __table_args__ = (
        Index(
            "ix_borrow_request_units_request_created",
            "borrow_uuid",
            "is_deleted",
            "created_at",
        ),
        Index(
            "ix_borrow_request_units_unit_active",
            "unit_uuid",
            "is_deleted",
        ),
    )
