from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlmodel import Session
from core.database import get_session
from core.deps import get_current_user
from core.schemas import GenericResponse, create_success_response
from systems.admin.models.user import User
from systems.inventory.schemas.borrow_request_schemas import BorrowRequestRead
from systems.inventory.services.dashboard_service import (
    DashboardService,
    DashboardStats,
    LowStockItemRead,
    InventoryCategoryBreakdown,
    InventoryHealthBreakdown,
    BorrowingTrend,
)
from systems.inventory.services.borrow_request_service import BorrowService
from systems.auth.dependencies import require_permission

router = APIRouter()
dashboard_service = DashboardService()
borrow_service = BorrowService()


class InventoryDashboardOverviewRead(BaseModel):
    stats: DashboardStats
    recent: list[BorrowRequestRead]
    low_stock: list[LowStockItemRead]
    pending_counts: dict[str, int]
    inventory_breakdown: list[InventoryCategoryBreakdown]
    health: InventoryHealthBreakdown
    trends: list[BorrowingTrend]


@router.get("/stats", response_model=GenericResponse[DashboardStats])
async def get_dashboard_stats(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:dashboard:view")),
):
    stats = dashboard_service.get_stats(session)
    return create_success_response(data=stats, request=request)


@router.get(
    "/overview",
    response_model=GenericResponse[InventoryDashboardOverviewRead],
)
async def get_dashboard_overview(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:dashboard:view")),
):
    recent = dashboard_service.get_recent_activity(session)
    overview = InventoryDashboardOverviewRead(
        stats=dashboard_service.get_stats(session),
        recent=borrow_service.serialize_borrow_requests(session, recent),
        low_stock=dashboard_service.get_low_stock_items(session),
        pending_counts=dashboard_service.get_pending_counts(session),
        inventory_breakdown=dashboard_service.get_inventory_by_category(session),
        health=dashboard_service.get_inventory_health_distribution(session),
        trends=dashboard_service.get_borrowing_trends(session),
    )
    return create_success_response(data=overview, request=request)


@router.get("/recent", response_model=GenericResponse[list[BorrowRequestRead]])
async def get_recent_activity(
    request: Request,
    limit: int = 5,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:dashboard:view")),
):
    recent = dashboard_service.get_recent_activity(session, limit)
    recent_read = borrow_service.serialize_borrow_requests(session, recent)
    return create_success_response(data=recent_read, request=request)


@router.get("/low-stock", response_model=GenericResponse[list[LowStockItemRead]])
async def get_low_stock_items(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:dashboard:view")),
):
    items = dashboard_service.get_low_stock_items(session)
    return create_success_response(data=items, request=request)


@router.get("/pending-counts", response_model=GenericResponse[dict[str, int]])
async def get_pending_counts(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:dashboard:view")),
):
    counts = dashboard_service.get_pending_counts(session)
    return create_success_response(data=counts, request=request)


@router.get(
    "/inventory-breakdown",
    response_model=GenericResponse[list[InventoryCategoryBreakdown]],
)
async def get_inventory_breakdown(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:dashboard:view")),
):
    breakdown = dashboard_service.get_inventory_by_category(session)
    return create_success_response(data=breakdown, request=request)


@router.get("/health", response_model=GenericResponse[InventoryHealthBreakdown])
async def get_inventory_health(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:dashboard:view")),
):
    health = dashboard_service.get_inventory_health_distribution(session)
    return create_success_response(data=health, request=request)


@router.get("/trends", response_model=GenericResponse[list[BorrowingTrend]])
async def get_borrowing_trends(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("inventory:dashboard:view")),
):
    trends = dashboard_service.get_borrowing_trends(session)
    return create_success_response(data=trends, request=request)
