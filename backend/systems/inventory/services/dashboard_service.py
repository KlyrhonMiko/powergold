from sqlalchemy import case
from sqlmodel import Session, select, func
from systems.inventory.models.inventory import InventoryItem
from systems.inventory.models.borrow_request import BorrowRequest
from systems.inventory.models.borrow_request_item import BorrowRequestItem
from pydantic import BaseModel, field_serializer
from typing import Any
from systems.inventory.services.inventory_service import InventoryService
from systems.inventory.quantity import NonNegativeQuantityDecimal, serialize_quantity


class DashboardStats(BaseModel):
    total_equipment: int
    items_borrowed: NonNegativeQuantityDecimal
    active_users: int
    low_stock_items: int

    active_requests: int
    overdue_returns: int
    expiring_items: int  # Conceptually includes both units and batches
    emergency_requests: int
    compliance_followup: int
    
    items_in_maintenance: int
    items_with_poor_condition: int

    @field_serializer("items_borrowed")
    def serialize_items_borrowed(self, value):
        return serialize_quantity(value)


class LowStockItemRead(BaseModel):
    item_id: str
    name: str
    category: str | None = None
    unit_of_measure: str | None = None
    available_qty: NonNegativeQuantityDecimal
    total_qty: NonNegativeQuantityDecimal

    @field_serializer("available_qty", "total_qty")
    def serialize_quantities(self, value):
        return serialize_quantity(value)


class InventoryCategoryBreakdown(BaseModel):
    category: str
    count: int


class InventoryHealthBreakdown(BaseModel):
    item_statuses: list[dict[str, Any]]
    item_conditions: list[dict[str, Any]]
    unit_statuses: list[dict[str, Any]]
    unit_conditions: list[dict[str, Any]]
    batch_statuses: list[dict[str, Any]]
    batch_conditions: list[dict[str, Any]]


class BorrowingTrend(BaseModel):
    date: str
    count: int


class DashboardService:
    def get_stats(self, session: Session) -> DashboardStats:
        from utils.time_utils import get_now_manila
        from systems.inventory.models.inventory_unit import InventoryUnit
        from systems.inventory.models.inventory_batch import InventoryBatch
        from datetime import timedelta

        now = get_now_manila()
        thirty_days_later = now + timedelta(days=30)

        total_equipment = session.exec(
            select(func.count(InventoryItem.id))
            .where(InventoryItem.is_deleted.is_(False))
        ).one()

        items_borrowed = session.exec(
            select(func.sum(BorrowRequestItem.qty_requested))
            .join(BorrowRequest, BorrowRequestItem.borrow_uuid == BorrowRequest.id)
            .where(BorrowRequest.status == "released")
            .where(BorrowRequest.is_deleted.is_(False))
            .where(BorrowRequestItem.is_deleted.is_(False))
        ).one() or 0

        active_users = session.exec(
            select(func.count(func.distinct(BorrowRequest.borrower_uuid)))
            .where(BorrowRequest.status.in_(["approved", "released"]))
            .where(BorrowRequest.is_deleted.is_(False))
        ).one()

        inventory_service = InventoryService()
        active_items = session.exec(
            select(InventoryItem).where(InventoryItem.is_deleted.is_(False))
        ).all()
        low_stock_items = 0
        for item in active_items:
            balances = inventory_service.get_item_balances(session, item)
            if balances["available_qty"] <= 5:
                low_stock_items += 1

        # New metrics
        active_requests = session.exec(
            select(func.count(BorrowRequest.id))
            .where(BorrowRequest.status.in_(["pending", "approved", "released"]))
            .where(BorrowRequest.is_deleted.is_(False))
        ).one()

        overdue_returns = session.exec(
            select(func.count(BorrowRequest.id))
            .where(BorrowRequest.status == "released")
            .where(BorrowRequest.return_at < now)
            .where(BorrowRequest.is_deleted.is_(False))
        ).one()

        # Conceptually includes units near expiry AND items with batches near expiry
        expiring_units_count = session.exec(
            select(func.count(InventoryUnit.id))
            .where(InventoryUnit.expiration_date < thirty_days_later)
            .where(InventoryUnit.status != "retired")
            .where(InventoryUnit.is_deleted.is_(False))
        ).one()

        expiring_batches_count = session.exec(
            select(func.count(func.distinct(InventoryBatch.inventory_uuid)))
            .where(InventoryBatch.expiration_date < thirty_days_later)
            .where(InventoryBatch.is_deleted.is_(False))
        ).one()

        items_in_maintenance = session.exec(
            select(func.count(func.distinct(InventoryUnit.inventory_uuid)))
            .where(InventoryUnit.status == "maintenance")
            .where(InventoryUnit.is_deleted.is_(False))
        ).one()

        items_with_poor_condition = session.exec(
            select(func.count(func.distinct(InventoryUnit.inventory_uuid)))
            .where(InventoryUnit.condition.in_(["poor", "damaged", "needs_repair", "unusable"]))
            .where(InventoryUnit.is_deleted.is_(False))
        ).one()

        emergency_requests = session.exec(
            select(func.count(BorrowRequest.id))
            .where(BorrowRequest.is_emergency.is_(True))
            .where(BorrowRequest.status.in_(["pending", "approved", "released"]))
            .where(BorrowRequest.is_deleted.is_(False))
        ).one()

        compliance_followup = session.exec(
            select(func.count(BorrowRequest.id))
            .where(BorrowRequest.compliance_followup_required.is_(True))
            .where(BorrowRequest.status.in_(["pending", "approved", "released"]))
            .where(BorrowRequest.is_deleted.is_(False))
        ).one()

        return DashboardStats(
            total_equipment=total_equipment,
            items_borrowed=items_borrowed,
            active_users=active_users,
            low_stock_items=low_stock_items,
            active_requests=active_requests,
            overdue_returns=overdue_returns,
            expiring_items=expiring_units_count + expiring_batches_count,
            emergency_requests=emergency_requests,
            compliance_followup=compliance_followup,
            items_in_maintenance=items_in_maintenance,
            items_with_poor_condition=items_with_poor_condition,
        )

    def get_inventory_health_distribution(self, session: Session) -> InventoryHealthBreakdown:
        from systems.inventory.models.inventory_unit import InventoryUnit
        from systems.inventory.models.inventory_batch import InventoryBatch
        inventory_service = InventoryService()

        def get_dist(model, field):
            rows = session.exec(
                select(field, func.count(model.id))
                .where(model.is_deleted.is_(False))
                .group_by(field)
            ).all()
            return [{"label": str(row[0]), "count": int(row[1])} for row in rows]

        item_status_counter: dict[str, int] = {}
        item_condition_counter: dict[str, int] = {}
        active_items = session.exec(select(InventoryItem).where(InventoryItem.is_deleted.is_(False))).all()
        for item in active_items:
            status_label = inventory_service.get_item_status(session, item)
            condition_label = inventory_service.get_item_condition(session, item)
            item_status_counter[status_label] = item_status_counter.get(status_label, 0) + 1
            item_condition_counter[condition_label] = item_condition_counter.get(condition_label, 0) + 1

        return InventoryHealthBreakdown(
            item_statuses=[{"label": k, "count": v} for k, v in item_status_counter.items()],
            item_conditions=[{"label": k, "count": v} for k, v in item_condition_counter.items()],
            unit_statuses=get_dist(InventoryUnit, InventoryUnit.status),
            unit_conditions=get_dist(InventoryUnit, InventoryUnit.condition),
            batch_statuses=get_dist(InventoryBatch, InventoryBatch.status),
            batch_conditions=get_dist(InventoryBatch, InventoryBatch.condition if hasattr(InventoryBatch, 'condition') else InventoryBatch.status),
        )

    def get_borrowing_trends(self, session: Session) -> list[BorrowingTrend]:
        from utils.time_utils import get_now_manila
        from datetime import timedelta

        now = get_now_manila()
        thirty_days_ago = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)

        # SQL Alchemy func.date for SQLite/Postgres compatibility
        date_label = func.date(BorrowRequest.request_date).label("date")
        
        rows = session.exec(
            select(date_label, func.count(BorrowRequest.id))
            .where(BorrowRequest.request_date >= thirty_days_ago)
            .where(BorrowRequest.is_deleted.is_(False))
            .group_by(date_label)
            .order_by(date_label.asc())
        ).all()
        
        return [
            BorrowingTrend(date=str(date), count=count)
            for date, count in rows
        ]

    def get_recent_activity(self, session: Session, limit: int = 5) -> list[BorrowRequest]:
        from sqlalchemy.orm import selectinload

        return session.exec(
            select(BorrowRequest)
            .where(BorrowRequest.is_deleted.is_(False))
            .options(
                selectinload(BorrowRequest.items).selectinload(BorrowRequestItem.inventory_item),
                selectinload(BorrowRequest.events),
            )
            .order_by(BorrowRequest.request_date.desc())
            .limit(limit)
        ).all()

    def get_low_stock_items(self, session: Session, threshold: int = 5) -> list[LowStockItemRead]:
        inventory_service = InventoryService()
        items = session.exec(
            select(InventoryItem)
            .where(InventoryItem.is_deleted.is_(False))
            .order_by(InventoryItem.name.asc())
        ).all()

        low_items: list[tuple[InventoryItem, dict[str, Any]]] = []
        for item in items:
            balances = inventory_service.get_item_balances(session, item)
            if balances["available_qty"] <= threshold:
                low_items.append((item, balances))

        low_items.sort(key=lambda row: row[1]["available_qty"])
        low_items = low_items[:10]

        return [
            LowStockItemRead(
                item_id=i.item_id,
                name=i.name,
                category=i.category,
                unit_of_measure=i.unit_of_measure,
                available_qty=balances["available_qty"],
                total_qty=balances["total_qty"],
            )
            for i, balances in low_items
        ]

    def get_pending_counts(self, session: Session) -> dict[str, int]:
        """Counts of requests in each actionable state."""
        rows = session.exec(
            select(BorrowRequest.status, func.count(BorrowRequest.id))
            .where(BorrowRequest.is_deleted.is_(False))
            .where(BorrowRequest.status.in_(["pending", "approved", "released"]))
            .group_by(BorrowRequest.status)
        ).all()
        return {status: count for status, count in rows}

    def get_inventory_by_category(self, session: Session) -> list[InventoryCategoryBreakdown]:
        label = case(
            (
                (InventoryItem.classification.is_(None)) | (InventoryItem.classification == ""),
                "Uncategorized",
            ),
            else_=InventoryItem.classification,
        )
        rows = session.exec(
            select(label, func.count(InventoryItem.id))
            .where(InventoryItem.is_deleted.is_(False))
            .group_by(label)
            .order_by(func.count(InventoryItem.id).desc())
        ).all()
        return [
            InventoryCategoryBreakdown(category=cat, count=cnt)
            for cat, cnt in rows
        ]
