from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from core.database import get_session
from core.deps import get_current_user
from systems.auth.dependencies import require_permission
from core.schemas import GenericResponse, create_success_response, make_pagination_meta
from systems.admin.models.user import User
from systems.admin.schemas.user_schemas import (
    GeneratedUserCredentialsRead,
    UserCreate,
    UserCreateResultRead,
    UserLoginPasswordResetRequest,
    UserLoginPasswordResetResultRead,
    UserRead,
    UserSecondaryPasswordRead,
    UserUpdate,
)
from systems.admin.schemas.user_import_schemas import (
    UserImportDuplicateGroupRead,
    UserImportHistoryRead,
    UserImportPreviewRowRead,
    UserImportPreviewRowUpdateRequest,
    UserImportPreviewSummary,
    UserImportResponse,
    UserImportRowActionRequest,
    UserImportRowIssueRead,
)
from systems.auth.schemas.auth_schemas import (
    TwoFactorCodeVerifyRequest,
    TwoFactorEnrollmentInitiateRead,
    TwoFactorStatusRead,
)
from systems.admin.services.user_service import UserService
from systems.admin.services.user_import_service import UserImportService
from systems.auth.services.auth_service import auth_service
from systems.inventory.services.entrusted_item_service import EntrustedItemService
from systems.inventory.schemas.entrusted_item_schemas import EntrustedItemCreate, EntrustedItemRead, EntrustedItemRevoke

router = APIRouter()
user_service = UserService()
user_import_service = UserImportService()
entrusted_service = EntrustedItemService()

TWO_FACTOR_BORROWER_FORBIDDEN_DETAIL = (
    "Borrower accounts are not eligible for two-factor enrollment or disable actions."
)


def _commit_and_refresh(session: Session, obj: User) -> None:
    """Commit and refresh when the provided session supports these operations."""
    commit = getattr(session, "commit", None)
    if callable(commit):
        commit()

    refresh = getattr(session, "refresh", None)
    if callable(refresh):
        refresh(obj)


def _ensure_two_factor_management_allowed(target_user: User) -> None:
    normalized_role = (target_user.role or "").strip().lower()
    if normalized_role in ("borrower", "brwr"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=TWO_FACTOR_BORROWER_FORBIDDEN_DETAIL,
        )


@router.get(
    "/import/history",
    response_model=GenericResponse[list[UserImportHistoryRead]],
)
async def get_user_import_history(
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("admin:users:manage")),
):
    skip = (page - 1) * per_page
    results, total = user_import_service.get_history(session, skip=skip, limit=per_page)
    return create_success_response(
        data=[
            UserImportHistoryRead(
                id=item.id,
                filename=item.filename,
                actor_id=item.actor_id,
                total_rows=item.total_rows,
                success_count=item.success_count,
                error_count=item.error_count,
                status=item.status,
                error_log=item.error_log,
                has_credentials_download=bool(item.credentials_log),
                created_at=item.created_at,
            )
            for item in results
        ],
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request,
    )


@router.get("/import/template")
async def download_user_import_template(
    _: None = Depends(require_permission("admin:users:manage")),
):
    return StreamingResponse(
        iter([user_import_service.build_template_csv()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="user_import_template.csv"'},
    )


@router.post(
    "/import/preview",
    response_model=GenericResponse[UserImportPreviewSummary],
)
async def preview_user_import(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Query(default="skip", pattern="^(skip|overwrite)$"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    try:
        preview_session = await user_import_service.create_preview(session, file, current_user.id, mode=mode)
    except ValueError as exc:
        detail = str(exc)
        if "maximum allowed size" in detail:
            raise HTTPException(status_code=413, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc

    groups = user_import_service.build_duplicate_groups(preview_session.id)
    return create_success_response(
        data=UserImportPreviewSummary(
            preview_id=preview_session.id,
            filename=preview_session.filename,
            mode=preview_session.mode,
            delimiter=preview_session.parsed_csv.delimiter,
            encoding=preview_session.parsed_csv.encoding,
            bom_detected=preview_session.parsed_csv.bom_detected,
            file_size=preview_session.parsed_csv.file_size,
            total_rows=len(preview_session.row_previews),
            ready_count=sum(1 for row in preview_session.row_previews if row.status == "ready"),
            warning_count=sum(1 for row in preview_session.row_previews if row.status == "warning"),
            error_count=sum(1 for row in preview_session.row_previews if row.status == "error"),
            info_count=sum(1 for row in preview_session.row_previews if row.status == "info"),
            file_issues=[
                UserImportRowIssueRead(field=issue.field, code=issue.code, severity=issue.severity, message=issue.message)
                for issue in preview_session.parsed_csv.file_issues
            ],
            can_apply=sum(1 for row in preview_session.row_previews if row.status == "error") == 0
            and not any(issue.severity == "error" for issue in preview_session.parsed_csv.file_issues),
            headers=preview_session.parsed_csv.headers,
            duplicate_groups=[
                UserImportDuplicateGroupRead(
                    key=group.key,
                    label=group.label,
                    count=group.count,
                    severity=group.severity,
                    recommended_action=group.recommended_action,
                    requires_user_decision=group.requires_user_decision,
                )
                for group in groups
            ],
            auto_resolved_count=sum(
                1
                for row in preview_session.row_previews
                if row.recommended_action and row.recommended_action not in {"block"} and not row.requires_user_decision
            ),
            decision_required_count=sum(1 for row in preview_session.row_previews if row.requires_user_decision),
            unresolved_blocker_count=sum(
                1 for row in preview_session.row_previews if row.requires_user_decision and not row.selected_action
            ),
        ),
        request=request,
    )


@router.get(
    "/import/preview/{preview_id}",
    response_model=GenericResponse[UserImportPreviewSummary],
)
async def get_user_import_preview(
    preview_id: str,
    request: Request,
    _: None = Depends(require_permission("admin:users:manage")),
):
    preview_session = user_import_service.get_preview_session(preview_id)
    if preview_session is None:
        raise HTTPException(status_code=404, detail="Preview session not found or expired. Please re-upload.")
    groups = user_import_service.build_duplicate_groups(preview_id)
    return create_success_response(
        data=UserImportPreviewSummary(
            preview_id=preview_session.id,
            filename=preview_session.filename,
            mode=preview_session.mode,
            delimiter=preview_session.parsed_csv.delimiter,
            encoding=preview_session.parsed_csv.encoding,
            bom_detected=preview_session.parsed_csv.bom_detected,
            file_size=preview_session.parsed_csv.file_size,
            total_rows=len(preview_session.row_previews),
            ready_count=sum(1 for row in preview_session.row_previews if row.status == "ready"),
            warning_count=sum(1 for row in preview_session.row_previews if row.status == "warning"),
            error_count=sum(1 for row in preview_session.row_previews if row.status == "error"),
            info_count=sum(1 for row in preview_session.row_previews if row.status == "info"),
            file_issues=[
                UserImportRowIssueRead(field=issue.field, code=issue.code, severity=issue.severity, message=issue.message)
                for issue in preview_session.parsed_csv.file_issues
            ],
            can_apply=sum(1 for row in preview_session.row_previews if row.status == "error") == 0
            and not any(issue.severity == "error" for issue in preview_session.parsed_csv.file_issues),
            headers=preview_session.parsed_csv.headers,
            duplicate_groups=[
                UserImportDuplicateGroupRead(
                    key=group.key,
                    label=group.label,
                    count=group.count,
                    severity=group.severity,
                    recommended_action=group.recommended_action,
                    requires_user_decision=group.requires_user_decision,
                )
                for group in groups
            ],
            auto_resolved_count=sum(
                1
                for row in preview_session.row_previews
                if row.recommended_action and row.recommended_action not in {"block"} and not row.requires_user_decision
            ),
            decision_required_count=sum(1 for row in preview_session.row_previews if row.requires_user_decision),
            unresolved_blocker_count=sum(
                1 for row in preview_session.row_previews if row.requires_user_decision and not row.selected_action
            ),
        ),
        request=request,
    )


@router.get(
    "/import/preview/{preview_id}/rows",
    response_model=GenericResponse[list[UserImportPreviewRowRead]],
)
async def get_user_import_preview_rows(
    preview_id: str,
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
    filter_status: str = Query(default="all", pattern="^(all|ready|warning|error|info|needs_review)$"),
    group_key: str | None = Query(default=None),
    _: None = Depends(require_permission("admin:users:manage")),
):
    preview_session = user_import_service.get_preview_session(preview_id)
    if preview_session is None:
        raise HTTPException(status_code=404, detail="Preview session not found or expired. Please re-upload.")

    rows = preview_session.row_previews
    if group_key:
        rows = [row for row in rows if user_import_service.row_matches_group_key(row, group_key)]
    elif filter_status == "needs_review":
        rows = [row for row in rows if row.requires_user_decision]
    elif filter_status != "all":
        rows = [row for row in rows if row.status == filter_status]

    total = len(rows)
    skip = (page - 1) * per_page
    paged = rows[skip : skip + per_page]
    return create_success_response(
        data=[
            UserImportPreviewRowRead(
                row_number=row.row_number,
                original_values=row.original_values,
                normalized_values=row.normalized_values,
                resolved_values=row.resolved_values,
                status=row.status,
                issues=[
                    UserImportRowIssueRead(field=issue.field, code=issue.code, severity=issue.severity, message=issue.message)
                    for issue in row.issues
                ],
                action=row.action,
                stock_interpretation=row.stock_interpretation,
                duplicate_type=row.duplicate_type,
                duplicate_subtype=row.duplicate_subtype,
                recommended_action=row.recommended_action,
                selected_action=row.selected_action,
                requires_user_decision=row.requires_user_decision,
                group_key=row.group_key,
                target_match_summary=row.target_match_summary,
            )
            for row in paged
        ],
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request,
    )


@router.patch(
    "/import/preview/{preview_id}/rows/{row_number}",
    response_model=GenericResponse[UserImportPreviewRowRead],
)
async def update_user_import_preview_row(
    preview_id: str,
    row_number: int,
    body: UserImportPreviewRowUpdateRequest,
    request: Request,
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("admin:users:manage")),
):
    result = user_import_service.update_row_in_preview(session, preview_id, row_number, body.updates)
    if result is None:
        raise HTTPException(status_code=404, detail="Preview session not found or row out of range.")
    updated_preview, _ = result
    return create_success_response(
        data=UserImportPreviewRowRead(
            row_number=updated_preview.row_number,
            original_values=updated_preview.original_values,
            normalized_values=updated_preview.normalized_values,
            resolved_values=updated_preview.resolved_values,
            status=updated_preview.status,
            issues=[
                UserImportRowIssueRead(field=issue.field, code=issue.code, severity=issue.severity, message=issue.message)
                for issue in updated_preview.issues
            ],
            action=updated_preview.action,
            stock_interpretation=updated_preview.stock_interpretation,
            duplicate_type=updated_preview.duplicate_type,
            duplicate_subtype=updated_preview.duplicate_subtype,
            recommended_action=updated_preview.recommended_action,
            selected_action=updated_preview.selected_action,
            requires_user_decision=updated_preview.requires_user_decision,
            group_key=updated_preview.group_key,
            target_match_summary=updated_preview.target_match_summary,
        ),
        request=request,
    )


@router.post(
    "/import/preview/{preview_id}/actions/accept-recommended",
    response_model=GenericResponse[dict],
)
async def accept_user_import_recommended_actions(
    preview_id: str,
    request: Request,
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("admin:users:manage")),
):
    accepted = user_import_service.accept_recommended_actions(session, preview_id)
    return create_success_response(data={"accepted": accepted}, request=request)


@router.post(
    "/import/preview/{preview_id}/actions/row/{row_number}",
    response_model=GenericResponse[UserImportPreviewRowRead],
)
async def set_user_import_row_action(
    preview_id: str,
    row_number: int,
    body: UserImportRowActionRequest,
    request: Request,
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("admin:users:manage")),
):
    result = user_import_service.set_row_action(session, preview_id, row_number, body.action)
    if result is None:
        raise HTTPException(status_code=404, detail="Preview session not found or row out of range.")
    return create_success_response(
        data=UserImportPreviewRowRead(
            row_number=result.row_number,
            original_values=result.original_values,
            normalized_values=result.normalized_values,
            resolved_values=result.resolved_values,
            status=result.status,
            issues=[
                UserImportRowIssueRead(field=issue.field, code=issue.code, severity=issue.severity, message=issue.message)
                for issue in result.issues
            ],
            action=result.action,
            stock_interpretation=result.stock_interpretation,
            duplicate_type=result.duplicate_type,
            duplicate_subtype=result.duplicate_subtype,
            recommended_action=result.recommended_action,
            selected_action=result.selected_action,
            requires_user_decision=result.requires_user_decision,
            group_key=result.group_key,
            target_match_summary=result.target_match_summary,
        ),
        request=request,
    )


@router.post(
    "/import/preview/{preview_id}/actions/ignore-all-blockers",
    response_model=GenericResponse[dict],
)
async def ignore_all_user_import_blockers(
    preview_id: str,
    request: Request,
    _: None = Depends(require_permission("admin:users:manage")),
):
    ignored = user_import_service.ignore_all_blockers(preview_id)
    return create_success_response(data={"ignored": ignored}, request=request)


@router.post(
    "/import/preview/{preview_id}/apply",
    response_model=GenericResponse[UserImportResponse],
)
async def apply_user_import_preview(
    preview_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    preview_session = user_import_service.get_preview_session(preview_id)
    if preview_session is None:
        raise HTTPException(status_code=404, detail="Preview session not found or expired. Please re-upload.")
    preview_session.actor_id = current_user.id
    try:
        history = await user_import_service.apply_preview(session, preview_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return create_success_response(
        data=UserImportResponse(
            history_id=history.id,
            status=history.status,
            total=history.total_rows,
            success=history.success_count,
            failed=history.error_count,
            has_credentials_download=bool(preview_session.credentials_rows),
        ),
        request=request,
    )


@router.get("/import/preview/{preview_id}/download")
async def download_user_import_corrected_csv(
    preview_id: str,
    _: None = Depends(require_permission("admin:users:manage")),
):
    try:
        csv_content = user_import_service.build_corrected_csv(preview_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    preview_session = user_import_service.get_preview_session(preview_id)
    download_name = f"corrected_{preview_session.filename}" if preview_session else "corrected_user_import.csv"
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@router.get("/import/preview/{preview_id}/credentials")
async def download_user_import_credentials(
    preview_id: str,
    _: None = Depends(require_permission("admin:users:manage")),
):
    try:
        csv_content = user_import_service.build_credentials_csv(preview_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="user_import_credentials_{preview_id}.csv"'},
    )


@router.get("/import/history/{history_id}/credentials")
async def download_user_import_credentials_from_history(
    history_id: str,
    session: Session = Depends(get_session),
    _: None = Depends(require_permission("admin:users:manage")),
):
    try:
        csv_content = user_import_service.build_credentials_csv_from_history(session, history_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="user_import_credentials_{history_id}.csv"'},
    )


@router.post(
    "/register",
    response_model=GenericResponse[UserCreateResultRead],
    status_code=201,
    responses={400: {"model": GenericResponse}},
)
async def register_user(
    user_data: UserCreate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    user, generated_credentials = user_service.create_with_generated_credentials(
        session,
        user_data,
        actor_id=current_user.id,
    )
    _commit_and_refresh(session, user)

    generated_credentials_payload = None
    if generated_credentials:
        generated_credentials_payload = GeneratedUserCredentialsRead(
            one_time_login_password=generated_credentials["one_time_login_password"],
            secondary_password=generated_credentials["secondary_password"],
        )

    return create_success_response(
        data=UserCreateResultRead(
            user=UserRead.model_validate(user),
            generated_credentials=generated_credentials_payload,
        ),
        message="User registered successfully",
        request=request,
    )


@router.get(
    "",
    response_model=GenericResponse[list[UserRead]],
    responses={401: {"model": GenericResponse}},
)
async def list_users(
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=20, ge=1, le=500, description="Records per page"),
    search: Optional[str] = Query(default=None, description="Search by user ID, email, first name, or last name (case-insensitive)"),
    role: Optional[str] = Query(default=None, description="Filter by role (exact match, e.g. 'staff', 'admin')"),
    is_active: Optional[bool] = Query(default=None, description="Filter by active status (true=active, false=deactivated)"),
    shift_type: Optional[str] = Query(default=None, description="Filter by shift type (e.g. 'day', 'night')"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    skip = (page - 1) * per_page
    users, total = user_service.get_all(
        session,
        skip=skip,
        limit=per_page,
        search=search,
        role=role,
        is_active=is_active,
        shift_type=shift_type,
    )
    return create_success_response(
        data=users,
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request,
    )




@router.get(
    "/{user_id}",
    response_model=GenericResponse[UserRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def get_user(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    user = user_service.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return create_success_response(data=user, request=request)


@router.get(
    "/{user_id}/secondary-password",
    response_model=GenericResponse[UserSecondaryPasswordRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
@router.get(
    "/{user_id}/recovery-credential",
    response_model=GenericResponse[UserSecondaryPasswordRead],
    include_in_schema=False,
)
async def get_user_secondary_password(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    user = user_service.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    secondary_password = user_service.get_secondary_password(
        session,
        user,
        actor_id=current_user.id,
    )
    _commit_and_refresh(session, user)

    return create_success_response(
        data=UserSecondaryPasswordRead(
            user_id=user.user_id,
            secondary_password=secondary_password,
            rotated_at=user.recovery_credential_rotated_at,
        ),
        message="Secondary password retrieved successfully",
        request=request,
    )


@router.post(
    "/{user_id}/reset-login-password",
    response_model=GenericResponse[UserLoginPasswordResetResultRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def reset_user_login_password(
    user_id: str,
    payload: UserLoginPasswordResetRequest,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    user = user_service.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_one_time_password, new_secondary_password = user_service.reset_login_password(
        session,
        user,
        secondary_password=payload.secondary_password,
        actor_id=current_user.id,
    )

    auth_service.revoke_sessions_for_user(session, user.id)
    _commit_and_refresh(session, user)

    return create_success_response(
        data=UserLoginPasswordResetResultRead(
            user_id=user.user_id,
            generated_credentials=GeneratedUserCredentialsRead(
                one_time_login_password=new_one_time_password,
                secondary_password=new_secondary_password,
            ),
            must_change_password=user.must_change_password,
        ),
        message="Login password reset successfully and secondary password rotated",
        request=request,
    )

@router.get(
    "/{user_id}/2fa/status",
    response_model=GenericResponse[TwoFactorStatusRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def get_user_two_factor_status_v1(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    target_user = user_service.get(session, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    enabled, enrolled_at = auth_service.get_two_factor_status(session, target_user.id)
    return create_success_response(
        data=TwoFactorStatusRead(
            enabled=enabled,
            method="authenticator_app",
            enrolled_at=enrolled_at,
        ),
        request=request,
    )

@router.post(
    "/{user_id}/2fa/enroll/initiate",
    response_model=GenericResponse[TwoFactorEnrollmentInitiateRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def initiate_user_two_factor_enrollment(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    target_user = user_service.get(session, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    _ensure_two_factor_management_allowed(target_user)

    try:
        enrollment = auth_service.begin_two_factor_enrollment(session, target_user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    session.commit()
    return create_success_response(
        data=TwoFactorEnrollmentInitiateRead(**enrollment),
        message="Two-factor enrollment initiated",
        request=request,
    )


@router.post(
    "/{user_id}/2fa/enroll/verify",
    response_model=GenericResponse[TwoFactorStatusRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def verify_user_two_factor_enrollment(
    user_id: str,
    payload: TwoFactorCodeVerifyRequest,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    target_user = user_service.get(session, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    _ensure_two_factor_management_allowed(target_user)

    try:
        verified, enrolled_at = auth_service.verify_two_factor_enrollment(
            session,
            target_user,
            payload.code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    if not verified:
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticator code",
        )

    session.commit()
    return create_success_response(
        data=TwoFactorStatusRead(enabled=True, method="authenticator_app", enrolled_at=enrolled_at),
        message="Two-factor authentication enabled",
        request=request,
    )



@router.post(
    "/{user_id}/2fa/reset",
    response_model=GenericResponse[TwoFactorStatusRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def reset_user_two_factor_enrollment(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    target_user = user_service.get(session, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    auth_service.reset_two_factor_enrollment_for_user(
        session,
        target_user,
        actor_id=current_user.id,
    )
    auth_service.revoke_sessions_for_user(session, target_user.id)
    session.commit()

    return create_success_response(
        data=TwoFactorStatusRead(
            enabled=False,
            method="authenticator_app",
            enrolled_at=None,
        ),
        message="Two-factor authentication reset successfully",
        request=request,
    )


@router.get(
    "/{user_id}/2fa/status",
    response_model=GenericResponse[TwoFactorStatusRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def get_user_two_factor_status(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    target_user = user_service.get(session, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    enabled, enrolled_at = auth_service.get_two_factor_status(session, target_user.id)

    return create_success_response(
        data=TwoFactorStatusRead(
            enabled=enabled,
            method="authenticator_app",
            enrolled_at=enrolled_at,
        ),
        request=request,
    )


@router.patch(
    "/{user_id}",
    response_model=GenericResponse[UserRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    user = user_service.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    should_revoke_sessions = user_service.requires_session_revocation(user, user_data)
    updated_user = user_service.update(
        session,
        user,
        user_data,
        actor_id=current_user.id,
    )

    message = "User updated successfully"
    if should_revoke_sessions:
        auth_service.revoke_sessions_for_user(session, updated_user.id)
        message = "User updated successfully. Active sessions were revoked for security."

    _commit_and_refresh(session, updated_user)

    return create_success_response(
        data=updated_user,
        message=message,
        request=request,
    )


@router.delete(
    "/{user_id}",
    response_model=GenericResponse[UserRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def delete_user(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    user = user_service.get(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    deleted_user = user_service.delete(session, user, actor_id=current_user.id)
    session.commit()
    session.refresh(deleted_user)

    return create_success_response(
        data=deleted_user, message="User deleted successfully", request=request
    )


@router.post(
    "/{user_id}/restore",
    response_model=GenericResponse[UserRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def restore_user(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    user = user_service.get(session, user_id, include_deleted=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    restored_user = user_service.restore(session, user, actor_id=current_user.id)
    session.commit()
    session.refresh(restored_user)

    return create_success_response(
        data=restored_user, message="User restored successfully", request=request
    )


@router.get("/entrusted-items/categories", response_model=dict[str, list[str]])
async def list_entrusted_categories(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    return entrusted_service.get_entrusted_categories(session)


@router.get(
    "/entrusted-items/all",
    response_model=GenericResponse[list[EntrustedItemRead]],
)
async def list_all_entrusted_items(
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=20, ge=1, le=500, description="Records per page"),
    search: Optional[str] = Query(default=None, description="Search by employee name, unit ID, serial number, or item name"),
    status: Optional[str] = Query(default=None, description="Filter by status (active, returned)"),
    category: Optional[str] = Query(default=None, description="Filter by category"),
    classification: Optional[str] = Query(default=None, description="Filter by classification"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    skip = (page - 1) * per_page
    items, total = entrusted_service.get_all_entrusted(
        session, 
        skip=skip, 
        limit=per_page, 
        search=search,
        status=status,
        category=category,
        classification=classification
    )
    return create_success_response(
        data=items,
        request=request,
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page)
    )

@router.get(
    "/{user_id}/entrusted-items",
    response_model=GenericResponse[list[EntrustedItemRead]],
)
async def list_entrusted_items(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    items = entrusted_service.get_for_user(session, user_id)
    return create_success_response(data=items, request=request)

@router.post(
    "/{user_id}/entrusted-items",
    response_model=GenericResponse[EntrustedItemRead],
)
async def assign_entrusted_item(
    user_id: str,
    create_data: EntrustedItemCreate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    try:
        # verify the user_id in path matches the body, or just override
        if create_data.user_id != user_id:
            create_data.user_id = user_id
            
        item = entrusted_service.assign_item(session, create_data, actor_id=current_user.id)
        return create_success_response(data=item, message="Item entrusted successfully.", request=request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post(
    "/{user_id}/entrusted-items/{assignment_id}/revoke",
    response_model=GenericResponse[EntrustedItemRead],
)
async def revoke_entrusted_item(
    user_id: str,
    assignment_id: str,
    revoke_data: EntrustedItemRevoke,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:users:manage")),
):
    try:
        item = entrusted_service.revoke_item(session, assignment_id, revoke_data, actor_id=current_user.id)
        return create_success_response(data=item, message="Assignment revoked successfully.", request=request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
