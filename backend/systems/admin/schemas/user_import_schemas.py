from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from utils.time_utils import format_datetime


class UserImportHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    actor_id: UUID
    total_rows: int
    success_count: int
    error_count: int
    status: str
    error_log: Any | None = None
    has_credentials_download: bool = False
    created_at: str

    @field_validator("created_at", mode="before")
    @classmethod
    def format_created_at(cls, value: Any) -> str:
        if isinstance(value, datetime):
            return format_datetime(value)
        return str(value)


class UserImportResponse(BaseModel):
    history_id: UUID
    status: str
    total: int
    success: int
    failed: int
    has_credentials_download: bool = False


class UserImportRowIssueRead(BaseModel):
    field: str
    code: str
    severity: str
    message: str

    model_config = ConfigDict(from_attributes=True)


class UserImportPreviewRowRead(BaseModel):
    row_number: int
    original_values: dict[str, str]
    normalized_values: dict[str, str]
    resolved_values: dict[str, str]
    status: str
    issues: list[UserImportRowIssueRead] = []
    action: str | None = None
    stock_interpretation: str = ""
    duplicate_type: str | None = None
    duplicate_subtype: str | None = None
    recommended_action: str | None = None
    selected_action: str | None = None
    requires_user_decision: bool = False
    group_key: str | None = None
    target_match_summary: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UserImportDuplicateGroupRead(BaseModel):
    key: str
    label: str
    count: int
    severity: str
    recommended_action: str | None = None
    requires_user_decision: bool = False

    model_config = ConfigDict(from_attributes=True)


class UserImportPreviewSummary(BaseModel):
    preview_id: str
    filename: str
    mode: str
    delimiter: str
    encoding: str
    bom_detected: bool
    file_size: int
    total_rows: int
    ready_count: int
    warning_count: int
    error_count: int
    info_count: int
    file_issues: list[UserImportRowIssueRead] = []
    can_apply: bool
    headers: list[str]
    duplicate_groups: list[UserImportDuplicateGroupRead] = []
    auto_resolved_count: int = 0
    decision_required_count: int = 0
    unresolved_blocker_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class UserImportPreviewRowUpdateRequest(BaseModel):
    updates: dict[str, str]


class UserImportRowActionRequest(BaseModel):
    action: str = Field(..., min_length=1, max_length=100)
