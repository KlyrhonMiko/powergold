from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlmodel import Session

from core.database import get_session
from core.deps import get_current_user
from core.schemas import GenericResponse, create_success_response, make_pagination_meta
from core.websockets import manager
from systems.admin.models.user import User
from systems.inventory.schemas.borrow_request_schemas import (
    BorrowRequestAssignmentOptionsRead,
    BorrowRequestApprove,
    BorrowRequestAssignmentsUpdate,
    BorrowRequestBatchAssign,
    BorrowRequestBatchRead,
    BorrowRequestClose,
    BorrowRequestCreate,
    BorrowRequestUnitAssign,
    BorrowRequestUnitRead,
    BorrowRequestReject,
    BorrowRequestRead,
    BorrowRequestReopen,
    BorrowRequestRelease,
    BorrowRequestReturn,
    BorrowRequestVoid,
    BorrowRequestEventRead,
    BorrowRequestEventGlobalRead,
    ReleaseReceiptRead,
    ReleaseReceiptSignature,
)
from systems.inventory.services.borrow_request_service import BorrowService
from systems.auth.dependencies import require_permission

router = APIRouter()
borrow_service = BorrowService()


@router.post(
    "/requests",
    response_model=GenericResponse[BorrowRequestRead],
    status_code=201,
    responses={400: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def create_request(
    request_data: BorrowRequestCreate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        borrow_req = borrow_service.create_request(
            session,
            request_data,
            borrower_id=current_user.user_id,
            request_channel="inventory_manager",
            actor_id=current_user.id,
        )
        session.commit()
        await manager.broadcast_catalog_update()

        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, borrow_req),
            message="Borrow request created",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/requests/{request_id}/assignment-options",
    response_model=GenericResponse[BorrowRequestAssignmentOptionsRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def get_assignment_options(
    request_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        options = borrow_service.get_assignment_options(session, request_id)
        return create_success_response(data=options, request=request)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch(
    "/requests/{request_id}/assignments",
    response_model=GenericResponse[BorrowRequestRead],
    responses={
        404: {"model": GenericResponse},
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
    },
)
async def assign_request_inventory(
    request_id: str,
    payload: BorrowRequestAssignmentsUpdate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        updated_request = borrow_service.assign_request_inventory(
            session,
            request_id=request_id,
            assignments=payload.items,
            actor_id=current_user.id,
            note=payload.notes,
        )
        session.commit()
        await manager.broadcast_catalog_update()
        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, updated_request),
            message="Inventory assigned to request",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/requests",
    response_model=GenericResponse[list[BorrowRequestRead]],
    responses={401: {"model": GenericResponse}},
)
async def list_requests(
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=20, ge=1, le=500, description="Records per page"),
    status: Optional[str] = Query(default=None, description="Filter by status (pending, approved, released, returned, rejected, etc.)"),
    request_channel: Optional[str] = Query(default=None, description="Filter by request channel (inventory_manager, borrower_portal)"),
    is_emergency: Optional[bool] = Query(default=None, description="Filter by emergency flag"),
    borrower_id: Optional[str] = Query(default=None, description="Filter by borrower user ID (e.g. ST-001)"),
    search: Optional[str] = Query(default=None, description="Search across borrower name, client, location, request ID"),
    returned_on_time: Optional[bool] = Query(default=None, description="Filter by on-time return status"),
    date_from: Optional[datetime] = Query(default=None, description="Filter requests from this date (inclusive)"),
    date_to: Optional[datetime] = Query(default=None, description="Filter requests up to this date (inclusive)"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    skip = (page - 1) * per_page
    requests, total = borrow_service.get_all(
        session,
        skip=skip,
        limit=per_page,
        status=status,
        request_channel=request_channel,
        is_emergency=is_emergency,
        borrower_id=borrower_id,
        search=search,
        returned_on_time=returned_on_time,
        date_from=date_from,
        date_to=date_to,
    )
    serialized = borrow_service.serialize_borrow_requests(session, requests)
    return create_success_response(
        data=serialized,
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request,
    )


@router.post(
    "/requests/{request_id}/approve",
    response_model=GenericResponse[BorrowRequestRead],
    responses={
        404: {"model": GenericResponse},
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
    },
)
async def approve_request(
    request_id: str,
    payload: BorrowRequestApprove,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        updated_req = borrow_service.approve_request(
            session,
            request_id,
            current_user.id,
            note=payload.notes,
        )
        session.commit()

        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, updated_req),
            message="Request approved",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/requests/{request_id}/reject",
    response_model=GenericResponse[BorrowRequestRead],
    responses={
        404: {"model": GenericResponse},
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
    },
)
async def reject_request(
    request_id: str,
    payload: BorrowRequestReject,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        updated_req = borrow_service.reject_request(
            session,
            request_id,
            current_user.id,
            note=payload.notes,
        )
        session.commit()

        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, updated_req),
            message="Request rejected",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/requests/{request_id}/void",
    response_model=GenericResponse[BorrowRequestRead],
    responses={
        404: {"model": GenericResponse},
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
    },
)
async def void_request(
    request_id: str,
    payload: BorrowRequestVoid,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        updated_req = borrow_service.void_request(
            session,
            request_id,
            current_user.id,
            note=payload.notes,
        )
        session.commit()

        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, updated_req),
            message="Request voided",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/requests/{request_id}/release",
    response_model=GenericResponse[BorrowRequestRead],
    responses={
        404: {"model": GenericResponse},
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
    },
)
async def release_request(
    request_id: str,
    payload: BorrowRequestRelease,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        updated_req = borrow_service.release_request(
            session,
            request_id,
            current_user.id,
            note=payload.notes,
        )
        session.commit()
        await manager.broadcast_catalog_update()

        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, updated_req),
            message="Request released",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.patch(
    "/requests/{request_id}/assign-units",
    response_model=GenericResponse[list[BorrowRequestUnitRead]],
    responses={
        404: {"model": GenericResponse},
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
    },
)
async def assign_units_to_request(
    request_id: str,
    payload: BorrowRequestUnitAssign,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        assignments = borrow_service.assign_units(
            session,
            request_id=request_id,
            unit_ids=payload.unit_ids,
            actor_id=current_user.id,
            item_id=payload.item_id,
            note=payload.notes,
        )
        session.commit()
        await manager.broadcast_catalog_update()

        return create_success_response(
            data=assignments, message="Units assigned to request", request=request
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.patch(
    "/requests/{request_id}/assign-batches",
    response_model=GenericResponse[list[BorrowRequestBatchRead]],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def assign_batches_to_request(
    request_id: str,
    payload: BorrowRequestBatchAssign,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        assignments = borrow_service.assign_batches(
            session,
            request_id=request_id,
            batch_assignments=payload.assignments,
            actor_id=current_user.id,
            item_id=payload.item_id,
            note=payload.notes,
        )
        session.commit()
        await manager.broadcast_catalog_update()

        return create_success_response(
            data=assignments, message="Batches assigned to request", request=request
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/requests/{request_id}/batches",
    response_model=GenericResponse[list[BorrowRequestBatchRead]],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def get_assigned_batches(
    request_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    db_request = borrow_service.get(session, request_id)
    if not db_request:
        raise HTTPException(status_code=404, detail="Request not found")

    return create_success_response(
        data=borrow_service.serialize_assigned_batches(session, db_request),
        request=request,
    )


@router.get(
    "/requests/{request_id}/units",
    response_model=GenericResponse[list[BorrowRequestUnitRead]],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def get_assigned_units(
    request_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    db_request = borrow_service.get(session, request_id)
    if not db_request:
        raise HTTPException(status_code=404, detail="Request not found")
    return create_success_response(data=db_request.assigned_units, request=request)


@router.post(
    "/requests/{request_id}/return",
    response_model=GenericResponse[BorrowRequestRead],
    responses={
        404: {"model": GenericResponse},
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
    },
)
async def return_request(
    request_id: str,
    payload: BorrowRequestReturn,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        updated_req = borrow_service.return_request(
            session,
            request_id,
            actor_id=current_user.id,
            note=payload.notes,
            unit_returns=payload.unit_returns,
            batch_returns=payload.batch_returns or None,
        )
        session.commit()
        await manager.broadcast_catalog_update()

        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, updated_req),
            message="Request returned",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/requests/{request_id}/reopen",
    response_model=GenericResponse[BorrowRequestRead],
    responses={
        404: {"model": GenericResponse},
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
    },
)
async def reopen_request(
    request_id: str,
    payload: BorrowRequestReopen,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        updated_req = borrow_service.reopen_request(
            session,
            request_id,
            actor_id=current_user.id,
            note=payload.notes,
        )
        session.commit()
        await manager.broadcast_catalog_update()

        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, updated_req),
            message="Request reopened",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/requests/{request_id}",
    response_model=GenericResponse[BorrowRequestRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def get_request(
    request_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    # The service 'get' method already handles the lookup
    borrow_req = borrow_service.get(session, request_id)
    if not borrow_req:
        raise HTTPException(status_code=404, detail="Request not found")
    return create_success_response(
        data=borrow_service.serialize_borrow_request(session, borrow_req),
        request=request,
    )


@router.get(
    "/requests/{request_id}/events",
    response_model=GenericResponse[list[BorrowRequestEventRead]],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def get_request_events(
    request_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    borrow_req = borrow_service.get(session, request_id)
    if not borrow_req:
        raise HTTPException(status_code=404, detail="Request not found")

    events = borrow_service.serialize_borrow_events(session, borrow_req.events or [])
    return create_success_response(data=events, request=request)


@router.get(
    "/events",
    response_model=GenericResponse[list[BorrowRequestEventGlobalRead]],
    responses={401: {"model": GenericResponse}},
)
async def get_all_request_events(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    event_type: Optional[str] = Query(None),
    request_id: Optional[str] = Query(None),
    actor_name: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    results, total = borrow_service.get_all_events(
        session,
        page=page,
        per_page=per_page,
        event_type=event_type,
        request_id=request_id,
        actor_name=actor_name,
        date_from=date_from,
        date_to=date_to,
    )

    events = borrow_service.serialize_global_events(session, results)

    return create_success_response(
        data=events,
        request=request,
        meta=make_pagination_meta(
            total=total,
            skip=(page - 1) * per_page,
            limit=per_page,
            page=page,
            per_page=per_page,
        ),
    )


@router.get(
    "/requests/{request_id}/release-receipt",
    response_model=GenericResponse[ReleaseReceiptRead],
    responses={404: {"model": GenericResponse}, 400: {"model": GenericResponse}},
)
async def get_release_receipt(
    request_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        receipt = borrow_service.generate_release_receipt(session, request_id)
        return create_success_response(data=receipt, request=request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/requests/{request_id}/signature",
    response_model=GenericResponse[BorrowRequestRead],
)
async def save_borrow_signature(
    request_id: str,
    payload: ReleaseReceiptSignature,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        updated_req = borrow_service.save_signature(
            session, request_id, payload.signature_data
        )
        session.commit()
        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, updated_req),
            message="Signature saved",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/requests/{request_id}/close",
    response_model=GenericResponse[BorrowRequestRead],
)
async def close_request(
    request_id: str,
    payload: BorrowRequestClose,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrow_requests:manage")),
):
    try:
        updated_req = borrow_service.close_request(
            session, request_id, current_user.id, notes=payload.notes
        )
        session.commit()
        await manager.broadcast_catalog_update()

        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, updated_req),
            message="Request closed",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))
