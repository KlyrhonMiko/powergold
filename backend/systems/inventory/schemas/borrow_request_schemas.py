from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

from systems.inventory.quantity import (
    NonNegativeQuantityDecimal,
    PositiveQuantityDecimal,
    serialize_quantity,
)
from utils.time_utils import format_datetime

MAX_BORROW_REQUEST_UNIQUE_ITEMS = 50


class BorrowRequestItemCreate(BaseModel):
    """Schema for a single item in a multi-item borrow request."""

    item_id: str = Field(..., max_length=50)
    qty_requested: PositiveQuantityDecimal


class BorrowRequestItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    """Schema for reading a single item in a borrow request."""

    item_id: str
    name: str
    qty_requested: PositiveQuantityDecimal
    classification: Optional[str] = None
    item_type: Optional[str] = None
    unit_of_measure: Optional[str] = None
    is_trackable: bool = False

    @model_validator(mode="before")
    @classmethod
    def resolve_item_details(cls, data):
        if hasattr(data, "inventory_item") and data.inventory_item is not None:
            if hasattr(data, "__dict__"):
                data.__dict__.setdefault("item_id", data.inventory_item.item_id)
                data.__dict__.setdefault("name", data.inventory_item.name)
                data.__dict__.setdefault("classification", data.inventory_item.classification)
                data.__dict__.setdefault("item_type", data.inventory_item.item_type)
                data.__dict__.setdefault("unit_of_measure", data.inventory_item.unit_of_measure)
                data.__dict__.setdefault("is_trackable", data.inventory_item.is_trackable)
        return data

    @field_serializer("qty_requested")
    def serialize_qty_requested(self, value):
        return serialize_quantity(value)

class BorrowRequestBase(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)


class BorrowRequestCreate(BaseModel):
    items: list[BorrowRequestItemCreate] = Field(..., min_length=1)
    notes: Optional[str] = Field(default=None, max_length=500)
    return_at: Optional[datetime] = None
    involved_people: Optional[list[dict]] = Field(default=None)
    customer_name: Optional[str] = Field(default=None, max_length=255)
    location_name: Optional[str] = Field(default=None, max_length=255)
    is_emergency: bool = False

    @model_validator(mode="after")
    def validate_unique_item_ids(self) -> "BorrowRequestCreate":
        item_ids = [item.item_id for item in self.items]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError("Borrow request items must have unique item_id values")
        if len(self.items) > MAX_BORROW_REQUEST_UNIQUE_ITEMS:
            raise ValueError(
                f"Borrow requests may include at most {MAX_BORROW_REQUEST_UNIQUE_ITEMS} unique items"
            )
        return self


class BorrowRequestUpdate(BaseModel):
    status: Optional[str] = Field(default=None, max_length=50)


class BorrowRequestEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: str
    event_type: str
    actor_user_id: Optional[str] = None
    actor_name: Optional[str] = None
    note: Optional[str] = None
    occurred_at: datetime

    @field_serializer("occurred_at")
    def serialize_date(self, dt: datetime) -> str:
        return format_datetime(dt)

class BorrowRequestEventGlobalRead(BorrowRequestEventRead):
    request_id: str


class BorrowRequestUnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    borrow_unit_id: str
    unit_id: str
    serial_number: str | None = None
    assigned_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None

    condition_on_return: str | None = None
    return_notes: str | None = None

    @field_serializer("assigned_at", "released_at", "returned_at")
    def serialize_dates(self, dt: datetime | None) -> str | None:
        return format_datetime(dt)

class BorrowRequestBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    borrow_batch_id: str
    batch_id: str
    item_id: str | None = None
    item_name: str | None = None
    unit_of_measure: Optional[str] = None
    qty_assigned: NonNegativeQuantityDecimal
    qty_returned: NonNegativeQuantityDecimal = 0
    qty_not_returned: NonNegativeQuantityDecimal = 0
    assigned_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None

    @field_serializer("assigned_at", "released_at", "returned_at")
    def serialize_dates(self, dt: datetime | None) -> str | None:
        return format_datetime(dt)

    @field_serializer("qty_assigned", "qty_returned", "qty_not_returned")
    def serialize_quantities(self, value):
        return serialize_quantity(value)

class BorrowRequestRead(BaseModel):
    request_id: str
    transaction_ref: str
    status: str
    request_date: datetime
    borrower_user_id: Optional[str] = None
    borrower_name: Optional[str] = None
    request_channel: str = "inventory_manager"
    
    compliance_followup_required: bool = False
    compliance_followup_notes: Optional[str] = None
    
    notes: Optional[str] = None
    customer_name: Optional[str] = None
    location_name: Optional[str] = None
    return_at: Optional[datetime] = None
    
    is_emergency: bool = False
    involved_people: Optional[list[dict]] = None
    approval_channel: str = "standard"
    
    closed_at: Optional[datetime] = None
    closed_by_user_id: Optional[str] = None
    close_reason: Optional[str] = None

    events: list[BorrowRequestEventRead] = []
    items: list[BorrowRequestItemRead] = []
    assigned_units: list[BorrowRequestUnitRead] = []
    assigned_batches: list[BorrowRequestBatchRead] = []
    returned_on_time: Optional[bool] = None
    
    id: Optional[str] = None # UUID from BaseModel
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    retention_tags: Optional[list[str]] = None
    borrower_signature: Optional[str] = None

    @field_serializer("request_date", "return_at", "closed_at", "archived_at")
    def serialize_dates(self, dt: datetime | None) -> str | None:
        return format_datetime(dt) if dt else None


class BorrowRequestApprove(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)


class BorrowRequestReject(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)


class BorrowRequestRelease(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)


class BorrowRequestUnitReturn(BaseModel):
    unit_id: str = Field(..., max_length=50)
    condition_on_return: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)


class BorrowRequestBatchReturn(BaseModel):
    borrow_batch_id: str = Field(..., max_length=50)
    qty_returned: NonNegativeQuantityDecimal


class BorrowRequestReturn(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)
    unit_returns: list[BorrowRequestUnitReturn] = Field(default_factory=list)
    batch_returns: list[BorrowRequestBatchReturn] = Field(default_factory=list)



class BorrowRequestReopen(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)


class BorrowRequestUnitAssign(BaseModel):
    unit_ids: list[str] = Field(min_length=1)
    notes: Optional[str] = Field(default=None, max_length=500)
    item_id: Optional[str] = Field(default=None, max_length=50)


class BorrowRequestBatchAssignment(BaseModel):
    batch_id: str
    qty: PositiveQuantityDecimal


class BorrowRequestBatchAssign(BaseModel):
    assignments: list[BorrowRequestBatchAssignment] = Field(min_length=1)
    notes: Optional[str] = Field(default=None, max_length=500)
    item_id: str


class AssignableUnitRead(BaseModel):
    unit_id: str
    serial_number: Optional[str] = None
    condition: Optional[str] = None


class AssignableBatchRead(BaseModel):
    batch_id: str
    available_qty: NonNegativeQuantityDecimal
    expiration_date: Optional[datetime] = None

    @field_serializer("available_qty")
    def serialize_available_qty(self, value):
        return serialize_quantity(value)

    @field_serializer("expiration_date")
    def serialize_expiration_date(self, value: datetime | None) -> str | None:
        return format_datetime(value) if value else None


class BorrowRequestAssignmentOptionItemRead(BaseModel):
    item_id: str
    name: str
    qty_requested: PositiveQuantityDecimal
    unit_of_measure: Optional[str] = None
    is_trackable: bool = False
    available_units: list[AssignableUnitRead] = []
    available_batches: list[AssignableBatchRead] = []

    @field_serializer("qty_requested")
    def serialize_qty_requested(self, value):
        return serialize_quantity(value)


class BorrowRequestAssignmentOptionsRead(BaseModel):
    request_id: str
    items: list[BorrowRequestAssignmentOptionItemRead]


class BorrowRequestItemAssignmentUpdate(BaseModel):
    item_id: str = Field(..., max_length=50)
    unit_ids: list[str] = Field(default_factory=list)
    batch_assignments: list[BorrowRequestBatchAssignment] = Field(default_factory=list)


class BorrowRequestAssignmentsUpdate(BaseModel):
    items: list[BorrowRequestItemAssignmentUpdate] = Field(min_length=1)
    notes: Optional[str] = Field(default=None, max_length=500)


class BatchItem(BaseModel):
    item_id: str
    qty_requested: PositiveQuantityDecimal


class BorrowRequestClose(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)


class BorrowRequestVoid(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)


class ReleaseReceiptItemRead(BaseModel):
    item_id: str
    name: str
    classification: Optional[str] = None
    unit_of_measure: Optional[str] = None
    is_trackable: bool = False
    qty_released: PositiveQuantityDecimal
    qty_returned: NonNegativeQuantityDecimal = 0
    qty_not_returned: NonNegativeQuantityDecimal = 0
    serial_numbers: list[str] = []
    batch_details: list[dict] = []

    @field_serializer("qty_released", "qty_returned", "qty_not_returned")
    def serialize_quantities(self, value):
        return serialize_quantity(value)


class ReleaseReceiptRead(BaseModel):
    request_id: str
    transaction_ref: str
    receipt_number: str
    status: str = "released"
    borrower_name: Optional[str] = None
    borrower_user_id: Optional[str] = None
    customer_name: Optional[str] = None
    location_name: Optional[str] = None
    released_at: Optional[datetime] = None
    released_by_name: Optional[str] = None
    expected_return_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None
    returned_by_name: Optional[str] = None
    is_emergency: bool = False
    approval_channel: str = "standard"
    notes: Optional[str] = None
    items: list[ReleaseReceiptItemRead] = []
    borrower_signature: Optional[str] = None

    @field_serializer("released_at", "expected_return_at", "returned_at")
    def serialize_dates(self, dt: datetime | None) -> str | None:
        return format_datetime(dt)


class ReleaseReceiptSignature(BaseModel):
    signature_data: str = Field(..., description="Base64-encoded signature image")
