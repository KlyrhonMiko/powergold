from typing import List
from datetime import datetime
import logging

from fastapi import APIRouter, Depends, Query, UploadFile, File, Request, HTTPException
from pydantic import ValidationError
from sqlmodel import Session

from core.database import get_session
from core.schemas import GenericResponse, create_success_response, make_pagination_meta
from systems.auth.dependencies import require_permission, get_current_user
from systems.admin.models.user import User
from systems.admin.schemas.user_schemas import UserRead
from systems.inventory.schemas.import_export_schemas import (
    AuditLogExportFilters,
    CatalogExportFilters,
    ImportHistoryRead,
    ImportResponse,
    LedgerMovementsExportFilters,
    LedgerRequestsExportFilters,
    EntrustedExportFilters,
    PreviewSummary,
    PreviewRowRead,
    PreviewRowUpdateRequest,
    PreviewApplyResponse,
    RowIssueRead,
    DuplicateGroupRead,
    GroupActionRequest,
    RowActionRequest,
)
from systems.inventory.services.import_service import ImportService
from systems.inventory.services.export_service import ExportService

router = APIRouter()
import_service = ImportService()
export_service = ExportService()
logger = logging.getLogger("app")

EXPORT_VALIDATION_ERROR_DETAIL = "Invalid export request parameters."


def _get_ledger_movements_filters(request: Request) -> LedgerMovementsExportFilters:
    filter_payload = dict(request.query_params)

    # Canonical fields take precedence when both canonical and alias are provided.
    if "date_from" in filter_payload:
        filter_payload.pop("from_date", None)
    if "date_to" in filter_payload:
        filter_payload.pop("to_date", None)

    try:
        return LedgerMovementsExportFilters(**filter_payload)
    except ValidationError as exc:
        logger.exception("Ledger movement export filter validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=EXPORT_VALIDATION_ERROR_DETAIL) from exc

@router.get("/borrowers", response_model=GenericResponse[List[UserRead]])
async def get_borrowers(
    request: Request,
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    from systems.admin.services.user_service import UserService
    user_service = UserService()
    # Filter for users with the 'borrower' role specifically as requested
    users, _ = user_service.get_all(session, role="borrower", is_active=True, limit=1000)
    
    return create_success_response(
        data=users,
        request=request
    )

@router.get("/import/history", response_model=GenericResponse[List[ImportHistoryRead]])
async def get_import_history(
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    skip = (page - 1) * per_page
    results, total = import_service.get_history(session, skip=skip, limit=per_page)
    
    return create_success_response(
        data=results,
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request
    )

@router.post("/import", response_model=GenericResponse[ImportResponse])
async def import_inventory(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Query(..., pattern="^(skip|overwrite)$"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    try:
        history = await import_service.process_inventory_import(
            session,
            file,
            mode,
            current_user.id,
        )
    except ValueError as exc:
        detail = str(exc)
        if "maximum allowed size" in detail:
            raise HTTPException(status_code=413, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc
    
    data = ImportResponse(
        history_id=history.id,
        status=history.status,
        total=history.total_rows,
        success=history.success_count,
        failed=history.error_count
    )
    
    return create_success_response(data=data, request=request)

@router.get("/import/preview/{preview_id}", response_model=GenericResponse[PreviewSummary])
async def get_import_preview(
    preview_id: str,
    request: Request,
    _: None = Depends(require_permission("inventory:config:manage")),
):
    ps = import_service.get_preview_session(preview_id)
    if ps is None:
        raise HTTPException(status_code=404, detail="Preview session not found or expired. Please re-upload.")

    groups = import_service.build_duplicate_groups(preview_id)
    summary = PreviewSummary(
        preview_id=ps.id,
        filename=ps.filename,
        mode=ps.mode,
        delimiter=ps.parsed_csv.delimiter,
        encoding=ps.parsed_csv.encoding,
        bom_detected=ps.parsed_csv.bom_detected,
        file_size=ps.parsed_csv.file_size,
        total_rows=len(ps.row_previews),
        ready_count=sum(1 for rp in ps.row_previews if rp.status == "ready"),
        warning_count=sum(1 for rp in ps.row_previews if rp.status == "warning"),
        error_count=sum(1 for rp in ps.row_previews if rp.status == "error"),
        info_count=sum(1 for rp in ps.row_previews if rp.status == "info"),
        file_issues=[RowIssueRead(field=i.field, code=i.code, severity=i.severity, message=i.message) for i in ps.parsed_csv.file_issues],
        can_apply=sum(1 for rp in ps.row_previews if rp.status == "error") == 0,
        headers=ps.parsed_csv.headers,
        duplicate_groups=[
            DuplicateGroupRead(key=g.key, label=g.label, count=g.count, severity=g.severity, recommended_action=g.recommended_action, requires_user_decision=g.requires_user_decision)
            for g in groups
        ],
        auto_resolved_count=sum(1 for rp in ps.row_previews if rp.recommended_action and rp.recommended_action not in ("manual_review", "block") and not rp.requires_user_decision),
        decision_required_count=sum(1 for rp in ps.row_previews if rp.requires_user_decision),
        unresolved_blocker_count=sum(1 for rp in ps.row_previews if rp.requires_user_decision and not rp.selected_action),
    )
    return create_success_response(data=summary, request=request)

@router.get("/import/preview/{preview_id}/rows", response_model=GenericResponse[List[PreviewRowRead]])
async def get_import_preview_rows(
    preview_id: str,
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
    filter_status: str = Query(default="all", pattern="^(all|ready|warning|error|info|needs_review)$"),
    group_key: str = Query(default=None),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    ps = import_service.get_preview_session(preview_id)
    if ps is None:
        raise HTTPException(status_code=404, detail="Preview session not found or expired. Please re-upload.")

    rows = ps.row_previews
    if group_key:
        rows = [r for r in rows if import_service.row_matches_group_key(r, group_key)]
    elif filter_status == "needs_review":
        rows = [r for r in rows if r.requires_user_decision]
    elif filter_status != "all":
        rows = [r for r in rows if r.status == filter_status]

    total = len(rows)
    skip = (page - 1) * per_page
    paged = rows[skip : skip + per_page]

    data = [
        PreviewRowRead(
            row_number=rp.row_number,
            original_values=rp.original_values,
            normalized_values=rp.normalized_values,
            resolved_values=rp.resolved_values,
            status=rp.status,
            issues=[RowIssueRead(field=i.field, code=i.code, severity=i.severity, message=i.message) for i in rp.issues],
            action=rp.action.value if rp.action else None,
            stock_interpretation=rp.stock_interpretation,
            duplicate_type=rp.duplicate_type,
            duplicate_subtype=rp.duplicate_subtype,
            recommended_action=rp.recommended_action,
            selected_action=rp.selected_action,
            requires_user_decision=rp.requires_user_decision,
            group_key=rp.group_key,
            target_match_summary=rp.target_match_summary,
        )
        for rp in paged
    ]
    return create_success_response(
        data=data,
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request,
    )

@router.patch("/import/preview/{preview_id}/rows/{row_number}", response_model=GenericResponse[PreviewRowRead])
async def update_preview_row(
    preview_id: str,
    row_number: int,
    body: PreviewRowUpdateRequest,
    request: Request,
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    result = import_service.update_row_in_preview(session, preview_id, row_number, body.updates)
    if result is None:
        raise HTTPException(status_code=404, detail="Preview session not found or row out of range.")

    updated_preview, _ = result
    data = PreviewRowRead(
        row_number=updated_preview.row_number,
        original_values=updated_preview.original_values,
        normalized_values=updated_preview.normalized_values,
        resolved_values=updated_preview.resolved_values,
        status=updated_preview.status,
        issues=[RowIssueRead(field=i.field, code=i.code, severity=i.severity, message=i.message) for i in updated_preview.issues],
        action=updated_preview.action.value if updated_preview.action else None,
        stock_interpretation=updated_preview.stock_interpretation,
        duplicate_type=updated_preview.duplicate_type,
        duplicate_subtype=updated_preview.duplicate_subtype,
        recommended_action=updated_preview.recommended_action,
        selected_action=updated_preview.selected_action,
        requires_user_decision=updated_preview.requires_user_decision,
        group_key=updated_preview.group_key,
        target_match_summary=updated_preview.target_match_summary,
    )
    return create_success_response(data=data, request=request)

@router.post("/import/preview/{preview_id}/apply", response_model=GenericResponse[PreviewApplyResponse])
async def apply_import_preview(
    preview_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    try:
        history = await import_service.apply_preview(session, preview_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    data = PreviewApplyResponse(
        history_id=history.id,
        status=history.status,
        total=history.total_rows,
        success=history.success_count,
        failed=history.error_count,
    )
    return create_success_response(data=data, request=request)

@router.get("/import/preview/{preview_id}/download")
async def download_corrected_csv(
    preview_id: str,
    _: None = Depends(require_permission("inventory:config:manage")),
):
    from fastapi.responses import StreamingResponse

    try:
        csv_content = import_service.build_corrected_csv(preview_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    ps = import_service.get_preview_session(preview_id)
    download_name = f"corrected_{ps.filename}" if ps else "corrected_import.csv"

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )

@router.post("/import/preview/{preview_id}/actions/accept-recommended", response_model=GenericResponse[dict])
async def accept_recommended_actions(
    preview_id: str,
    request: Request,
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    count = import_service.accept_recommended_actions(session, preview_id)
    return create_success_response(
        data={"accepted": count},
        request=request,
    )

@router.post("/import/preview/{preview_id}/actions/group", response_model=GenericResponse[dict])
async def set_group_action(
    preview_id: str,
    request: Request,
    body: GroupActionRequest,
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    count = import_service.set_group_action(session, preview_id, body.group_key, body.action)
    return create_success_response(
        data={"group_key": body.group_key, "action": body.action, "affected": count},
        request=request,
    )

@router.post("/import/preview/{preview_id}/actions/row/{row_number}", response_model=GenericResponse[PreviewRowRead])
async def set_row_action(
    preview_id: str,
    row_number: int,
    request: Request,
    body: RowActionRequest,
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    result = import_service.set_row_action(session, preview_id, row_number, body.action)
    if result is None:
        raise HTTPException(status_code=404, detail="Preview session not found or row out of range.")

    data = PreviewRowRead(
        row_number=result.row_number,
        original_values=result.original_values,
        normalized_values=result.normalized_values,
        resolved_values=result.resolved_values,
        status=result.status,
        issues=[RowIssueRead(field=i.field, code=i.code, severity=i.severity, message=i.message) for i in result.issues],
        action=result.action.value if result.action else None,
        stock_interpretation=result.stock_interpretation,
        duplicate_type=result.duplicate_type,
        duplicate_subtype=result.duplicate_subtype,
        recommended_action=result.recommended_action,
        selected_action=result.selected_action,
        requires_user_decision=result.requires_user_decision,
        group_key=result.group_key,
        target_match_summary=result.target_match_summary,
    )
    return create_success_response(data=data, request=request)

@router.post("/import/preview/{preview_id}/actions/reset", response_model=GenericResponse[dict])
async def reset_preview_actions(
    preview_id: str,
    request: Request,
    _: None = Depends(require_permission("inventory:config:manage")),
):
    count = import_service.reset_actions(preview_id)
    return create_success_response(
        data={"reset": count},
        request=request,
    )

@router.post("/import/preview/{preview_id}/actions/ignore-all-blockers", response_model=GenericResponse[dict])
async def ignore_all_blockers(
    preview_id: str,
    request: Request,
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    count = import_service.ignore_all_blockers(preview_id)
    return create_success_response(
        data={"ignored": count},
        request=request,
    )

@router.post("/import/preview", response_model=GenericResponse[PreviewSummary])
async def create_import_preview(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Query(..., pattern="^(skip|overwrite)$"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    try:
        content = await file.read()
        ps = import_service.create_preview_session(
            session, content, file.filename or "uploaded.csv", mode, current_user.id
        )
    except ValueError as exc:
        detail = str(exc)
        if "maximum allowed size" in detail:
            raise HTTPException(status_code=413, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc

    groups = import_service.build_duplicate_groups(ps.id)
    summary = PreviewSummary(
        preview_id=ps.id,
        filename=ps.filename,
        mode=ps.mode,
        delimiter=ps.parsed_csv.delimiter,
        encoding=ps.parsed_csv.encoding,
        bom_detected=ps.parsed_csv.bom_detected,
        file_size=ps.parsed_csv.file_size,
        total_rows=len(ps.row_previews),
        ready_count=sum(1 for rp in ps.row_previews if rp.status == "ready"),
        warning_count=sum(1 for rp in ps.row_previews if rp.status == "warning"),
        error_count=sum(1 for rp in ps.row_previews if rp.status == "error"),
        info_count=sum(1 for rp in ps.row_previews if rp.status == "info"),
        file_issues=[RowIssueRead(field=i.field, code=i.code, severity=i.severity, message=i.message) for i in ps.parsed_csv.file_issues],
        can_apply=sum(1 for rp in ps.row_previews if rp.status == "error") == 0,
        headers=ps.parsed_csv.headers,
        duplicate_groups=[
            DuplicateGroupRead(key=g.key, label=g.label, count=g.count, severity=g.severity, recommended_action=g.recommended_action, requires_user_decision=g.requires_user_decision)
            for g in groups
        ],
        auto_resolved_count=sum(1 for rp in ps.row_previews if rp.recommended_action and rp.recommended_action not in ("manual_review", "block") and not rp.requires_user_decision),
        decision_required_count=sum(1 for rp in ps.row_previews if rp.requires_user_decision),
        unresolved_blocker_count=sum(1 for rp in ps.row_previews if rp.requires_user_decision and not rp.selected_action),
    )
    return create_success_response(data=summary, request=request)

@router.get("/export/audit-logs")
async def export_audit_logs(
    filters: AuditLogExportFilters = Depends(),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    effective_date_from = filters.date_from or from_date
    effective_date_to = filters.date_to or to_date
    try:
        return export_service.export_audit_logs(
            session,
            format=filters.format,
            report_version=filters.report_version,
            timeline_mode=filters.timeline_mode,
            anchor_date=filters.anchor_date,
            date_from=effective_date_from,
            date_to=effective_date_to,
            include_deleted=filters.include_deleted,
            include_archived=filters.include_archived,
        )
    except ValueError as exc:
        logger.exception("Audit log export validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=EXPORT_VALIDATION_ERROR_DETAIL) from exc

@router.get("/export/ledger/requests")
async def export_borrow_history(
    filters: LedgerRequestsExportFilters = Depends(),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    effective_date_from = filters.date_from or from_date
    effective_date_to = filters.date_to or to_date
    try:
        return export_service.export_borrow_history(
            session,
            format=filters.format,
            report_version=filters.report_version,
            status=filters.status,
            item_id=filters.item_id,
            borrower_id=filters.borrower_id,
            serial_number=filters.serial_number,
            include_receipt_rendered=filters.include_receipt_rendered,
            timeline_mode=filters.timeline_mode,
            anchor_date=filters.anchor_date,
            date_from=effective_date_from,
            date_to=effective_date_to,
            include_deleted=filters.include_deleted,
            include_archived=filters.include_archived,
        )
    except ValueError as exc:
        logger.exception("Ledger request export validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=EXPORT_VALIDATION_ERROR_DETAIL) from exc

@router.get("/export/ledger/movements")
async def export_movements(
    filters: LedgerMovementsExportFilters = Depends(_get_ledger_movements_filters),
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    try:
        return export_service.export_movements(
            session,
            format=filters.format,
            report_version=filters.report_version,
            movement_type=filters.movement_type,
            item_id=filters.item_id,
            serial_number=filters.serial_number,
            timeline_mode=filters.timeline_mode,
            anchor_date=filters.anchor_date,
            date_from=filters.date_from,
            date_to=filters.date_to,
            include_deleted=filters.include_deleted,
            include_archived=filters.include_archived,
        )
    except ValueError as exc:
        logger.exception("Ledger movement export validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=EXPORT_VALIDATION_ERROR_DETAIL) from exc

@router.get("/export/catalog")
async def export_catalog(
    filters: CatalogExportFilters = Depends(),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    effective_date_from = filters.date_from or from_date
    effective_date_to = filters.date_to or to_date
    try:
        return export_service.export_inventory(
            session,
            format=filters.format,
            report_version=filters.report_version,
            timeline_mode=filters.timeline_mode,
            anchor_date=filters.anchor_date,
            date_from=effective_date_from,
            date_to=effective_date_to,
            include_deleted=filters.include_deleted,
            include_archived=filters.include_archived,
        )
    except ValueError as exc:
        logger.exception("Catalog export validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=EXPORT_VALIDATION_ERROR_DETAIL) from exc

@router.get("/export/entrusted")
async def export_entrusted_items(
    filters: EntrustedExportFilters = Depends(),
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("inventory:config:manage")),
):
    try:
        return export_service.export_entrusted(
            session,
            format=filters.format,
            search=filters.search,
            status=filters.status,
            category=filters.category,
            classification=filters.classification,
        )
    except ValueError as exc:
        logger.exception("Entrusted items export validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=EXPORT_VALIDATION_ERROR_DETAIL) from exc

@router.get("/import/template")
async def get_import_template():
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    output = io.StringIO()
    writer = csv.writer(output)
    headers = ["name", "category", "classification", "item_type", "unit_of_measure", "is_trackable", "description", "condition", "quantity", "serial_number", "expiration_date"]
    writer.writerow(headers)
    writer.writerow(["Thermal Scanner (Fluke)", "items_tools", "equipment", "electronics", "", "true", "Warehouse scanner", "good", "1", "TS-102938", ""])
    writer.writerow(["Powder Soap", "cmp_pm_acu_pm", "consumable", "cleaning_supplies", "pack", "false", "Cleaning consumable", "good", "50.5", "", "2026-12-01"])
    writer.writerow(["Emergency Light", "declogging", "equipment", "tools", "", "true", "Portable emergency light", "excellent", "1", "EL-998877", ""])
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventory_import_template.csv"}
    )
