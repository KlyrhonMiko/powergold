from datetime import datetime
from uuid import UUID

from sqlalchemy import Index, text, Column, JSON
from sqlmodel import Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .borrow_request_event import BorrowRequestEvent
    from .borrow_participant import BorrowParticipant
    from .borrow_request_unit import BorrowRequestUnit
    from .borrow_request_batch import BorrowRequestBatch
    from .borrow_request_item import BorrowRequestItem

from core.base_model import BaseModel
from utils.time_utils import get_now_manila


class BorrowRequest(BaseModel, table=True):
    __tablename__ = "borrow_requests"

    request_id: str = Field(unique=True, index=True, max_length=50)
    borrower_uuid: UUID | None = Field(default=None, foreign_key="users.id", index=True)

    status: str = Field(default="pending", max_length=50)
    approved_by: UUID | None = Field(default=None, foreign_key="users.id")
    approved_at: datetime | None = Field(default=None)

    released_by: UUID | None = Field(default=None, foreign_key="users.id")
    released_at: datetime | None = Field(default=None)

    returned_by: UUID | None = Field(default=None, foreign_key="users.id")
    returned_at: datetime | None = Field(default=None)
    received_by: UUID | None = Field(default=None, foreign_key="users.id")

    closed_at: datetime | None = Field(default=None)
    closed_by: UUID | None = Field(default=None, foreign_key="users.id")
    close_reason: str | None = Field(default=None, max_length=100)

    request_date: datetime = Field(default_factory=get_now_manila, index=True)
    notes: str | None = Field(default=None, max_length=500)

    customer_name: str | None = Field(default=None, max_length=255)
    location_name: str | None = Field(default=None, max_length=255)

    transaction_ref: str = Field(unique=True, index=True, max_length=50)
    release_employee_id: str | None = Field(default=None, max_length=50)
    involved_people: list[dict] | None = Field(default=None, sa_column=Column(JSON))

    return_at: datetime | None = Field(default=None)
    returned_on_time: bool | None = Field(default=None)

    request_channel: str = Field(default="inventory_manager", max_length=50)
    approval_channel: str = Field(default="standard", max_length=50)

    is_emergency: bool = Field(default=False)
    borrower_signature: str | None = Field(default=None)
    receipt_snapshot: dict | None = Field(default=None, sa_column=Column(JSON))
    compliance_followup_required: bool = Field(default=False)
    compliance_followup_notes: str | None = Field(default=None, max_length=500)

    events: list["BorrowRequestEvent"] = Relationship(
        back_populates="borrow_request",
        sa_relationship_kwargs={"foreign_keys": "[BorrowRequestEvent.borrow_uuid]"},
    )
    participants: list["BorrowParticipant"] = Relationship(
        back_populates="borrow_request",
        sa_relationship_kwargs={"foreign_keys": "[BorrowParticipant.borrow_uuid]"},
    )
    items: list["BorrowRequestItem"] = Relationship(
        back_populates="borrow_request",
        sa_relationship_kwargs={"foreign_keys": "[BorrowRequestItem.borrow_uuid]"},
    )
    assigned_units: list["BorrowRequestUnit"] = Relationship(
        back_populates="borrow_request",
        sa_relationship_kwargs={"foreign_keys": "[BorrowRequestUnit.borrow_uuid]"},
    )
    assigned_batches: list["BorrowRequestBatch"] = Relationship(
        back_populates="borrow_request",
        sa_relationship_kwargs={"foreign_keys": "[BorrowRequestBatch.borrow_uuid]"},
    )

    __table_args__ = (
        Index(
            "ix_borrow_requests_borrower_active",
            "borrower_uuid",
            postgresql_where=text(
                "status IN ('pending', 'approved', 'released') AND is_deleted IS FALSE"
            ),
        ),
        Index(
            "ix_borrow_requests_list_filters",
            "is_deleted",
            "is_archived",
            "status",
            "request_date",
        ),
        Index(
            "ix_borrow_requests_borrower_recent",
            "borrower_uuid",
            "is_deleted",
            "request_date",
        ),
    )
