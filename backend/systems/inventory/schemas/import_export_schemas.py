from datetime import date, datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator
from utils.time_utils import format_datetime


class TimelineMode(str, Enum):
    DAILY = "daily"
    ROLLING_7_DAY = "rolling_7_day"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class ExportReportFilterBase(BaseModel):
    """Phase 1 export/report filter contract; business logic is applied in later phases."""

    model_config = ConfigDict(extra="forbid")

    format: str = Field(..., pattern="^(csv|xlsx)$")
    report_version: str = Field(default="v1", pattern="^(v1|v2)$")
    timeline_mode: TimelineMode | None = None
    anchor_date: date | None = None
    date_from: datetime | None = Field(
        default=None,
        validation_alias=AliasChoices("date_from", "from_date"),
    )
    date_to: datetime | None = Field(
        default=None,
        validation_alias=AliasChoices("date_to", "to_date"),
    )

    include_deleted: bool = False
    include_archived: bool = False

    @model_validator(mode="after")
    def validate_timeline_filters(self) -> "ExportReportFilterBase":
        if self.timeline_mode == TimelineMode.ROLLING_7_DAY and self.anchor_date is None:
            raise ValueError("anchor_date is required when timeline_mode is rolling_7_day")

        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must be less than or equal to date_to")

        return self


class AuditLogExportFilters(ExportReportFilterBase):
    pass


class CatalogExportFilters(ExportReportFilterBase):
    pass


class EntrustedExportFilters(ExportReportFilterBase):
    search: str | None = None
    status: str | None = None
    category: str | None = None
    classification: str | None = None


class LedgerRequestsExportFilters(ExportReportFilterBase):
    report_version: str = Field(default="v2", pattern="^(v1|v2)$")
    status: str | None = None
    item_id: str | None = None
    borrower_id: str | None = None
    serial_number: str | None = Field(default=None, max_length=100)
    include_receipt_rendered: bool = False

    @field_validator("serial_number", mode="before")
    @classmethod
    def normalize_serial_number(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value

        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("serial_number cannot be blank")

        return normalized_value


class LedgerMovementsExportFilters(ExportReportFilterBase):
    report_version: str = Field(default="v2", pattern="^(v1|v2)$")
    movement_type: str | None = None
    item_id: str | None = None
    serial_number: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_item_id_required(self) -> "LedgerMovementsExportFilters":
        if not self.item_id or not self.item_id.strip():
            raise ValueError("item_id is required for Equipment History export")
        return self

    @field_validator("movement_type", mode="before")
    @classmethod
    def normalize_movement_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value

        normalized_value = value.strip().lower()
        if not normalized_value:
            raise ValueError("movement_type cannot be blank")
        if normalized_value not in {"all", "out", "in"}:
            raise ValueError("movement_type must be one of: all, out, in")

        return normalized_value

    @field_validator("serial_number", mode="before")
    @classmethod
    def normalize_serial_number(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value

        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("serial_number cannot be blank")

        return normalized_value


class ImportHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    actor_id: UUID
    total_rows: int
    success_count: int
    error_count: int
    status: str
    error_log: Any | None = None
    created_at: str
    
    @field_validator("created_at", mode="before")
    @classmethod
    def format_created_at(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return format_datetime(v)
        return str(v)


class ImportResponse(BaseModel):
    history_id: UUID
    status: str
    total: int
    success: int
    failed: int
