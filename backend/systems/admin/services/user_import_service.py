import csv
import io
import secrets
import string
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from fastapi import UploadFile
from sqlalchemy import func
from sqlmodel import Session, select

from core.config import settings
from systems.admin.models.user import User
from systems.admin.models.user_import_history import UserImportHistory
from systems.admin.schemas.user_schemas import UserCreate, UserUpdate
from systems.admin.services.password_policy_service import PasswordPolicyService
from systems.admin.services.user_service import UserService
from systems.auth.services.configuration_service import AuthConfigService
from systems.auth.services.auth_service import auth_service


USER_IMPORT_REQUIRED_HEADERS = {
    "employee_id",
    "first_name",
    "last_name",
    "role",
    "shift_type",
}
USER_IMPORT_ALL_HEADERS = {
    "employee_id",
    "first_name",
    "last_name",
    "middle_name",
    "email",
    "contact_number",
    "role",
    "shift_type",
}
USER_IMPORT_TEMPLATE_HEADERS = [
    "employee_id",
    "first_name",
    "last_name",
    "middle_name",
    "email",
    "contact_number",
    "role",
    "shift_type",
]
PREVIEW_SESSION_TTL_MINUTES = 30


class RowStatus(str, Enum):
    READY = "ready"
    WARNING = "warning"
    ERROR = "error"
    INFO = "info"


@dataclass
class RowIssue:
    field: str
    code: str
    severity: str
    message: str


@dataclass
class DuplicateGroup:
    key: str
    label: str
    count: int
    severity: str
    recommended_action: Optional[str] = None
    requires_user_decision: bool = False


@dataclass
class ParsedCSV:
    headers: list[str]
    rows: list[dict[str, str]]
    delimiter: str
    encoding: str
    bom_detected: bool
    row_count: int
    file_size: int
    file_issues: list[RowIssue] = field(default_factory=list)


@dataclass
class RowPreview:
    row_number: int
    original_values: dict[str, str]
    normalized_values: dict[str, str]
    resolved_values: dict[str, str]
    status: RowStatus
    issues: list[RowIssue] = field(default_factory=list)
    action: Optional[str] = None
    stock_interpretation: str = ""
    duplicate_type: Optional[str] = None
    duplicate_subtype: Optional[str] = None
    recommended_action: Optional[str] = None
    selected_action: Optional[str] = None
    requires_user_decision: bool = False
    group_key: Optional[str] = None
    target_match_summary: Optional[str] = None
    matched_user_id: Optional[str] = None
    matched_user_is_deleted: bool = False


@dataclass
class PreviewSession:
    id: str
    filename: str
    mode: str
    actor_id: Optional[UUID]
    parsed_csv: ParsedCSV
    row_previews: list[RowPreview]
    created_at: datetime
    expires_at: datetime
    credentials_rows: list[dict[str, str]] = field(default_factory=list)
    applied_history_id: Optional[str] = None


class UserImportService:
    def __init__(self) -> None:
        self.user_service = UserService()
        self.password_policy_service = PasswordPolicyService()
        self.auth_config_service = AuthConfigService()
        self._preview_sessions: dict[str, PreviewSession] = {}

    @staticmethod
    def _normalize_text(value: Any) -> str:
        return str(value or "").strip()

    @staticmethod
    def _normalize_key(value: Any) -> str:
        return str(value or "").strip().lower()

    @staticmethod
    def _normalize_email(value: Any) -> str:
        return str(value or "").strip().lower()

    def _cleanup_expired_sessions(self) -> None:
        now = datetime.utcnow()
        expired = [key for key, session in self._preview_sessions.items() if session.expires_at <= now]
        for key in expired:
            del self._preview_sessions[key]

    def get_preview_session(self, preview_id: str) -> PreviewSession | None:
        self._cleanup_expired_sessions()
        return self._preview_sessions.get(preview_id)

    def get_history(self, session: Session, skip: int = 0, limit: int = 100) -> tuple[list[UserImportHistory], int]:
        statement = select(UserImportHistory).order_by(UserImportHistory.created_at.desc())
        count_stmt = select(func.count(UserImportHistory.id))
        total = int(session.exec(count_stmt).one() or 0)
        results = session.exec(statement.offset(skip).limit(limit)).all()
        return list(results), total

    def get_history_item(self, session: Session, history_id: str) -> UserImportHistory | None:
        return session.get(UserImportHistory, history_id)

    def _get_role_aliases(self, session: Session) -> dict[str, str]:
        mappings: dict[str, str] = {}
        for entry in self.auth_config_service.get_by_category(session, "users_role"):
            mappings[self._normalize_key(entry.key)] = entry.key
            mappings[self._normalize_key(entry.value)] = entry.key
        return mappings

    def _get_shift_aliases(self, session: Session) -> dict[str, str]:
        mappings: dict[str, str] = {}
        for entry in self.auth_config_service.get_by_category(session, "users_shift_type"):
            mappings[self._normalize_key(entry.key)] = entry.key
            mappings[self._normalize_key(entry.value)] = entry.key
        return mappings

    def parse_csv_file(self, content: bytes, filename: str) -> ParsedCSV:
        max_size = max(settings.IMPORT_MAX_CSV_SIZE_BYTES, 1)
        file_size = len(content)
        if file_size > max_size:
            raise ValueError(f"CSV file exceeds maximum allowed size of {max_size} bytes")
        if file_size == 0:
            raise ValueError("CSV file is empty")

        bom_detected = False
        if content[:3] == b"\xef\xbb\xbf":
            bom_detected = True
            content = content[3:]

        try:
            decoded = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("File is not valid UTF-8. Please save the CSV with UTF-8 encoding.") from exc

        sample = decoded[:8192]
        try:
            delimiter = csv.Sniffer().sniff(sample).delimiter
            if delimiter not in {",", ";", "\t", "|"}:
                delimiter = ","
        except csv.Error:
            delimiter = ","

        reader = csv.reader(io.StringIO(decoded), delimiter=delimiter)
        all_rows = list(reader)
        if not all_rows:
            raise ValueError("CSV file contains no data rows.")

        raw_headers = [self._normalize_key(header) for header in all_rows[0]]
        if not raw_headers or all(not header for header in raw_headers):
            raise ValueError("CSV file has no valid column headers.")

        file_issues: list[RowIssue] = []
        duplicate_headers = sorted({header for header in raw_headers if header and raw_headers.count(header) > 1})
        if duplicate_headers:
            file_issues.append(
                RowIssue(
                    field="headers",
                    code="duplicate_headers",
                    severity="error",
                    message=f"Duplicate column headers: {', '.join(duplicate_headers)}",
                )
            )

        missing_required = sorted(USER_IMPORT_REQUIRED_HEADERS - set(raw_headers))
        if missing_required:
            file_issues.append(
                RowIssue(
                    field="headers",
                    code="missing_required_headers",
                    severity="error",
                    message=f"Missing required columns: {', '.join(missing_required)}",
                )
            )

        unknown_headers = sorted(set(raw_headers) - USER_IMPORT_ALL_HEADERS)
        if unknown_headers:
            file_issues.append(
                RowIssue(
                    field="headers",
                    code="unknown_headers",
                    severity="warning",
                    message=f"Unknown columns will be ignored: {', '.join(unknown_headers)}",
                )
            )

        blank_headers = [header for header in raw_headers if not header]
        if blank_headers:
            file_issues.append(
                RowIssue(
                    field="headers",
                    code="blank_headers",
                    severity="error",
                    message=f"Found {len(blank_headers)} blank column header(s).",
                )
            )

        expected_cols = len(raw_headers)
        data_rows: list[dict[str, str]] = []
        for index, row in enumerate(all_rows[1:], start=1):
            stripped = [value.strip() for value in row]
            if all(value == "" for value in stripped):
                continue
            if len(stripped) != expected_cols:
                file_issues.append(
                    RowIssue(
                        field="row",
                        code="inconsistent_row_shape",
                        severity="error",
                        message=f"Row {index} has {len(stripped)} columns, expected {expected_cols}.",
                    )
                )
                continue
            data_rows.append({raw_headers[pos]: stripped[pos] for pos in range(expected_cols)})

        return ParsedCSV(
            headers=raw_headers,
            rows=data_rows,
            delimiter=delimiter,
            encoding="utf-8",
            bom_detected=bom_detected,
            row_count=len(data_rows),
            file_size=file_size,
            file_issues=file_issues,
        )

    def _find_existing_users(self, session: Session, employee_ids: set[str], emails: set[str]) -> tuple[dict[str, User], dict[str, User]]:
        employees: dict[str, User] = {}
        email_matches: dict[str, User] = {}

        if employee_ids:
            employee_stmt = select(User).where(
                func.lower(User.employee_id).in_({employee_id.lower() for employee_id in employee_ids})
            )
            for user in session.exec(employee_stmt).all():
                if user.employee_id:
                    employees[user.employee_id.lower()] = user

        if emails:
            email_stmt = select(User).where(
                func.lower(User.email).in_({email.lower() for email in emails})
            )
            for user in session.exec(email_stmt).all():
                if user.email:
                    email_matches[user.email.lower()] = user

        return employees, email_matches

    def _build_row_preview(
        self,
        session: Session,
        row_number: int,
        row: dict[str, str],
        role_aliases: dict[str, str],
        shift_aliases: dict[str, str],
        file_duplicate_counts: dict[str, int],
        employee_matches: dict[str, User],
        email_matches: dict[str, User],
    ) -> RowPreview:
        normalized = {header: self._normalize_text(row.get(header, "")) for header in USER_IMPORT_ALL_HEADERS}
        original = dict(normalized)
        resolved = dict(normalized)
        issues: list[RowIssue] = []

        for field_name in USER_IMPORT_REQUIRED_HEADERS:
            if not normalized.get(field_name):
                issues.append(
                    RowIssue(
                        field=field_name,
                        code="required",
                        severity="error",
                        message=f"{field_name.replace('_', ' ').title()} is required.",
                    )
                )

        role_before = normalized.get("role", "")
        role_key = role_aliases.get(self._normalize_key(role_before))
        if role_before and role_key:
            if self._normalize_key(role_before) != self._normalize_key(role_key):
                issues.append(
                    RowIssue(
                        field="role",
                        code="normalized_role",
                        severity="warning",
                        message=f"Role '{role_before}' normalized to '{role_key}'.",
                    )
                )
            resolved["role"] = role_key
        elif role_before:
            issues.append(
                RowIssue(
                    field="role",
                    code="unknown_role",
                    severity="error",
                    message=f"Role '{role_before}' does not exist in configuration.",
                )
            )

        shift_before = normalized.get("shift_type", "")
        shift_key = shift_aliases.get(self._normalize_key(shift_before))
        if shift_before and shift_key:
            if self._normalize_key(shift_before) != self._normalize_key(shift_key):
                issues.append(
                    RowIssue(
                        field="shift_type",
                        code="normalized_shift",
                        severity="warning",
                        message=f"Shift '{shift_before}' normalized to '{shift_key}'.",
                    )
                )
            resolved["shift_type"] = shift_key
        elif shift_before:
            issues.append(
                RowIssue(
                    field="shift_type",
                    code="unknown_shift",
                    severity="error",
                    message=f"Shift '{shift_before}' does not exist in configuration.",
                )
            )

        employee_id = self._normalize_text(resolved.get("employee_id"))
        email = self._normalize_email(resolved.get("email"))
        existing_user = employee_matches.get(employee_id.lower()) if employee_id else None
        matched_email_user = email_matches.get(email) if email else None

        duplicate_type: str | None = None
        duplicate_subtype: str | None = None
        recommended_action: str | None = None
        requires_user_decision = False
        group_key: str | None = None
        target_summary: str | None = None
        action = "create_user"
        stock_interpretation = "Will create a new user account."
        recommended_action = "create"

        if employee_id and file_duplicate_counts.get(employee_id.lower(), 0) > 1:
            duplicate_type = "duplicate_in_file"
            duplicate_subtype = "employee_id"
            recommended_action = "ignore"
            requires_user_decision = True
            group_key = f"duplicate_in_file:{employee_id.lower()}"
            issues.append(
                RowIssue(
                    field="employee_id",
                    code="duplicate_in_file",
                    severity="error",
                    message=f"Employee ID '{employee_id}' appears multiple times in this file.",
                )
            )
            stock_interpretation = "Needs a decision because the same employee ID appears multiple times in this file."

        if matched_email_user and (existing_user is None or matched_email_user.id != existing_user.id) and not matched_email_user.is_deleted:
            duplicate_type = "email_conflict"
            duplicate_subtype = "active_email"
            recommended_action = "block"
            requires_user_decision = True
            group_key = group_key or f"email_conflict:{email}"
            issues.append(
                RowIssue(
                    field="email",
                    code="email_conflict",
                    severity="error",
                    message=f"Email '{resolved.get('email')}' is already used by {matched_email_user.user_id}.",
                )
            )
            stock_interpretation = "Cannot import until the email is changed or the row is ignored."

        if existing_user:
            target_summary = f"{existing_user.user_id} · {existing_user.first_name} {existing_user.last_name}"
            if existing_user.is_deleted:
                duplicate_type = "existing_user"
                duplicate_subtype = "soft_deleted"
                recommended_action = "restore_and_update"
                requires_user_decision = True
                group_key = group_key or f"existing_user:deleted:{employee_id.lower()}"
                action = "restore_user"
                stock_interpretation = "Needs a decision to restore and update the soft-deleted user, or ignore this row."
            else:
                duplicate_type = "existing_user"
                duplicate_subtype = "active_match"
                recommended_action = "update_metadata"
                action = "update_user"
                stock_interpretation = "Will update the existing active user metadata."
                if not issues:
                    issues.append(
                        RowIssue(
                            field="employee_id",
                            code="existing_active_user",
                            severity="warning",
                            message=f"Employee ID '{employee_id}' matches active user {existing_user.user_id}.",
                        )
                    )
                group_key = group_key or f"existing_user:active:{employee_id.lower()}"

        error_count = sum(1 for issue in issues if issue.severity == "error")
        warning_count = sum(1 for issue in issues if issue.severity == "warning")
        if error_count > 0:
            status = RowStatus.ERROR
        elif requires_user_decision:
            status = RowStatus.WARNING
        elif warning_count > 0:
            status = RowStatus.WARNING
        else:
            status = RowStatus.READY

        return RowPreview(
            row_number=row_number,
            original_values=original,
            normalized_values=normalized,
            resolved_values=resolved,
            status=status,
            issues=issues,
            action=action,
            stock_interpretation=stock_interpretation,
            duplicate_type=duplicate_type,
            duplicate_subtype=duplicate_subtype,
            recommended_action=recommended_action,
            requires_user_decision=requires_user_decision,
            group_key=group_key,
            target_match_summary=target_summary,
            matched_user_id=existing_user.user_id if existing_user else None,
            matched_user_is_deleted=bool(existing_user.is_deleted) if existing_user else False,
        )

    def _build_previews(self, session: Session, parsed_csv: ParsedCSV) -> list[RowPreview]:
        role_aliases = self._get_role_aliases(session)
        shift_aliases = self._get_shift_aliases(session)
        employee_ids = {
            self._normalize_text(row.get("employee_id")).lower()
            for row in parsed_csv.rows
            if self._normalize_text(row.get("employee_id"))
        }
        emails = {
            self._normalize_email(row.get("email"))
            for row in parsed_csv.rows
            if self._normalize_email(row.get("email"))
        }
        file_duplicate_counts: dict[str, int] = {}
        for employee_id in employee_ids:
            file_duplicate_counts[employee_id] = sum(
                1
                for row in parsed_csv.rows
                if self._normalize_text(row.get("employee_id")).lower() == employee_id
            )

        employee_matches, email_matches = self._find_existing_users(session, employee_ids, emails)

        return [
            self._build_row_preview(
                session=session,
                row_number=index,
                row=row,
                role_aliases=role_aliases,
                shift_aliases=shift_aliases,
                file_duplicate_counts=file_duplicate_counts,
                employee_matches=employee_matches,
                email_matches=email_matches,
            )
            for index, row in enumerate(parsed_csv.rows, start=1)
        ]

    def _refresh_preview_rows(self, session: Session, preview_session: PreviewSession) -> None:
        preview_session.row_previews = self._build_previews(session, preview_session.parsed_csv)

    def _get_group_summary_parts(self, row_preview: RowPreview) -> tuple[str, str, str, bool, str | None]:
        if row_preview.group_key:
            if row_preview.duplicate_type == "duplicate_in_file":
                return (
                    row_preview.group_key,
                    "Duplicate employee IDs in file",
                    "error",
                    True,
                    row_preview.recommended_action,
                )
            if row_preview.duplicate_type == "existing_user" and row_preview.duplicate_subtype == "soft_deleted":
                return (
                    row_preview.group_key,
                    "Soft-deleted users to restore",
                    "warning",
                    True,
                    row_preview.recommended_action,
                )
            if row_preview.duplicate_type == "existing_user":
                return (
                    row_preview.group_key,
                    "Existing active users to update",
                    "info",
                    False,
                    row_preview.recommended_action,
                )
            if row_preview.duplicate_type == "email_conflict":
                return (
                    row_preview.group_key,
                    "Email conflicts",
                    "error",
                    True,
                    row_preview.recommended_action,
                )

        if row_preview.recommended_action == "create":
            return ("summary:new_users", "New users", "info", False, "create")

        return ("summary:other", "Other", row_preview.status.value, row_preview.requires_user_decision, row_preview.recommended_action)

    def build_duplicate_groups(self, preview_id: str) -> list[DuplicateGroup]:
        preview_session = self.get_preview_session(preview_id)
        if preview_session is None:
            return []

        grouped: dict[str, DuplicateGroup] = {}
        for row_preview in preview_session.row_previews:
            key, label, severity, requires_decision, recommended = self._get_group_summary_parts(row_preview)
            if key not in grouped:
                grouped[key] = DuplicateGroup(
                    key=key,
                    label=label,
                    count=0,
                    severity=severity,
                    recommended_action=recommended,
                    requires_user_decision=requires_decision,
                )
            grouped[key].count += 1
        return list(grouped.values())

    def row_matches_group_key(self, row_preview: RowPreview, group_key: str) -> bool:
        key, _, _, _, _ = self._get_group_summary_parts(row_preview)
        return key == group_key

    async def create_preview(self, session: Session, file: UploadFile, actor_id: UUID | None, mode: str = "skip") -> PreviewSession:
        content = await file.read()
        parsed_csv = self.parse_csv_file(content, file.filename or "user_import.csv")
        row_previews = self._build_previews(session, parsed_csv)
        preview_id = str(uuid.uuid4())
        preview_session = PreviewSession(
            id=preview_id,
            filename=file.filename or "user_import.csv",
            mode=mode,
            actor_id=actor_id,
            parsed_csv=parsed_csv,
            row_previews=row_previews,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=PREVIEW_SESSION_TTL_MINUTES),
        )
        self._preview_sessions[preview_id] = preview_session
        return preview_session

    def update_row_in_preview(self, session: Session, preview_id: str, row_number: int, updates: dict[str, str]) -> Optional[tuple[RowPreview, PreviewSession]]:
        preview_session = self.get_preview_session(preview_id)
        if preview_session is None:
            return None
        index = row_number - 1
        if index < 0 or index >= len(preview_session.parsed_csv.rows):
            return None

        row = preview_session.parsed_csv.rows[index]
        for key, value in updates.items():
            normalized_key = self._normalize_key(key)
            if normalized_key in USER_IMPORT_ALL_HEADERS:
                row[normalized_key] = self._normalize_text(value)

        self._refresh_preview_rows(session, preview_session)
        return preview_session.row_previews[index], preview_session

    def set_row_action(self, session: Session, preview_id: str, row_number: int, action_value: str) -> Optional[RowPreview]:
        preview_session = self.get_preview_session(preview_id)
        if preview_session is None:
            return None
        index = row_number - 1
        if index < 0 or index >= len(preview_session.row_previews):
            return None

        row_preview = preview_session.row_previews[index]
        row_preview.selected_action = action_value
        if action_value == "ignore":
            row_preview.status = RowStatus.INFO
            row_preview.requires_user_decision = False
            row_preview.stock_interpretation = "Will be skipped (ignored by user)."
        elif action_value == "restore_and_update":
            row_preview.status = RowStatus.READY
            row_preview.requires_user_decision = False
            row_preview.stock_interpretation = "Will restore the matching user and update metadata."
        elif action_value == "update_metadata":
            row_preview.status = RowStatus.READY
            row_preview.requires_user_decision = False
            row_preview.stock_interpretation = "Will update the matching user metadata."
        elif action_value == "create":
            row_preview.status = RowStatus.READY
            row_preview.requires_user_decision = False
            row_preview.stock_interpretation = "Will create a new user account."
        return row_preview

    def accept_recommended_actions(self, session: Session, preview_id: str) -> int:
        preview_session = self.get_preview_session(preview_id)
        if preview_session is None:
            return 0
        accepted = 0
        for row_preview in preview_session.row_previews:
            if row_preview.recommended_action and row_preview.recommended_action not in {"block"} and not row_preview.selected_action:
                self.set_row_action(session, preview_id, row_preview.row_number, row_preview.recommended_action)
                accepted += 1
        return accepted

    def ignore_all_blockers(self, preview_id: str) -> int:
        preview_session = self.get_preview_session(preview_id)
        if preview_session is None:
            return 0
        ignored = 0
        for row_preview in preview_session.row_previews:
            if row_preview.requires_user_decision and not row_preview.selected_action:
                row_preview.selected_action = "ignore"
                row_preview.requires_user_decision = False
                row_preview.status = RowStatus.INFO
                row_preview.stock_interpretation = "Will be skipped (ignored by user)."
                ignored += 1
        return ignored


    def _build_create_schema(self, row_preview: RowPreview) -> UserCreate:
        resolved = row_preview.resolved_values
        payload: dict[str, Any] = {
            "username": resolved["employee_id"],
            "employee_id": resolved["employee_id"],
            "first_name": resolved["first_name"],
            "last_name": resolved["last_name"],
            "role": resolved["role"],
            "shift_type": resolved["shift_type"],
        }
        if resolved.get("middle_name"):
            payload["middle_name"] = resolved["middle_name"]
        if resolved.get("email"):
            payload["email"] = resolved["email"]
        if resolved.get("contact_number"):
            payload["contact_number"] = resolved["contact_number"]
        return UserCreate.model_validate(payload)

    def _build_update_schema(self, row_preview: RowPreview) -> UserUpdate:
        resolved = row_preview.resolved_values
        payload: dict[str, Any] = {
            "username": resolved["employee_id"],
            "employee_id": resolved["employee_id"],
            "first_name": resolved["first_name"],
            "last_name": resolved["last_name"],
            "role": resolved["role"],
            "shift_type": resolved["shift_type"],
            "middle_name": resolved.get("middle_name") or None,
            "email": resolved.get("email") or None,
            "contact_number": resolved.get("contact_number") or None,
        }
        return UserUpdate.model_validate(payload)

    async def apply_preview(self, session: Session, preview_id: str) -> UserImportHistory:
        preview_session = self.get_preview_session(preview_id)
        if preview_session is None:
            raise ValueError("Preview session not found or expired. Please re-upload.")
        if preview_session.actor_id is None:
            raise ValueError("Import actor is missing for this preview session.")

        unresolved = sum(1 for row in preview_session.row_previews if row.requires_user_decision and not row.selected_action)
        if unresolved:
            raise ValueError(f"Cannot apply import: {unresolved} row(s) still require decisions.")

        blocking_errors = sum(
            1
            for row in preview_session.row_previews
            if row.status == RowStatus.ERROR and row.selected_action != "ignore"
        )
        if blocking_errors:
            raise ValueError(f"Cannot apply import: {blocking_errors} row(s) still have blocking errors.")

        success_count = 0
        failure_count = 0
        error_log: list[dict[str, Any]] = []
        credentials_rows: list[dict[str, str]] = []

        for row_preview in preview_session.row_previews:
            chosen_action = row_preview.selected_action or row_preview.recommended_action or "create"
            if chosen_action == "block":
                failure_count += 1
                error_log.append(
                    {"row": row_preview.row_number, "error": "Row remains blocked and was not imported.", "data": row_preview.resolved_values}
                )
                continue
            if chosen_action == "ignore":
                failure_count += 1
                error_log.append(
                    {"row": row_preview.row_number, "error": "Row was ignored by the user.", "data": row_preview.resolved_values}
                )
                continue

            try:
                with session.begin_nested():
                    if chosen_action in {"create", "create_user"}:
                        create_schema = self._build_create_schema(row_preview)
                        created_user, generated_credentials = self.user_service.create_imported_with_generated_credentials(
                            session,
                            create_schema,
                            actor_id=preview_session.actor_id,
                        )
                        credentials_rows.append(
                            {
                                "row_number": str(row_preview.row_number),
                                "user_id": created_user.user_id,
                                "employee_id": created_user.employee_id or "",
                                "full_name": created_user.full_name,
                                "role": created_user.role,
                                "username": created_user.username,
                                "generated_login_password_or_pin": generated_credentials.get("one_time_login_password", "") if generated_credentials else "",
                                "generated_secondary_password": generated_credentials.get("secondary_password", "") if generated_credentials else "",
                                "outcome": "created",
                            }
                        )
                    elif chosen_action == "update_metadata":
                        employee_id = row_preview.resolved_values["employee_id"]
                        target = session.exec(
                            select(User).where(func.lower(User.employee_id) == employee_id.lower())
                        ).first()
                        if target is None:
                            raise ValueError("Matching user no longer exists for update.")
                        update_schema = self._build_update_schema(row_preview)
                        updated_user = self.user_service.update(session, target, update_schema, actor_id=preview_session.actor_id)
                        generated_credentials = self.user_service.regenerate_import_credentials(
                            session,
                            updated_user,
                            actor_id=preview_session.actor_id,
                        )
                        auth_service.revoke_sessions_for_user(session, updated_user.id)
                        credentials_rows.append(
                            {
                                "row_number": str(row_preview.row_number),
                                "user_id": updated_user.user_id,
                                "employee_id": updated_user.employee_id or "",
                                "full_name": updated_user.full_name,
                                "role": updated_user.role,
                                "username": updated_user.username,
                                "generated_login_password_or_pin": generated_credentials.get("one_time_login_password", ""),
                                "generated_secondary_password": generated_credentials.get("secondary_password", ""),
                                "outcome": "updated",
                            }
                        )
                    elif chosen_action == "restore_and_update":
                        employee_id = row_preview.resolved_values["employee_id"]
                        target = session.exec(
                            select(User).where(func.lower(User.employee_id) == employee_id.lower())
                        ).first()
                        if target is None:
                            raise ValueError("Matching user no longer exists for restore.")
                        if target.is_deleted:
                            self.user_service.restore(session, target, actor_id=preview_session.actor_id)
                        update_schema = self._build_update_schema(row_preview)
                        updated_user = self.user_service.update(session, target, update_schema, actor_id=preview_session.actor_id)
                        generated_credentials = self.user_service.regenerate_import_credentials(
                            session,
                            updated_user,
                            actor_id=preview_session.actor_id,
                        )
                        auth_service.revoke_sessions_for_user(session, updated_user.id)
                        credentials_rows.append(
                            {
                                "row_number": str(row_preview.row_number),
                                "user_id": updated_user.user_id,
                                "employee_id": updated_user.employee_id or "",
                                "full_name": updated_user.full_name,
                                "role": updated_user.role,
                                "username": updated_user.username,
                                "generated_login_password_or_pin": generated_credentials.get("one_time_login_password", ""),
                                "generated_secondary_password": generated_credentials.get("secondary_password", ""),
                                "outcome": "restored_and_updated",
                            }
                        )
                    else:
                        raise ValueError(f"Unsupported action '{chosen_action}'.")
                success_count += 1
            except Exception as exc:
                failure_count += 1
                error_log.append(
                    {"row": row_preview.row_number, "error": str(exc), "data": row_preview.resolved_values}
                )

        history = UserImportHistory(
            filename=preview_session.filename,
            actor_id=preview_session.actor_id,
            total_rows=len(preview_session.row_previews),
            success_count=success_count,
            error_count=failure_count,
            status="completed" if failure_count == 0 else ("partial_success" if success_count > 0 else "failed"),
            error_log=error_log,
            credentials_log=credentials_rows,
        )
        session.add(history)
        session.commit()
        session.refresh(history)

        preview_session.credentials_rows = credentials_rows
        preview_session.applied_history_id = str(history.id)
        return history

    def build_corrected_csv(self, preview_id: str) -> str:
        preview_session = self.get_preview_session(preview_id)
        if preview_session is None:
            raise ValueError("Preview session not found or expired.")

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(preview_session.parsed_csv.headers)
        for row in preview_session.parsed_csv.rows:
            writer.writerow([row.get(header, "") for header in preview_session.parsed_csv.headers])
        output.seek(0)
        return output.getvalue()

    def build_template_csv(self) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(USER_IMPORT_TEMPLATE_HEADERS)
        writer.writerow(
            [
                "EMP-1001",
                "Alex",
                "Rivera",
                "",
                "alex.rivera@example.com",
                "09171234567",
                "staff",
                "day",
            ]
        )
        output.seek(0)
        return output.getvalue()

    def build_credentials_csv(self, preview_id: str) -> str:
        preview_session = self.get_preview_session(preview_id)
        if preview_session is None:
            raise ValueError("Preview session not found or expired.")
        if not preview_session.credentials_rows:
            raise ValueError("No generated credentials are available for this preview.")

        return self._serialize_credentials_csv(preview_session.credentials_rows)

    def build_credentials_csv_from_history(self, session: Session, history_id: str) -> str:
        history = self.get_history_item(session, history_id)
        if history is None:
            raise ValueError("Import history record not found.")

        credentials_rows = history.credentials_log or []
        if isinstance(credentials_rows, dict):
            credentials_rows = [credentials_rows]
        if not credentials_rows:
            raise ValueError("No generated credentials are available for this import.")

        return self._serialize_credentials_csv(credentials_rows)

    @staticmethod
    def _serialize_credentials_csv(credentials_rows: list[dict[str, str]]) -> str:
        headers = [
            "row_number",
            "user_id",
            "employee_id",
            "full_name",
            "role",
            "username",
            "generated_login_password_or_pin",
            "generated_secondary_password",
            "outcome",
        ]
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        writer.writerows(credentials_rows)
        output.seek(0)
        return output.getvalue()
