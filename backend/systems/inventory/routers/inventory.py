from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlmodel import Session

from core.database import get_session
from core.deps import get_current_user
from core.schemas import GenericResponse, PaginationMeta, create_success_response, make_pagination_meta
from core.websockets import manager
from systems.admin.models.user import User
from systems.inventory.schemas.inventory_schemas import (
    InventoryItemCreate,
    InventoryItemRead,
    InventoryItemUpdate,
)
from systems.inventory.schemas.inventory_unit_schemas import (
    InventoryUnitRead,
    InventoryUnitCreate,
    InventoryUnitBatchCreate,
    InventoryUnitUpdate,
)
from systems.inventory.schemas.inventory_batch_schemas import (
    InventoryBatchRead,
    InventoryBatchCreate,
    InventoryBatchUpdate,
)
from systems.inventory.schemas.inventory_movement_schemas import InventoryMovementRead
from systems.inventory.schemas.inventory_movement_schemas import (
    InventoryMovementAnomalyRead,
    InventoryMovementReconciliationRead,
    InventoryMovementReversalRead,
    InventoryMovementReversalRequest,
    InventoryMovementSummaryRead,
    InventoryMovementAdjust,
)
from systems.inventory.services.inventory_service import InventoryService
from systems.inventory.dependencies import shift_guard

from systems.auth.dependencies import require_permission, require_system_access

router = APIRouter()
inventory_service = InventoryService()


def _to_inventory_item_read(session: Session, item) -> InventoryItemRead:
    item_read = InventoryItemRead.model_validate(item)
    balances = inventory_service.get_item_balances(session, item)
    item_read.total_qty = balances["total_qty"]
    item_read.available_qty = balances["available_qty"]
    item_read.condition = inventory_service.get_item_condition(session, item)
    item_read.status_condition = inventory_service.get_item_status(session, item)
    return item_read


def _to_inventory_item_reads(session: Session, items: list) -> list[InventoryItemRead]:
    condition_map = inventory_service.get_item_condition_map(session, items)
    reads: list[InventoryItemRead] = []
    for item in items:
        item_read = InventoryItemRead.model_validate(item)
        item_read.total_qty = item.total_qty
        item_read.available_qty = item.available_qty
        item_read.condition = condition_map.get(item.id, "good")
        item_read.status_condition = inventory_service.get_item_status(session, item)
        reads.append(item_read)
    return reads


@router.post(
    "",
    response_model=GenericResponse[InventoryItemRead],
    status_code=201,
    responses={400: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def create_item(
    item_data: InventoryItemCreate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:items:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    item = inventory_service.create(
        session, 
        item_data,
        actor_id=current_user.id,
    )
    session.commit()
    await manager.broadcast_catalog_update()
    session.refresh(item)

    item_read = _to_inventory_item_read(session, item)

    return create_success_response(
        data=item_read, message="Item created successfully", request=request
    )


@router.get(
    "",
    response_model=GenericResponse[list[InventoryItemRead]],
    responses={401: {"model": GenericResponse}},
)
async def list_items(
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    per_page: int = Query(default=20, ge=1, le=500, description="Records per page"),
    search: Optional[str] = Query(default=None, description="Search by item name (case-insensitive)"),
    category: Optional[str] = Query(default=None, description="Filter by category (exact match)"),
    item_type: Optional[str] = Query(default=None, description="Filter by item type (e.g. equipment, consumable)"),
    classification: Optional[str] = Query(default=None, description="Filter by classification (exact match)"),
    is_trackable: Optional[bool] = Query(default=None, description="Filter trackable/non-trackable items"),
    include_deleted: bool = Query(default=False, description="Include soft-deleted items"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:items:view")),
    __: None = Depends(require_system_access("inventory")),
):
    skip = (page - 1) * per_page
    items, total = inventory_service.get_all(
        session,
        skip=skip,
        limit=per_page,
        search=search,
        category=category,
        item_type=item_type,
        classification=classification,
        is_trackable=is_trackable,
        include_deleted=include_deleted,
    )
    items_read = _to_inventory_item_reads(session, items)

    return create_success_response(
        data=items_read,
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request,
    )


@router.get(
    "/{item_id}",
    response_model=GenericResponse[InventoryItemRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def get_item(
    item_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:items:view")),
    __: None = Depends(require_system_access("inventory")),
):
    item = inventory_service.get(session, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item_read = _to_inventory_item_read(session, item)

    return create_success_response(data=item_read, request=request)


@router.patch(
    "/{item_id}",
    response_model=GenericResponse[InventoryItemRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def update_item(
    item_id: str,
    item_data: InventoryItemUpdate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:items:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    item = inventory_service.get(session, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    updated_item = inventory_service.update(
        session, 
        item, 
        item_data,
        actor_id=current_user.id,
    )
    session.commit()
    await manager.broadcast_catalog_update()
    session.refresh(updated_item)

    item_read = _to_inventory_item_read(session, updated_item)

    return create_success_response(
        data=item_read, message="Item updated successfully", request=request
    )


@router.post(
    "/{item_id}/adjust-stock", response_model=GenericResponse[InventoryItemRead]
)
async def adjust_stock(
    item_id: str,
    payload: InventoryMovementAdjust,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:items:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    """
    Transactional stock adjustment.
    Use this for procurement, damage, or manual corrections.
    """
    try:
        item = inventory_service.adjust_stock(
            session,
            item_id,
            qty_change=payload.qty_change,
            movement_type=payload.movement_type,
            reason_code=payload.reason_code,
            reference_id=payload.reference_id,
            reference_type=payload.reference_type,
            batch_id=payload.batch_id,
            note=payload.note,
            actor_id=current_user.id,
        )
        session.commit()
        await manager.broadcast_catalog_update()
        session.refresh(item)

        item_read = _to_inventory_item_read(session, item)

        return create_success_response(
            data=item_read,
            message=f"Stock successfully adjusted by {payload.qty_change}",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete(
    "/{item_id}",
    response_model=GenericResponse[InventoryItemRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def delete_item(
    item_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:items:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    item = inventory_service.get(session, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    deleted_item = inventory_service.delete(
        session, 
        item,
        actor_id=current_user.id,
    )
    session.commit()
    await manager.broadcast_catalog_update()
    session.refresh(deleted_item)

    item_read = _to_inventory_item_read(session, deleted_item)

    return create_success_response(
        data=item_read, message="Item deleted successfully", request=request
    )


@router.post(
    "/{item_id}/restore",
    response_model=GenericResponse[InventoryItemRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def restore_item(
    item_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:items:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    item = inventory_service.get(session, item_id, include_deleted=True)
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if not item.is_deleted:
        raise HTTPException(
            status_code=400, 
            detail="Item is already active and does not need to be restored"
        )
        
    restored_item = inventory_service.restore(
        session, 
        item,
        actor_id=current_user.id,
    )
    session.commit()
    await manager.broadcast_catalog_update()
    session.refresh(restored_item)

    item_read = _to_inventory_item_read(session, restored_item)
    return create_success_response(
        data=item_read, message="Item restored successfully", request=request
    )


@router.get(
    "/movements/ledger", response_model=GenericResponse[list[InventoryMovementRead]]
)
async def get_all_movements_ledger(
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=50, ge=1, le=500, description="Records per page"),
    movement_type: Optional[str] = Query(default=None, description="Filter by movement type (e.g. manual_adjustment, procurement)"),
    inventory_id: Optional[str] = Query(default=None, description="Filter by inventory item ID"),
    reason_code: Optional[str] = Query(default=None, description="Filter by reason code (exact match)"),
    reference_id: Optional[str] = Query(default=None, description="Filter by reference ID (e.g. borrow request ID)"),
    reference_type: Optional[str] = Query(default=None, description="Filter by reference type (e.g. borrow_request, inventory_movement, external_reference)"),
    date_from: Optional[datetime] = Query(default=None, description="Filter movements from this datetime (inclusive)"),
    date_to: Optional[datetime] = Query(default=None, description="Filter movements up to this datetime (inclusive)"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:movements:view")),
    __: None = Depends(require_system_access("inventory")),
):
    """Get the complete inventory movement ledger across all items with pagination and filters."""
    skip = (page - 1) * per_page
    movements, total = inventory_service.get_all_movements(
        session,
        skip=skip,
        limit=per_page,
        movement_type=movement_type,
        inventory_id=inventory_id,
        reason_code=reason_code,
        reference_id=reference_id,
        reference_type=reference_type,
        date_from=date_from,
        date_to=date_to,
    )

    return create_success_response(
        data=movements,
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request,
    )


@router.get(
    "/{item_id}/movement-history", response_model=GenericResponse[list[InventoryMovementRead]]
)
async def get_item_history(
    item_id: str,
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=50, ge=1, le=500, description="Records per page"),
    movement_type: Optional[str] = Query(default=None, description="Filter by movement type"),
    date_from: Optional[datetime] = Query(default=None, description="Filter from this datetime (inclusive)"),
    date_to: Optional[datetime] = Query(default=None, description="Filter up to this datetime (inclusive)"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:movements:view")),
    __: None = Depends(require_system_access("inventory")),
):
    """Get the stock movement ledger (history) for a specific inventory item."""
    skip = (page - 1) * per_page
    history, total = inventory_service.get_history(
        session,
        item_id,
        movement_type=movement_type,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=per_page,
    )

    return create_success_response(
        data=history,
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request,
    )


@router.post(
    "/{item_id}/units",
    response_model=GenericResponse[InventoryUnitRead],
    status_code=201,
    responses={
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
        404: {"model": GenericResponse},
    },
)
async def create_unit(
    item_id: str,
    unit_data: InventoryUnitCreate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:units:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    """
    Create a single unit for a trackable inventory item.
    Item must exist and be marked as trackable (is_trackable=true).
    Serial number must be unique across all units.
    """
    try:
        unit = inventory_service.create_unit(
            session,
            item_id=item_id,
            serial_number=unit_data.serial_number,
            expiration_date=unit_data.expiration_date,
            condition=unit_data.condition,
            description=unit_data.description,
            actor_id=current_user.id,
        )
        session.commit()
        await manager.broadcast_catalog_update()
        session.refresh(unit)
        unit_read = InventoryUnitRead.model_validate(unit)

        return create_success_response(
            data=unit_read, message="Unit created successfully", request=request
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/{item_id}/units/batch",
    response_model=GenericResponse[list[InventoryUnitRead]],
    status_code=201,
    responses={
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
        404: {"model": GenericResponse},
    },
)
async def create_units_batch(
    item_id: str,
    batch_data: InventoryUnitBatchCreate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:units:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    """
    Batch create multiple units for a trackable inventory item.
    All units must be valid and unique. If any validation fails, the entire batch is rejected (atomic transaction).
    Maximum 500 units per batch.
    """
    try:
        units_list = [unit_data.model_dump() for unit_data in batch_data.units]
        created_units = inventory_service.create_units_batch(
            session,
            item_id=item_id,
            units_data=units_list,
            actor_id=current_user.id,
        )
        session.commit()
        await manager.broadcast_catalog_update()
        for unit in created_units:
            session.refresh(unit)
        units_read = [InventoryUnitRead.model_validate(u) for u in created_units]

        return create_success_response(
            data=units_read,
            message=f"{len(units_read)} units created successfully",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/{item_id}/units",
    response_model=GenericResponse[list[InventoryUnitRead]],
    responses={401: {"model": GenericResponse}},
)
async def list_item_units(
    item_id: str,
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=50, ge=1, le=500, description="Records per page"),
    status: Optional[str] = Query(default=None, description="Filter by unit status (available, borrowed, maintenance, retired)"),
    condition: Optional[str] = Query(default=None, description="Filter by unit condition (e.g. good, damaged)"),
    serial_number: Optional[str] = Query(default=None, description="Search by serial number (partial match)"),
    expiring_before: Optional[datetime] = Query(default=None, description="Filter units expiring before this date"),
    include_expired: bool = Query(default=True, description="Include expired units in results"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:units:view")),
    __: None = Depends(require_system_access("inventory")),
):
    """
    Get all units for a specific inventory item.
    Status values: 'available', 'borrowed', 'maintenance', 'retired'
    """
    skip = (page - 1) * per_page
    units, total = inventory_service.get_units_by_status(
        session,
        item_id=item_id,
        status=status,
        condition=condition,
        serial_number=serial_number,
        expiring_before=expiring_before,
        include_expired=include_expired,
        skip=skip,
        limit=per_page,
    )
    units_read = [InventoryUnitRead.model_validate(u) for u in units]

    return create_success_response(
        data=units_read,
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request,
    )


@router.patch(
    "/{item_id}/units/{unit_id}",
    response_model=GenericResponse[InventoryUnitRead],
    responses={
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
        404: {"model": GenericResponse},
    },
)
async def update_unit(
    item_id: str,
    unit_id: str,
    unit_data: InventoryUnitUpdate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:units:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    """
    Update unit status and/or condition.
    Serial number is immutable and cannot be modified.
    Status values: 'available', 'borrowed', 'maintenance', 'retired'
    """
    try:
        unit = inventory_service.update_unit(
            session,
            unit_id=unit_id,
            status=unit_data.status,
            expiration_date=unit_data.expiration_date,
            condition=unit_data.condition,
            description=unit_data.description,
            actor_id=current_user.id,
        )
        session.commit()
        await manager.broadcast_catalog_update()
        session.refresh(unit)
        unit_read = InventoryUnitRead.model_validate(unit)

        return create_success_response(
            data=unit_read, message="Unit updated successfully", request=request
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=404, detail=str(e))


@router.delete(
    "/{item_id}/units/{unit_id}",
    response_model=GenericResponse[InventoryUnitRead],
    responses={
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
        404: {"model": GenericResponse},
    },
)
async def retire_unit(
    item_id: str,
    unit_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:units:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    """
    Retire (soft delete) a unit. Once retired, a unit cannot be borrowed or used.
    Retiring a unit is a permanent status change (status → 'retired').
    """
    try:
        unit = inventory_service.retire_unit(
            session,
            unit_id=unit_id,
            actor_id=current_user.id,
        )
        session.commit()
        await manager.broadcast_catalog_update()
        session.refresh(unit)
        unit_read = InventoryUnitRead.model_validate(unit)

        return create_success_response(
            data=unit_read, message="Unit retired successfully", request=request
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/{item_id}/batches",
    response_model=GenericResponse[list[InventoryBatchRead]],
    responses={401: {"model": GenericResponse}},
)
async def list_item_batches(
    item_id: str,
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=50, ge=1, le=500, description="Records per page"),
    status: Optional[str] = Query(default=None, description="Filter by batch status"),
    include_expired: bool = Query(default=True, description="Include expired batches"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:units:view")),
    __: None = Depends(require_system_access("inventory")),
):
    """List all batches for a specific inventory item."""
    skip = (page - 1) * per_page
    batches, total = inventory_service.get_batches(
        session,
        item_id=item_id,
        status=status,
        include_expired=include_expired,
        skip=skip,
        limit=per_page,
    )
    batches_read = [InventoryBatchRead.model_validate(b) for b in batches]

    return create_success_response(
        data=batches_read,
        meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
        request=request,
    )


@router.post(
    "/{item_id}/batches",
    response_model=GenericResponse[InventoryBatchRead],
    status_code=201,
    responses={400: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def create_batch(
    item_id: str,
    batch_data: InventoryBatchCreate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:units:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    """Create a new batch for an untrackable inventory item (Metadata only)."""
    try:
        batch = inventory_service.create_batch(
            session,
            item_id=item_id,
            schema=batch_data,
            actor_id=current_user.id,
        )
        session.commit()
        await manager.broadcast_catalog_update()
        session.refresh(batch)
        batch_read = InventoryBatchRead.model_validate(batch)

        return create_success_response(
            data=batch_read, message="Batch created successfully", request=request
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.patch(
    "/{item_id}/batches/{batch_id}",
    response_model=GenericResponse[InventoryBatchRead],
    responses={404: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def update_batch(
    item_id: str,
    batch_id: str,
    batch_data: InventoryBatchUpdate,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:units:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    """Update batch metadata (status and/or expiration)."""
    try:
        batch = inventory_service.update_batch(
            session,
            batch_id=batch_id,
            schema=batch_data,
            actor_id=current_user.id,
        )
        session.commit()
        await manager.broadcast_catalog_update()
        session.refresh(batch)
        batch_read = InventoryBatchRead.model_validate(batch)

        return create_success_response(
            data=batch_read, message="Batch updated successfully", request=request
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/{item_id}/movements/reconcile",
    response_model=GenericResponse[InventoryMovementReconciliationRead],
    responses={400: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def reconcile_item_movements(
    item_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:movements:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    try:
        result = inventory_service.reconcile_movements(session, item_id)
        message = (
            "Inventory ledger reconciled"
            if result.is_reconciled
            else "Inventory ledger mismatch detected"
        )

        return create_success_response(data=result, message=message, request=request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/movements/{movement_id}/reverse",
    response_model=GenericResponse[InventoryMovementReversalRead],
    responses={
        400: {"model": GenericResponse},
        401: {"model": GenericResponse},
        404: {"model": GenericResponse},
    },
)
async def reverse_movement(
    movement_id: str,
    payload: InventoryMovementReversalRequest,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:movements:manage")),
    ___: None = Depends(require_system_access("inventory")),
):
    try:
        original = inventory_service.get_movement(session, movement_id)
        if not original:
            raise HTTPException(status_code=404, detail="Movement not found")

        reversal = inventory_service.reverse_movement(
            session,
            movement_id,
            reason=payload.reason,
            reason_code=payload.reason_code,
            actor_id=current_user.id,
        )
        session.commit()
        await manager.broadcast_catalog_update()
        session.refresh(reversal)

        response = InventoryMovementReversalRead(
            original_movement_id=original.movement_id,
            reversal_movement_id=reversal.movement_id,
            original_qty_change=original.qty_change,
            reversal_qty_change=reversal.qty_change,
            reason=payload.reason,
            reason_code=reversal.reason_code,
            occurred_at=reversal.occurred_at,
        )

        return create_success_response(
            data=response,
            message="Movement reversed with compensating entry",
            request=request,
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise


@router.get(
    "/{item_id}/movements/summary",
    response_model=GenericResponse[InventoryMovementSummaryRead],
    responses={400: {"model": GenericResponse}, 401: {"model": GenericResponse}},
)
async def get_item_movement_summary(
    item_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:movements:view")),
    __: None = Depends(require_system_access("inventory")),
):
    try:
        summary = inventory_service.get_movements_summary(session, item_id)

        return create_success_response(data=summary, request=request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/movements/anomalies",
    response_model=GenericResponse[list[InventoryMovementAnomalyRead]],
    responses={401: {"model": GenericResponse}},
)
async def get_movement_anomalies(
    request: Request,
    severity: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: User = Depends(shift_guard),
    __: None = Depends(require_permission("inventory:movements:view")),
    ___: None = Depends(require_system_access("inventory")),
):
    try:
        anomalies = inventory_service.get_movement_anomalies(
            session,
            severity=severity,
            skip=skip,
            limit=limit,
        )

        return create_success_response(
            data=anomalies,
            meta=PaginationMeta(total=len(anomalies), limit=limit, offset=skip),
            request=request,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
