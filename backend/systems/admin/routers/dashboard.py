from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlmodel import Session
from core.database import get_session
from core.deps import get_current_user
from core.schemas import GenericResponse, create_success_response
from systems.admin.models.user import User
from systems.admin.services.dashboard_service import (
    AdminDashboardService,
    AdminStats,
    ActivityPoint,
    UserInsights,
    SystemRegistry,
)
from systems.auth.dependencies import require_permission

router = APIRouter()
dashboard_service = AdminDashboardService()


class AdminDashboardOverviewRead(BaseModel):
    stats: AdminStats
    activity: list[ActivityPoint]
    users: UserInsights
    registry: list[SystemRegistry]

@router.get("/stats", response_model=GenericResponse[AdminStats])
async def get_admin_stats(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:dashboard:view")),
):
    stats = dashboard_service.get_stats(session)
    return create_success_response(data=stats, request=request)


@router.get("/overview", response_model=GenericResponse[AdminDashboardOverviewRead])
async def get_dashboard_overview(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:dashboard:view")),
):
    overview = AdminDashboardOverviewRead(
        stats=dashboard_service.get_stats(session),
        activity=dashboard_service.get_activity_heatmap(session),
        users=UserInsights(
            distribution=dashboard_service.get_user_distribution(session),
            trends=dashboard_service.get_user_registration_trends(session),
        ),
        registry=dashboard_service.get_system_registry_counts(session),
    )
    return create_success_response(data=overview, request=request)

@router.get("/activity", response_model=GenericResponse[list[ActivityPoint]])
async def get_activity_heatmap(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:dashboard:view")),
):
    heatmap = dashboard_service.get_activity_heatmap(session)
    return create_success_response(data=heatmap, request=request)

@router.get("/users", response_model=GenericResponse[UserInsights])
async def get_user_insights(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:dashboard:view")),
):
    distribution = dashboard_service.get_user_distribution(session)
    trends = dashboard_service.get_user_registration_trends(session)
    
    return create_success_response(
        data=UserInsights(
            distribution=distribution,
            trends=trends
        ), 
        request=request
    )

@router.get("/registry", response_model=GenericResponse[list[SystemRegistry]])
async def get_system_registry(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("admin:dashboard:view")),
):
    registry = dashboard_service.get_system_registry_counts(session)
    return create_success_response(data=registry, request=request)
