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
    BorrowRequestCreate,
    BorrowRequestRead,
)
from core.schemas import ConfigRead
from systems.inventory.schemas.inventory_schemas import InventoryCatalogItemRead
from systems.inventory.services.inventory_service import InventoryService
from systems.inventory.services.borrow_request_service import BorrowService
from systems.auth.dependencies import require_permission, require_system_access

router = APIRouter()
borrow_service = BorrowService()
inventory_service = InventoryService()


class BorrowerTaxonomyRead(GenericResponse[dict[str, list[ConfigRead]]]):
    pass


@router.get("/taxonomy", response_model=GenericResponse[dict[str, list[ConfigRead]]])
async def borrower_inventory_taxonomy(request: Request, session: Session = Depends(get_session)):
    categories = inventory_service.config_service.get_by_category(session, "inventory_category")
    classifications = inventory_service.config_service.get_by_category(session, "inventory_classification")

    return create_success_response(
        data={
            "categories": categories,
            "classifications": classifications,
        },
        request=request,
    )


@router.get("/catalog", response_model=GenericResponse[list[InventoryCatalogItemRead]])
async def borrower_catalog(
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=20, ge=1, le=200, description="Records per page"),
    fetch_all: bool = Query(default=False, description="Return the full borrower catalog without pagination"),
    search: Optional[str] = Query(default=None, description="Search by item name (case-insensitive)"),
    category: Optional[str] = Query(default=None, description="Filter by category (exact match)"),
    item_type: Optional[str] = Query(default=None, description="Filter by item type (e.g. equipment, consumable)"),
    classification: Optional[str] = Query(default=None, description="Filter by classification (exact match)"),
    in_stock_only: bool = Query(default=False, description="Only include items with available stock"),
    session: Session = Depends(get_session),
):
    skip = 0 if fetch_all else (page - 1) * per_page
    limit = None if fetch_all else per_page
    items, total = inventory_service.get_catalog(
        session,
        skip=skip,
        limit=limit,
        search=search,
        category=category,
        item_type=item_type,
        classification=classification,
        in_stock_only=in_stock_only,
    )

    catalog_items = []
    for item in items:
        item_read = InventoryCatalogItemRead.model_validate(item)
        balances = inventory_service.get_item_balances(session, item)
        item_read.total_qty = balances["total_qty"]
        item_read.available_qty = balances["available_qty"]
        item_read.condition = inventory_service.get_item_condition(session, item)
        item_read.status_condition = inventory_service.get_item_status(session, item)
        catalog_items.append(item_read)

    return create_success_response(
        data=catalog_items,
        meta=make_pagination_meta(
            total=total,
            skip=skip,
            limit=total if fetch_all else per_page,
            page=1 if fetch_all else page,
            per_page=total if fetch_all else per_page,
        ),
        request=request,
    )


@router.get("/requests", response_model=GenericResponse[list[BorrowRequestRead]])
async def borrower_get_requests(
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=20, ge=1, le=200, description="Records per page"),
    status: Optional[str] = Query(default=None, description="Filter by request status (pending, approved, returned, etc.)"),
    search: Optional[str] = Query(default=None, description="Search by request ID, customer, or location"),
    is_emergency: Optional[bool] = Query(default=None, description="Filter by emergency flag"),
    date_from: Optional[datetime] = Query(default=None, description="Filter requests from this date (inclusive)"),
    date_to: Optional[datetime] = Query(default=None, description="Filter requests up to this date (inclusive)"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrower_portal:access")),
    __: None = Depends(require_system_access("inventory")),
):
    try:
        skip = (page - 1) * per_page
        requests, total = borrow_service.get_by_borrower(
            session,
            borrower_uuid=current_user.id,
            skip=skip,
            limit=per_page,
            status=status,
            search=search,
            is_emergency=is_emergency,
            date_from=date_from,
            date_to=date_to,
        )
        # TODO: Consider eager-loading related data in service serialization to reduce N+1 queries.
        serialized = borrow_service.serialize_borrow_requests(session, requests)
        return create_success_response(
            data=serialized,
            meta=make_pagination_meta(total=total, skip=skip, limit=per_page, page=page, per_page=per_page),
            request=request,
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Unable to fetch borrower requests at this time.")



@router.post("/requests", response_model=GenericResponse[BorrowRequestRead])
async def borrower_submit_request(
    request: Request,
    schema: BorrowRequestCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:borrower_portal:access")),
    __: None = Depends(require_system_access("inventory")),
):
    try:
        created_request = borrow_service.create_request(
            session,
            schema,
            borrower_id=current_user.user_id,
            request_channel="borrower_portal",
            actor_id=current_user.id,
        )
        session.commit()
        await manager.broadcast_catalog_update()
        return create_success_response(
            data=borrow_service.serialize_borrow_request(session, created_request),
            message="Request submitted successfully via Portal",
            request=request
        )
    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))
