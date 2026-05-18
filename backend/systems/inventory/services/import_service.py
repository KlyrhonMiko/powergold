import csv
import io
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlmodel import Session
from fastapi import UploadFile

from core.config import settings
from systems.inventory.quantity import (
    TRACKABLE_UNIT_QUANTITY,
    ZERO_QUANTITY,
    format_quantity,
    parse_quantity,
    require_whole_quantity,
)
from systems.inventory.models.inventory import InventoryItem
from systems.inventory.models.import_history import ImportHistory
from systems.inventory.services.inventory_service import InventoryService
from systems.inventory.schemas.inventory_schemas import InventoryItemCreate
from systems.inventory.schemas.inventory_batch_schemas import InventoryBatchCreate


REQUIRED_HEADERS = {"name", "is_trackable"}
ALL_KNOWN_HEADERS = {
    "name",
    "category",
    "classification",
    "item_type",
    "unit_of_measure",
    "is_trackable",
    "description",
    "condition",
    "quantity",
    "serial_number",
    "expiration_date",
}

PREVIEW_SESSION_TTL_MINUTES = 30


class RowStatus(str, Enum):
    READY = "ready"
    WARNING = "warning"
    ERROR = "error"
    INFO = "info"


class ImportAction(str, Enum):
    CREATE_ITEM_ONLY = "create_item_only"
    CREATE_ITEM_AND_UNIT = "create_item_and_unit"
    CREATE_ITEM_AND_BATCH = "create_item_and_batch"
    UPDATE_ITEM_ONLY = "update_item_only"
    UPDATE_EXISTING_UNIT = "update_existing_unit"
    SKIP_DUPLICATE = "skip_duplicate"
    OVERWRITE_DUPLICATE = "overwrite_duplicate"
    IGNORE = "ignore"
    BLOCK = "block"
    APPEND_STOCK = "append_stock"


@dataclass
class RowIssue:
    field: str
    code: str
    severity: str  # error | warning | info
    message: str


@dataclass
class RowPreview:
    row_number: int
    original_values: dict[str, str]
    normalized_values: dict[str, str]
    resolved_values: dict[str, str]
    status: RowStatus
    issues: list[RowIssue] = field(default_factory=list)
    action: Optional[ImportAction] = None
    stock_interpretation: str = ""
    duplicate_type: Optional[str] = None  # none | existing_item | existing_serial | duplicate_in_file | conflicting_item_data
    duplicate_subtype: Optional[str] = None  # exact_match | safe_enrichment | conflicting_change | repeated_row | repeated_serial | ambiguous_stock
    recommended_action: Optional[str] = None  # create | update_metadata | append_stock | ignore | manual_review | block
    selected_action: Optional[str] = None  # user override
    requires_user_decision: bool = False
    group_key: Optional[str] = None  # e.g. "serial:SN-001", "item:Name|class|type"
    target_match_summary: Optional[str] = None


@dataclass
class DuplicateGroup:
    key: str
    label: str
    count: int
    severity: str  # error | warning | info
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
class PreviewSession:
    id: str
    filename: str
    mode: str
    actor_id: Optional[UUID]
    parsed_csv: ParsedCSV
    row_previews: list[RowPreview]
    created_at: datetime
    expires_at: datetime


class ImportService:
    def __init__(self):
        self.inventory_service = InventoryService()
        self._preview_sessions: dict[str, PreviewSession] = {}

    @staticmethod
    def _parse_optional_quantity(value: str) -> Any:
        text = str(value or "").strip()
        if not text:
            return None
        return parse_quantity(text)

    def _unwrap_result_value(self, value: Any) -> Any:
        if value is None:
            return None
        if hasattr(value, "_mapping"):
            values = list(value._mapping.values())
            return values[0] if len(values) == 1 else value
        if isinstance(value, tuple):
            return value[0] if len(value) == 1 else value
        return value

    def _cleanup_expired_sessions(self) -> None:
        now = datetime.utcnow()
        expired = [
            sid
            for sid, session in self._preview_sessions.items()
            if session.expires_at <= now
        ]
        for sid in expired:
            del self._preview_sessions[sid]

    def _parse_bool(self, value: any) -> bool:
        if value is None:
            return False
        if isinstance(value, bool):
            return value
        s = str(value).lower().strip()
        return s in ("true", "1", "yes", "y", "t", "on")

    def get_history(self, session: Session, skip: int = 0, limit: int = 100) -> tuple[list[ImportHistory], int]:
        statement = select(ImportHistory).order_by(ImportHistory.created_at.desc())
        count_stmt = select(func.count(ImportHistory.id))
        total = int(self._unwrap_result_value(session.exec(count_stmt).one()) or 0)

        results = session.exec(statement.offset(skip).limit(limit)).all()
        models = [self._unwrap_result_value(row) for row in results]

        return models, total

    # ------------------------------------------------------------------
    # Phase 1: CSV parsing
    # ------------------------------------------------------------------

    def parse_csv_file(self, content: bytes, filename: str) -> ParsedCSV:
        max_size = max(settings.IMPORT_MAX_CSV_SIZE_BYTES, 1)
        file_size = len(content)
        if file_size > max_size:
            raise ValueError(
                f"CSV file exceeds maximum allowed size of {max_size} bytes"
            )
        if file_size == 0:
            raise ValueError("CSV file is empty")

        bom_detected = False
        if content[:3] == b"\xef\xbb\xbf":
            bom_detected = True
            content = content[3:]

        try:
            decoded = content.decode("utf-8")
        except UnicodeDecodeError:
            raise ValueError(
                "File is not valid UTF-8. Please save the CSV with UTF-8 encoding."
            )

        sample = decoded[:8192]
        try:
            sniffer = csv.Sniffer()
            delimiter = sniffer.sniff(sample).delimiter
            if delimiter not in {",", ";", "\t", "|"}:
                delimiter = ","
        except csv.Error:
            delimiter = ","

        stream = io.StringIO(decoded)
        reader = csv.reader(stream, delimiter=delimiter)
        all_rows = list(reader)

        if not all_rows:
            raise ValueError("CSV file contains no data rows.")

        raw_headers = [h.strip().lower() for h in all_rows[0]]
        if not raw_headers or all(h == "" for h in raw_headers):
            raise ValueError("CSV file has no valid column headers.")
        file_issues: list[RowIssue] = []

        duplicate_headers = [h for h in raw_headers if raw_headers.count(h) > 1]
        duplicate_headers = list(dict.fromkeys(duplicate_headers))
        if duplicate_headers:
            file_issues.append(
                RowIssue(
                    field="headers",
                    code="duplicate_headers",
                    severity="error",
                    message=f"Duplicate column headers: {', '.join(duplicate_headers)}",
                )
            )

        missing_required = REQUIRED_HEADERS - set(raw_headers)
        if missing_required:
            file_issues.append(
                RowIssue(
                    field="headers",
                    code="missing_required_headers",
                    severity="error",
                    message=f"Missing required columns: {', '.join(missing_required)}",
                )
            )

        unknown_headers = set(raw_headers) - ALL_KNOWN_HEADERS
        if unknown_headers:
            file_issues.append(
                RowIssue(
                    field="headers",
                    code="unknown_headers",
                    severity="warning",
                    message=f"Unknown columns will be ignored: {', '.join(unknown_headers)}",
                )
            )

        blank_headers = [h for h in raw_headers if not h]
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
        data_rows = []
        for i, row in enumerate(all_rows[1:], start=1):
            stripped = [v.strip() for v in row]
            if all(v == "" for v in stripped):
                continue
            if len(stripped) != expected_cols:
                file_issues.append(
                    RowIssue(
                        field="row",
                        code="inconsistent_row_shape",
                        severity="error",
                        message=(
                            f"Row {i} has {len(stripped)} columns, "
                            f"expected {expected_cols}. Row data may be misaligned."
                        ),
                    )
                )
                continue
            row_dict = {raw_headers[j]: stripped[j] for j in range(expected_cols)}
            data_rows.append(row_dict)

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

    # ------------------------------------------------------------------
    # Phase 2: Row preview builder
    # ------------------------------------------------------------------

    def build_row_preview(
        self,
        session: Session,
        row_number: int,
        row: dict[str, str],
        mode: str,
        all_rows: list[dict[str, str]],
    ) -> RowPreview:
        normalized = {k: v for k, v in row.items()}
        original = dict(normalized)
        issues: list[RowIssue] = []

        rescue_warnings = self._rescue_mapping_preview(session, normalized)
        issues.extend(rescue_warnings)

        resolved = dict(normalized)

        name = normalized.get("name", "")
        is_trackable_raw = normalized.get("is_trackable", "false")
        try:
            is_trackable = self._parse_bool(is_trackable_raw)
        except Exception:
            is_trackable = False

        if not name:
            issues.append(
                RowIssue(
                    field="name",
                    code="missing_name",
                    severity="error",
                    message="Item name is required.",
                )
            )

        if is_trackable_raw and str(is_trackable_raw).lower().strip() not in (
            "true", "1", "yes", "y", "t", "on", "false", "0", "no", "n", "f", "off", ""
        ):
            issues.append(
                RowIssue(
                    field="is_trackable",
                    code="invalid_boolean",
                    severity="error",
                    message=f"Invalid boolean value: '{is_trackable_raw}'. Use true or false.",
                )
            )

        classification = normalized.get("classification", "")
        item_type = normalized.get("item_type", "")
        category = normalized.get("category", "")
        unit_of_measure = normalized.get("unit_of_measure", "")

        if classification and not self.inventory_service.config_service.exists(
            session, classification, "inventory_classification"
        ):
            issues.append(
                RowIssue(
                    field="classification",
                    code="unknown_classification",
                    severity="warning",
                    message=f"Classification '{classification}' is not in the dictionary.",
                )
            )
        if item_type and not self.inventory_service.config_service.exists(
            session, item_type, "inventory_item_type"
        ):
            issues.append(
                RowIssue(
                    field="item_type",
                    code="unknown_item_type",
                    severity="warning",
                    message=f"Item type '{item_type}' is not in the dictionary.",
                )
            )
        if category and not self.inventory_service.config_service.exists(
            session, category, "inventory_category"
        ):
            issues.append(
                RowIssue(
                    field="category",
                    code="unknown_category",
                    severity="warning",
                    message=f"Category '{category}' is not in the dictionary.",
                )
            )
        if unit_of_measure and not self.inventory_service.config_service.exists(
            session, unit_of_measure, "inventory_unit_of_measure"
        ):
            issues.append(
                RowIssue(
                    field="unit_of_measure",
                    code="unknown_unit_of_measure",
                    severity="warning",
                    message=f"Unit of measure '{unit_of_measure}' is not in the dictionary.",
                )
            )

        qty_str = str(normalized.get("quantity", "") or "").strip()
        serial_str = str(normalized.get("serial_number", "") or "").strip()
        unit_of_measure_str = str(unit_of_measure or "").strip()
        qty_value = None
        qty_parse_error = False
        if qty_str:
            try:
                qty_value = self._parse_optional_quantity(qty_str)
            except ValueError:
                qty_parse_error = True

        expiration_str = str(normalized.get("expiration_date", "") or "").strip()
        if expiration_str:
            try:
                datetime.fromisoformat(expiration_str)
            except Exception:
                try:
                    datetime.strptime(expiration_str, "%Y-%m-%d")
                except Exception:
                    issues.append(
                        RowIssue(
                            field="expiration_date",
                            code="invalid_expiration_date",
                            severity="error",
                            message=f"Invalid date '{expiration_str}'. Use YYYY-MM-DD.",
                        )
                    )

        condition = normalized.get("condition", "")
        if condition and not self.inventory_service.config_service.exists(
            session, condition, "inventory_units_condition_weights"
        ):
            issues.append(
                RowIssue(
                    field="condition",
                    code="unknown_condition",
                    severity="warning",
                    message=f"Condition '{condition}' is not in the dictionary. Defaulting to 'good'.",
                )
            )

        action: Optional[ImportAction] = None
        stock_interpretation = ""
        duplicate_type: Optional[str] = None
        duplicate_subtype: Optional[str] = None
        recommended_action: Optional[str] = None
        requires_user_decision = False
        group_key: Optional[str] = None
        target_match_summary: Optional[str] = None

        # --- resolve existing item ---
        existing_item = None
        canonical_cls = self._get_canonical(session, classification, "inventory_classification")
        canonical_type = self._get_canonical(session, item_type, "inventory_item_type")
        canonical_cat = self._get_canonical(session, category, "inventory_category")
        canonical_uom = self._get_canonical(session, unit_of_measure_str, "inventory_unit_of_measure")
        if name:
            existing_item = self._unwrap_result_value(session.exec(
                select(InventoryItem).where(
                    InventoryItem.name == name,
                    InventoryItem.classification == canonical_cls,
                    InventoryItem.item_type == canonical_type,
                    InventoryItem.is_deleted.is_(False),
                )
            ).first())

        # --- resolve existing unit ---
        existing_unit = None
        from systems.inventory.models.inventory_unit import InventoryUnit
        if serial_str:
            existing_unit = self._unwrap_result_value(session.exec(
                select(InventoryUnit).where(InventoryUnit.serial_number == serial_str)
            ).first())

        # --- duplicate-in-file detection ---
        duplicate_in_file_count = 0
        same_serial_in_file = False
        if serial_str:
            duplicate_in_file_count = sum(
                1 for r in all_rows
                if str(r.get("serial_number", "") or "").strip() == serial_str
            )
            same_serial_in_file = duplicate_in_file_count > 1

        catalog_only = (qty_value is None or qty_value == ZERO_QUANTITY) and not serial_str

        if is_trackable:
            if unit_of_measure_str:
                issues.append(
                    RowIssue(
                        field="unit_of_measure",
                        code="unit_of_measure_not_allowed_for_trackable",
                        severity="error",
                        message="unit_of_measure must be empty for trackable items.",
                    )
                )
        elif not unit_of_measure_str:
            issues.append(
                RowIssue(
                    field="unit_of_measure",
                    code="unit_of_measure_required_for_non_trackable",
                    severity="error",
                    message="unit_of_measure is required for non-trackable items.",
                )
            )

        # ================================================================
        # DUPLICATE CLASSIFICATION ENGINE
        # ================================================================

        if catalog_only:
            # --- catalog-only rows ---
            if existing_item:
                duplicate_type = "existing_item"
                group_key = f"item:{name}|{canonical_cls}|{canonical_type}"
                target_match_summary = f"Item '{name}' already exists."

                # check if imported enrichment fields differ from existing
                existing_cat = getattr(existing_item, 'category', None)
                existing_cls = getattr(existing_item, 'classification', None)
                existing_typ = getattr(existing_item, 'item_type', None)
                existing_uom = getattr(existing_item, 'unit_of_measure', None)

                has_conflict = False
                if canonical_cat and canonical_cat != (existing_cat or ""):
                    has_conflict = True
                if canonical_cls and canonical_cls != (existing_cls or ""):
                    has_conflict = True
                if canonical_type and canonical_type != (existing_typ or ""):
                    has_conflict = True
                if canonical_uom and canonical_uom != (existing_uom or ""):
                    has_conflict = True

                if has_conflict:
                    duplicate_subtype = "conflicting_change"
                    recommended_action = "manual_review"
                    requires_user_decision = True
                    stock_interpretation = "Item exists with different metadata — needs review."
                    status = RowStatus.ERROR
                    issues.append(RowIssue(
                        field="name", code="conflicting_item_update",
                        severity="error",
                        message=f"Item '{name}' already exists with different classification/type/category/unit_of_measure. Review required.",
                    ))
                else:
                    duplicate_subtype = "exact_match"
                    recommended_action = "ignore"
                    stock_interpretation = "Item already exists; no changes needed."
                    status = RowStatus.INFO
                    issues.append(RowIssue(
                        field="name", code="exact_duplicate_item",
                        severity="info",
                        message=f"Item '{name}' already exists. Row will be skipped as a duplicate.",
                    ))
            else:
                duplicate_type = "none"
                recommended_action = "create"
                action = ImportAction.CREATE_ITEM_ONLY
                stock_interpretation = "Will create item record only (no stock)."
                status = RowStatus.INFO

        elif is_trackable:
            # --- trackable / unit rows ---
            if not serial_str:
                issues.append(RowIssue(
                    field="serial_number", code="missing_serial_for_trackable",
                    severity="error",
                    message="Serial number is required for trackable items.",
                ))
                duplicate_type = "none"
                recommended_action = "block"
                requires_user_decision = True
                status = RowStatus.ERROR
                stock_interpretation = "Cannot import: serial number is missing."
            elif same_serial_in_file:
                duplicate_type = "duplicate_in_file"
                duplicate_subtype = "repeated_serial"
                group_key = f"file_serial:{serial_str}"
                recommended_action = "manual_review"
                requires_user_decision = True
                status = RowStatus.ERROR
                target_match_summary = f"Serial '{serial_str}' appears {duplicate_in_file_count} times in this file."
                stock_interpretation = "Serial appears multiple times in file — needs review."
                issues.append(RowIssue(
                    field="serial_number", code="duplicate_serial_in_file",
                    severity="error",
                    message=f"Serial '{serial_str}' appears {duplicate_in_file_count} times in this file.",
                ))
            elif existing_unit:
                duplicate_type = "existing_serial"
                group_key = f"serial:{serial_str}"
                target_match_summary = f"Serial '{serial_str}' already belongs to item '{getattr(existing_unit, 'inventory_uuid', 'unknown')}'."

                # existing serial collision: always requires review
                recommended_action = "manual_review"
                requires_user_decision = True
                duplicate_subtype = "existing_unit"
                status = RowStatus.WARNING
                stock_interpretation = f"Serial '{serial_str}' already exists. Needs review."
                issues.append(RowIssue(
                    field="serial_number", code="serial_already_exists",
                    severity="warning",
                    message=f"Serial '{serial_str}' already exists in inventory. Review required — you can choose to keep existing or update metadata.",
                ))
            else:
                duplicate_type = "none"
                recommended_action = "create"
                if existing_item:
                    action = ImportAction.CREATE_ITEM_AND_UNIT
                    stock_interpretation = f"Will add 1 unit (serial: {serial_str}) to existing item."
                else:
                    action = ImportAction.CREATE_ITEM_AND_UNIT
                    stock_interpretation = f"Will create item + 1 unit (serial: {serial_str})."
                status = RowStatus.READY

            if qty_str:
                if qty_parse_error:
                    issues.append(RowIssue(
                        field="quantity", code="invalid_trackable_quantity",
                        severity="error",
                        message=f"Invalid quantity: '{qty_str}'. Trackable quantities must be blank or whole numbers.",
                    ))
                else:
                    try:
                        require_whole_quantity(qty_value, field_name="quantity")
                    except ValueError:
                        issues.append(RowIssue(
                            field="quantity", code="fractional_quantity_not_allowed_for_trackable",
                            severity="error",
                            message="Trackable rows cannot use fractional quantity values.",
                        ))
                    if qty_value not in (ZERO_QUANTITY, TRACKABLE_UNIT_QUANTITY):
                        issues.append(RowIssue(
                            field="quantity", code="quantity_ignored_for_trackable",
                            severity="warning",
                            message="Quantity is ignored for trackable items (each row = 1 unit).",
                        ))

        else:
            # --- non-trackable / batch rows ---
            if catalog_only:
                if existing_item and existing_item.unit_of_measure not in (None, canonical_uom):
                    duplicate_type = "existing_item"
                    duplicate_subtype = "conflicting_change"
                    recommended_action = "manual_review"
                    requires_user_decision = True
                    status = RowStatus.ERROR
                    stock_interpretation = "Item exists with different unit of measure — needs review."
                    issues.append(RowIssue(
                        field="unit_of_measure",
                        code="conflicting_unit_of_measure",
                        severity="error",
                        message=f"Item '{name}' already exists with a different unit_of_measure.",
                    ))
                elif existing_item:
                    duplicate_type = "existing_item"
                    duplicate_subtype = "exact_match"
                    recommended_action = "ignore"
                    stock_interpretation = "Item already exists; no changes needed."
                    status = RowStatus.INFO
                else:
                    duplicate_type = "none"
                    recommended_action = "create"
                    action = ImportAction.CREATE_ITEM_ONLY
                    stock_interpretation = "Will create item record only (no stock)."
                    status = RowStatus.INFO
            elif not qty_str:
                issues.append(RowIssue(
                    field="quantity", code="quantity_required_for_non_trackable",
                    severity="error",
                    message="Quantity is required for non-trackable items.",
                ))
                action = None
                stock_interpretation = "Cannot import: quantity is missing."
                status = RowStatus.ERROR
                duplicate_type = "none"
                recommended_action = "block"
                requires_user_decision = True
            else:
                try:
                    if qty_parse_error:
                        raise ValueError
                    qty = qty_value
                    if qty <= 0:
                        issues.append(RowIssue(
                            field="quantity", code="quantity_must_be_positive_decimal",
                            severity="error",
                            message="Quantity must be greater than 0.",
                        ))
                        action = None
                        stock_interpretation = "Cannot import: invalid quantity."
                        status = RowStatus.ERROR
                        duplicate_type = "none"
                        recommended_action = "block"
                        requires_user_decision = True
                    else:
                        if existing_item:
                            if existing_item.unit_of_measure not in (None, canonical_uom):
                                duplicate_type = "existing_item"
                                duplicate_subtype = "conflicting_change"
                                group_key = f"item:{name}|{canonical_cls}|{canonical_type}"
                                target_match_summary = f"Item '{name}' already exists."
                                recommended_action = "manual_review"
                                requires_user_decision = True
                                stock_interpretation = "Item exists with different unit of measure — needs review."
                                status = RowStatus.ERROR
                                issues.append(RowIssue(
                                    field="unit_of_measure",
                                    code="conflicting_unit_of_measure",
                                    severity="error",
                                    message=f"Item '{name}' already exists with a different unit_of_measure.",
                                ))
                            else:
                                duplicate_type = "existing_item"
                                duplicate_subtype = "ambiguous_stock"
                                group_key = f"item:{name}|{canonical_cls}|{canonical_type}"
                                target_match_summary = f"Item '{name}' already exists."
                                recommended_action = "append_stock"
                                action = ImportAction.APPEND_STOCK
                                stock_interpretation = f"Will add {format_quantity(qty)} units of stock to existing item."
                                status = RowStatus.READY
                        else:
                            duplicate_type = "none"
                            recommended_action = "create"
                            action = ImportAction.CREATE_ITEM_AND_BATCH
                            stock_interpretation = f"Will create item + batch of {format_quantity(qty)}."
                            status = RowStatus.READY
                except ValueError:
                    issues.append(RowIssue(
                        field="quantity", code="quantity_must_be_positive_decimal",
                        severity="error",
                        message=f"Invalid quantity: '{qty_str}'. Must be a positive number with up to 3 decimal places.",
                    ))
                    action = None
                    stock_interpretation = "Cannot import: invalid quantity."
                    status = RowStatus.ERROR
                    duplicate_type = "none"
                    recommended_action = "block"
                    requires_user_decision = True

        if serial_str and not is_trackable:
            issues.append(
                RowIssue(
                    field="serial_number",
                    code="serial_ignored_for_non_trackable",
                    severity="warning",
                    message="Serial number is ignored for non-trackable items.",
                )
            )

        has_errors = any(i.severity == "error" for i in issues)
        has_warnings = any(i.severity == "warning" for i in issues)

        if status != RowStatus.ERROR:
            if has_errors:
                status = RowStatus.ERROR
            elif has_warnings and status != RowStatus.INFO:
                status = RowStatus.WARNING

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
            selected_action=None,
            requires_user_decision=requires_user_decision,
            group_key=group_key,
            target_match_summary=target_match_summary,
        )

    # ------------------------------------------------------------------
    # Phase 3: Preview session management
    # ------------------------------------------------------------------

    def create_preview_session(
        self,
        session: Session,
        content: bytes,
        filename: str,
        mode: str,
        actor_id: Optional[UUID],
    ) -> PreviewSession:
        parsed = self.parse_csv_file(content, filename)
        row_previews = []
        for i, row in enumerate(parsed.rows, start=1):
            preview = self.build_row_preview(session, i, row, mode, parsed.rows)
            row_previews.append(preview)

        self._cleanup_expired_sessions()
        preview_id = str(uuid.uuid4())
        now = datetime.utcnow()
        ps = PreviewSession(
            id=preview_id,
            filename=filename,
            mode=mode,
            actor_id=actor_id,
            parsed_csv=parsed,
            row_previews=row_previews,
            created_at=now,
            expires_at=now + timedelta(minutes=PREVIEW_SESSION_TTL_MINUTES),
        )
        self._preview_sessions[preview_id] = ps
        return ps

    def get_preview_session(self, preview_id: str) -> Optional[PreviewSession]:
        self._cleanup_expired_sessions()
        return self._preview_sessions.get(preview_id)

    def update_row_in_preview(
        self,
        session: Session,
        preview_id: str,
        row_number: int,
        field_updates: dict[str, str],
    ) -> Optional[tuple[RowPreview, PreviewSession]]:
        ps = self.get_preview_session(preview_id)
        if ps is None:
            return None

        idx = row_number - 1
        if idx < 0 or idx >= len(ps.parsed_csv.rows):
            return None

        for field_name, value in field_updates.items():
            if field_name in ps.parsed_csv.headers:
                ps.parsed_csv.rows[idx][field_name] = value

        updated_preview = self.build_row_preview(
            session, row_number, ps.parsed_csv.rows[idx], ps.mode, ps.parsed_csv.rows
        )
        ps.row_previews[idx] = updated_preview
        return updated_preview, ps

    # ------------------------------------------------------------------
    # Duplicate group summary
    # ------------------------------------------------------------------

    def build_duplicate_groups(self, preview_id: str) -> list[DuplicateGroup]:
        ps = self.get_preview_session(preview_id)
        if ps is None:
            return []

        groups: dict[str, DuplicateGroup] = {}

        for rp in ps.row_previews:
            key, label, severity, needs_decision, recommended_action = self._get_group_summary_parts(rp)

            if key not in groups:
                groups[key] = DuplicateGroup(
                    key=key,
                    label=label,
                    count=0,
                    severity=severity,
                    recommended_action=recommended_action,
                    requires_user_decision=needs_decision,
                )

            groups[key].count += 1

        sorted_groups = sorted(groups.values(), key=lambda g: (-g.count, g.label))
        return sorted_groups

    def _get_group_summary_parts(
        self,
        rp: RowPreview,
    ) -> tuple[str, str, str, bool, str | None]:
        dt = rp.duplicate_type or "none"
        subtype = rp.duplicate_subtype or ""
        rec = rp.recommended_action or ""
        needs_dec = rp.requires_user_decision

        if dt == "existing_serial":
            return (
                "summary:existing_serial_conflicts",
                "Existing serial collisions",
                "warning" if needs_dec else "info",
                needs_dec,
                rec,
            )

        if dt == "duplicate_in_file":
            return (
                "summary:file_duplicate_conflicts",
                "Duplicate rows in file",
                "error" if needs_dec else "warning",
                needs_dec,
                rec,
            )

        if dt == "existing_item" and subtype == "conflicting_change":
            return (
                "summary:conflicting_item_metadata",
                "Conflicting item metadata",
                "error",
                True,
                rec,
            )

        if dt == "existing_item" and subtype == "ambiguous_stock":
            return (
                "summary:append_stock",
                "Add stock to existing items",
                "info",
                False,
                rec,
            )

        if dt == "existing_item" and subtype == "exact_match":
            return (
                "summary:exact_duplicates",
                "Exact duplicates (will be skipped)",
                "info",
                False,
                rec,
            )

        if rec == "create":
            return (
                "summary:new_rows",
                "New rows",
                "info",
                False,
                rec,
            )

        if rec == "ignore":
            return (
                "summary:ignored_rows",
                "Ignored rows",
                "info",
                False,
                rec,
            )

        if rec == "append_stock":
            return (
                "summary:append_stock",
                "Add stock to existing items",
                "info",
                False,
                rec,
            )

        if rec == "update_metadata":
            return (
                "summary:metadata_updates",
                "Metadata updates",
                "info",
                False,
                rec,
            )

        return (
            "summary:other",
            f"Other ({dt}/{rec})",
            "info",
            needs_dec,
            rec,
        )

    def row_matches_group_key(self, rp: RowPreview, group_key: str) -> bool:
        key, _, _, _, _ = self._get_group_summary_parts(rp)
        return key == group_key

    # ------------------------------------------------------------------
    # Action selection methods
    # ------------------------------------------------------------------

    def set_row_action(
        self,
        session: Session,
        preview_id: str,
        row_number: int,
        action_value: str,
    ) -> Optional[RowPreview]:
        ps = self.get_preview_session(preview_id)
        if ps is None:
            return None
        idx = row_number - 1
        if idx < 0 or idx >= len(ps.row_previews):
            return None

        rp = ps.row_previews[idx]
        rp.selected_action = action_value

        if action_value == "ignore":
            rp.status = RowStatus.INFO
            rp.requires_user_decision = False
            rp.stock_interpretation = "Will be skipped (ignored by user)."
        elif action_value == "update_metadata" and rp.duplicate_type in ("existing_item", "existing_serial"):
            rp.status = RowStatus.READY
            rp.requires_user_decision = False
            rp.stock_interpretation = "Will update existing record metadata."
        elif action_value == "create" and rp.duplicate_type == "existing_serial":
            rp.status = RowStatus.READY
            rp.requires_user_decision = False
            rp.stock_interpretation = "Will create new unit (ignoring existing serial)."
        else:
            rp.status = RowStatus.READY
            rp.requires_user_decision = False

        return rp

    def set_group_action(
        self,
        session: Session,
        preview_id: str,
        group_key: str,
        action_value: str,
    ) -> int:
        ps = self.get_preview_session(preview_id)
        if ps is None:
            return 0
        count = 0
        for rp in ps.row_previews:
            if rp.group_key == group_key or rp.duplicate_type == group_key:
                rp.selected_action = action_value
                rp.status = RowStatus.READY
                rp.requires_user_decision = False
                rp.stock_interpretation = f"Will apply action: {action_value}."
                count += 1
        return count

    def accept_recommended_actions(self, session: Session, preview_id: str) -> int:
        ps = self.get_preview_session(preview_id)
        if ps is None:
            return 0
        count = 0
        for rp in ps.row_previews:
            if rp.recommended_action and rp.recommended_action not in ("manual_review", "block"):
                if not rp.selected_action:
                    rp.selected_action = rp.recommended_action
                    count += 1
        return count

    def reset_actions(self, preview_id: str) -> int:
        ps = self.get_preview_session(preview_id)
        if ps is None:
            return 0
        count = 0
        for rp in ps.row_previews:
            if rp.selected_action is not None:
                rp.selected_action = None
                count += 1
        return count

    def ignore_all_blockers(self, preview_id: str) -> int:
        ps = self.get_preview_session(preview_id)
        if ps is None:
            return 0
        count = 0
        for rp in ps.row_previews:
            if rp.requires_user_decision and not rp.selected_action:
                rp.selected_action = "ignore"
                rp.status = RowStatus.INFO
                rp.requires_user_decision = False
                rp.stock_interpretation = "Will be skipped (ignored by user)."
                count += 1
        return count

    # ------------------------------------------------------------------
    # Phase 4: Apply (commit) the import
    # ------------------------------------------------------------------

    async def apply_preview(
        self,
        session: Session,
        preview_id: str,
    ) -> ImportHistory:
        ps = self.get_preview_session(preview_id)
        if ps is None:
            raise ValueError("Preview session not found or expired. Please re-upload.")

        unresolved = sum(
            1 for rp in ps.row_previews
            if rp.requires_user_decision and not rp.selected_action
        )
        if unresolved > 0:
            raise ValueError(
                f"Cannot apply import: {unresolved} row(s) require user decisions. "
                "Review serial collisions and conflicting item metadata before applying."
            )

        error_count = sum(
            1 for rp in ps.row_previews
            if rp.status == RowStatus.ERROR and not rp.selected_action
        )
        if error_count > 0:
            raise ValueError(
                f"Cannot apply import with {error_count} row error(s). "
                "Fix all errors before applying."
            )

        filename = ps.filename
        actor_id = ps.actor_id
        rows = ps.parsed_csv.rows

        history = ImportHistory(
            filename=filename,
            status="processing",
            total_rows=len(rows),
            success_count=0,
            error_count=0,
            error_log=[],
            actor_id=actor_id,
        )
        session.add(history)
        session.commit()
        session.refresh(history)

        errors = []
        created_count = 0
        ignored_count = 0
        apply_error_count = 0

        original_commit = session.commit
        session.commit = session.flush

        try:
            for i, row in enumerate(rows, start=1):
                idx = i - 1
                rp = ps.row_previews[idx] if idx < len(ps.row_previews) else None

                final_action = rp.selected_action if (rp and rp.selected_action) else (
                    rp.recommended_action if rp else None
                )

                if final_action in ("ignore", "skip_duplicate"):
                    ignored_count += 1
                    continue

                try:
                    row = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
                    self._rescue_mapping(session, row)

                    name = row.get("name") or ""
                    is_trackable = self._parse_bool(row.get("is_trackable", "false"))

                    if not name:
                        raise ValueError("Missing mandatory item field: name")

                    if final_action == "update_metadata":
                        self._apply_update_metadata(session, row, actor_id)
                    elif final_action in ("create", "append_stock"):
                        self._apply_create_or_append(session, row, is_trackable, actor_id)
                    else:
                        self._apply_create_or_append(session, row, is_trackable, actor_id)

                    created_count += 1
                except Exception as e:
                    apply_error_count += 1
                    errors.append({"row": i, "error": str(e), "data": row})

            session.commit = original_commit

            if apply_error_count > 0:
                session.rollback()
                history.status = "failed"
                history.success_count = 0
                history.error_count = apply_error_count
                history.error_log = errors
            else:
                history.status = "completed"
                history.success_count = created_count
                history.error_count = 0
                history.error_log = []
                session.commit()

        except Exception as e:
            session.commit = original_commit
            session.rollback()
            history.status = "failed"
            history.error_count = apply_error_count + 1
            errors.append({"row": "system", "error": f"Internal Error: {str(e)}"})
            history.error_log = errors

        session.add(history)
        session.commit()
        session.refresh(history)

        del self._preview_sessions[preview_id]

        return history

    # ------------------------------------------------------------------
    # Legacy: single-step import (kept for backward compat)
    # ------------------------------------------------------------------

    async def process_inventory_import(
        self,
        session: Session,
        file: UploadFile,
        mode: str,
        actor_id: Optional[UUID] = None,
    ) -> ImportHistory:
        content = await file.read()

        filename = file.filename or "unknown.csv"
        parsed = self.parse_csv_file(content, filename)
        if parsed.file_issues:
            error_msgs = [i.message for i in parsed.file_issues if i.severity == "error"]
            if error_msgs:
                raise ValueError("; ".join(error_msgs))

        history = ImportHistory(
            filename=filename,
            status="processing",
            total_rows=0,
            success_count=0,
            error_count=0,
            error_log=[],
            actor_id=actor_id,
        )
        session.add(history)
        session.commit()
        session.refresh(history)

        errors = []
        rows_count = 0
        success_count = 0
        error_count = 0

        original_commit = session.commit
        session.commit = session.flush

        try:
            for i, row in enumerate(parsed.rows, start=1):
                rows_count += 1
                try:
                    row = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
                    self._rescue_mapping(session, row)

                    name = row.get("name") or ""
                    is_trackable = self._parse_bool(row.get("is_trackable", "false"))

                    if not name:
                        raise ValueError("Missing mandatory item field: name")

                    item = self._get_or_create_item(session, row, mode, actor_id)

                    qty_value = str(row.get("quantity") or "").strip()
                    serial_value = str(row.get("serial_number") or "").strip()
                    parsed_qty = self._parse_optional_quantity(qty_value) if qty_value else None

                    if (parsed_qty is None or parsed_qty == ZERO_QUANTITY) and not serial_value:
                        pass
                    elif is_trackable:
                        self._handle_unit_import(session, item, row, mode, actor_id)
                    else:
                        self._handle_batch_import(session, item, row, actor_id)

                    success_count += 1
                except Exception as e:
                    error_count += 1
                    errors.append({"row": i, "error": str(e), "data": row})

            session.commit = original_commit

            if error_count > 0:
                session.rollback()
                history.status = "failed"
                history.total_rows = rows_count
                history.success_count = 0
                history.error_count = error_count
                history.error_log = errors
            else:
                history.total_rows = rows_count
                history.success_count = success_count
                history.error_count = 0
                history.status = "completed"
                history.error_log = []
                session.commit()

        except Exception as e:
            session.commit = original_commit
            session.rollback()
            history.status = "failed"
            history.total_rows = rows_count
            history.error_count = error_count + 1
            errors.append({"row": "system", "error": f"Internal Error: {str(e)}"})
            history.error_log = errors

        session.add(history)
        session.commit()
        session.refresh(history)

        return history

    # ------------------------------------------------------------------
    # Action-driven apply helpers (mode-independent)
    # ------------------------------------------------------------------

    def _apply_update_metadata(self, session: Session, row: dict, actor_id: Optional[UUID]) -> None:
        name = row.get("name")
        classification = row.get("classification")
        item_type = row.get("item_type")
        serial_str = str(row.get("serial_number", "") or "").strip()

        canonical_cls = self._get_canonical(session, classification, "inventory_classification") or None
        canonical_type = self._get_canonical(session, item_type, "inventory_item_type") or None
        canonical_cat = self._get_canonical(session, row.get("category", ""), "inventory_category") or None
        canonical_uom = self._get_canonical(session, row.get("unit_of_measure", ""), "inventory_unit_of_measure") or None

        item = self._unwrap_result_value(session.exec(
            select(InventoryItem).where(
                InventoryItem.name == name,
                InventoryItem.classification == canonical_cls,
                InventoryItem.item_type == canonical_type,
                InventoryItem.is_deleted.is_(False),
            )
        ).first())

        if not item:
            create_data = InventoryItemCreate(
                name=(name or "").strip(),
                category=canonical_cat,
                item_type=canonical_type,
                classification=canonical_cls,
                unit_of_measure=canonical_uom,
                is_trackable=self._parse_bool(row.get("is_trackable", "false")),
            )
            item = self.inventory_service.create(session, create_data, prefix="ITEM", actor_id=actor_id)
        else:
            if canonical_cat:
                item.category = canonical_cat
            if canonical_uom and not item.is_trackable:
                item.unit_of_measure = canonical_uom
            session.add(item)

        if serial_str:
            from systems.inventory.models.inventory_unit import InventoryUnit
            existing_unit = self._unwrap_result_value(session.exec(
                select(InventoryUnit).where(InventoryUnit.serial_number == serial_str)
            ).first())

            expiry = None
            if row.get("expiration_date"):
                try:
                    expiry = datetime.fromisoformat(row["expiration_date"])
                except Exception:
                    pass

            if existing_unit:
                existing_unit.condition = row.get("condition") or existing_unit.condition
                existing_unit.description = row.get("description") or existing_unit.description
                if expiry:
                    existing_unit.expiration_date = expiry
                session.add(existing_unit)

    def _apply_create_or_append(
        self,
        session: Session,
        row: dict,
        is_trackable: bool,
        actor_id: Optional[UUID],
    ) -> None:
        name = row.get("name")
        classification = row.get("classification")
        item_type = row.get("item_type")

        canonical_cls = self._get_canonical(session, classification, "inventory_classification") or None
        canonical_type = self._get_canonical(session, item_type, "inventory_item_type") or None
        canonical_cat = self._get_canonical(session, row.get("category", ""), "inventory_category") or None
        canonical_uom = self._get_canonical(session, row.get("unit_of_measure", ""), "inventory_unit_of_measure") or None

        item = self._unwrap_result_value(session.exec(
            select(InventoryItem).where(
                InventoryItem.name == name,
                InventoryItem.classification == canonical_cls,
                InventoryItem.item_type == canonical_type,
                InventoryItem.is_deleted.is_(False),
            )
        ).first())

        if not item:
            create_data = InventoryItemCreate(
                name=(name or "").strip(),
                category=canonical_cat,
                item_type=canonical_type,
                classification=canonical_cls,
                unit_of_measure=canonical_uom,
                is_trackable=self._parse_bool(row.get("is_trackable", "false")),
            )
            item = self.inventory_service.create(session, create_data, prefix="ITEM", actor_id=actor_id)
        elif canonical_uom and not item.is_trackable and item.unit_of_measure is None:
            item.unit_of_measure = canonical_uom
            session.add(item)

        qty_value = str(row.get("quantity") or "").strip()
        serial_value = str(row.get("serial_number") or "").strip()

        parsed_qty = self._parse_optional_quantity(qty_value) if qty_value else None

        if (parsed_qty is None or parsed_qty == ZERO_QUANTITY) and not serial_value:
            return
        elif is_trackable:
            serial = serial_value
            if not serial:
                return
            from systems.inventory.models.inventory_unit import InventoryUnit
            existing_unit = self._unwrap_result_value(session.exec(
                select(InventoryUnit).where(InventoryUnit.serial_number == serial)
            ).first())
            if not existing_unit:
                expiry = None
                if row.get("expiration_date"):
                    try:
                        expiry = datetime.fromisoformat(row["expiration_date"])
                    except Exception:
                        pass
                self.inventory_service.create_unit(
                    session=session,
                    item_id=item.item_id,
                    serial_number=serial,
                    expiration_date=expiry,
                    condition=row.get("condition", "good"),
                    description=row.get("description"),
                    actor_id=actor_id,
                )
        else:
            if parsed_qty is None:
                return
            if parsed_qty <= 0:
                return
            expiry = None
            expiry_str = str(row.get("expiration_date") or "").strip()
            if expiry_str:
                try:
                    expiry = datetime.fromisoformat(expiry_str)
                except Exception:
                    try:
                        expiry = datetime.strptime(expiry_str, "%Y-%m-%d")
                    except Exception:
                        pass
            batch_schema = InventoryBatchCreate(
                expiration_date=expiry,
                description=f"Imported via CSV: {row.get('description', '')}",
            )
            batch = self.inventory_service.create_batch(session, item.item_id, batch_schema, actor_id=actor_id)
            self.inventory_service.adjust_stock(
                session=session,
                item_id=item.item_id,
                qty_change=parsed_qty,
                movement_type="procurement",
                reason_code="procurement_correction",
                note="Initial stock set via CSV import",
                batch_id=batch.batch_id,
                actor_id=actor_id,
            )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_canonical(self, session: Session, val: str, category: str) -> Optional[str]:
        if not val:
            return None
        setting = self.inventory_service.config_service.get_by_key(session, val, category=category)
        return setting.key if setting else val

    def _get_or_create_item(self, session: Session, row: dict, mode: str, actor_id: Optional[UUID]) -> InventoryItem:
        name = row.get("name")
        classification = row.get("classification")
        item_type = row.get("item_type")

        canonical_item_type = self._get_canonical(session, item_type, "inventory_item_type") or None
        canonical_classification = self._get_canonical(session, classification, "inventory_classification") or None
        canonical_category = self._get_canonical(session, row.get("category", ""), "inventory_category") or None
        canonical_uom = self._get_canonical(session, row.get("unit_of_measure", ""), "inventory_unit_of_measure") or None

        statement = select(InventoryItem).where(
            InventoryItem.name == name,
            InventoryItem.classification == canonical_classification,
            InventoryItem.item_type == canonical_item_type,
            InventoryItem.is_deleted.is_(False),
        )
        item = self._unwrap_result_value(session.exec(statement).first())

        if not item:
            create_data = InventoryItemCreate(
                name=(name or "").strip(),
                category=canonical_category,
                item_type=canonical_item_type,
                classification=canonical_classification,
                unit_of_measure=canonical_uom,
                is_trackable=self._parse_bool(row.get("is_trackable", "false")),
            )
            item = self.inventory_service.create(session, create_data, prefix="ITEM", actor_id=actor_id)
        elif mode == "overwrite":
            item.category = canonical_category or item.category
            if canonical_uom and not item.is_trackable:
                item.unit_of_measure = canonical_uom
            session.add(item)

        return item

    def _handle_unit_import(self, session: Session, item: InventoryItem, row: dict, mode: str, actor_id: Optional[UUID]):
        serial = row.get("serial_number")
        if not serial:
            raise ValueError("serial_number is required for trackable items")

        qty_str = str(row.get("quantity") or "").strip()
        if qty_str:
            qty = parse_quantity(qty_str)
            require_whole_quantity(qty, field_name="quantity")

        from systems.inventory.models.inventory_unit import InventoryUnit
        existing_unit = self._unwrap_result_value(session.exec(select(InventoryUnit).where(InventoryUnit.serial_number == serial)).first())

        expiry = None
        if row.get("expiration_date"):
            try:
                expiry = datetime.fromisoformat(row["expiration_date"])
            except Exception:
                raise ValueError(f"Invalid expiration_date format for serial {serial}. Use YYYY-MM-DD")

        if existing_unit:
            if mode == "skip":
                return
            existing_unit.condition = row.get("condition") or existing_unit.condition
            existing_unit.description = row.get("description") or existing_unit.description
            existing_unit.expiration_date = expiry or existing_unit.expiration_date
            session.add(existing_unit)
            return

        self.inventory_service.create_unit(
            session=session,
            item_id=item.item_id,
            serial_number=serial,
            expiration_date=expiry,
            condition=row.get("condition", "good"),
            description=row.get("description"),
            actor_id=actor_id,
        )

    def _handle_batch_import(self, session: Session, item: InventoryItem, row: dict, actor_id: Optional[UUID]):
        qty_str = row.get("quantity")
        expiry_str = str(row.get("expiration_date") or "").strip()

        if not qty_str:
            raise ValueError("quantity is required for non-trackable items")

        qty = parse_quantity(qty_str)
        if qty <= 0:
            raise ValueError("quantity must be greater than 0")

        expiry = None
        if expiry_str:
            try:
                expiry = datetime.fromisoformat(expiry_str)
            except Exception:
                try:
                    expiry = datetime.strptime(expiry_str, "%Y-%m-%d")
                except Exception:
                    raise ValueError(f"Invalid expiration_date format: {expiry_str}. Use YYYY-MM-DD")

        batch_schema = InventoryBatchCreate(
            expiration_date=expiry,
            description=f"Imported via CSV: {row.get('description', '')}",
        )
        batch = self.inventory_service.create_batch(session, item.item_id, batch_schema, actor_id=actor_id)

        self.inventory_service.adjust_stock(
            session=session,
            item_id=item.item_id,
            qty_change=qty,
            movement_type="procurement",
            reason_code="procurement_correction",
            note="Initial stock set via CSV import",
            batch_id=batch.batch_id,
            actor_id=actor_id,
        )

    def _rescue_mapping(self, session: Session, row: dict):
        cat = (row.get("category") or "").strip()
        cls = (row.get("classification") or "").strip()
        typ = (row.get("item_type") or "").strip()
        uom = (row.get("unit_of_measure") or "").strip()

        mapping = {
            "item_type": "inventory_item_type",
            "classification": "inventory_classification",
            "category": "inventory_category",
            "unit_of_measure": "inventory_unit_of_measure",
        }

        def is_valid(val, category):
            if not val:
                return True
            return self.inventory_service.config_service.exists(session, val, category)

        if (
            is_valid(cat, mapping["category"])
            and is_valid(cls, mapping["classification"])
            and is_valid(typ, mapping["item_type"])
            and is_valid(uom, mapping["unit_of_measure"])
        ):
            return

        all_vals = [cat, cls, typ, uom]
        results = {}
        for field_name, category in mapping.items():
            results[field_name] = None
            for val in all_vals:
                if val and self.inventory_service.config_service.exists(session, val, category):
                    results[field_name] = val
                    break

        if results.get("item_type"):
            row["item_type"] = results["item_type"]
        if results.get("classification"):
            row["classification"] = results["classification"]
        if results.get("category"):
            row["category"] = results["category"]
        if results.get("unit_of_measure"):
            row["unit_of_measure"] = results["unit_of_measure"]

    def _rescue_mapping_preview(self, session: Session, row: dict) -> list[RowIssue]:
        cat_before = (row.get("category") or "").strip()
        cls_before = (row.get("classification") or "").strip()
        typ_before = (row.get("item_type") or "").strip()
        uom_before = (row.get("unit_of_measure") or "").strip()

        mapping = {
            "item_type": "inventory_item_type",
            "classification": "inventory_classification",
            "category": "inventory_category",
            "unit_of_measure": "inventory_unit_of_measure",
        }

        def is_valid(val, category):
            if not val:
                return True
            return self.inventory_service.config_service.exists(session, val, category)

        if (
            is_valid(cat_before, mapping["category"])
            and is_valid(cls_before, mapping["classification"])
            and is_valid(typ_before, mapping["item_type"])
            and is_valid(uom_before, mapping["unit_of_measure"])
        ):
            return []

        all_vals = [cat_before, cls_before, typ_before, uom_before]
        results = {}
        for field_name, category in mapping.items():
            results[field_name] = None
            for val in all_vals:
                if val and self.inventory_service.config_service.exists(session, val, category):
                    results[field_name] = val
                    break

        issues: list[RowIssue] = []
        if results.get("item_type") and results["item_type"] != typ_before:
            row["item_type"] = results["item_type"]
            issues.append(
                RowIssue(
                    field="item_type",
                    code="rescued_field_mapping_applied",
                    severity="warning",
                    message=f"'{typ_before}' was moved from item_type. Corrected to '{results['item_type']}'.",
                )
            )
        if results.get("classification") and results["classification"] != cls_before:
            row["classification"] = results["classification"]
            issues.append(
                RowIssue(
                    field="classification",
                    code="rescued_field_mapping_applied",
                    severity="warning",
                    message=f"'{cls_before}' was moved from classification. Corrected to '{results['classification']}'.",
                )
            )
        if results.get("category") and results["category"] != cat_before:
            row["category"] = results["category"]
            issues.append(
                RowIssue(
                    field="category",
                    code="rescued_field_mapping_applied",
                    severity="warning",
                    message=f"'{cat_before}' was moved from category. Corrected to '{results['category']}'.",
                )
            )
        if results.get("unit_of_measure") and results["unit_of_measure"] != uom_before:
            row["unit_of_measure"] = results["unit_of_measure"]
            issues.append(
                RowIssue(
                    field="unit_of_measure",
                    code="rescued_field_mapping_applied",
                    severity="warning",
                    message=f"'{uom_before}' was moved from unit_of_measure. Corrected to '{results['unit_of_measure']}'.",
                )
            )

        return issues

    def build_corrected_csv(self, preview_id: str) -> str:
        ps = self.get_preview_session(preview_id)
        if ps is None:
            raise ValueError("Preview session not found or expired.")

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(ps.parsed_csv.headers)
        for row in ps.parsed_csv.rows:
            writer.writerow([row.get(h, "") for h in ps.parsed_csv.headers])
        output.seek(0)
        return output.getvalue()
