from uuid import uuid4

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from systems.admin.models.user import User
from systems.admin.services.audit_service import audit_service
from systems.inventory.models.borrow_request import BorrowRequest
from systems.inventory.models.borrow_request_batch import BorrowRequestBatch
from systems.inventory.models.borrow_request_item import BorrowRequestItem
from systems.inventory.models.borrow_request_unit import BorrowRequestUnit
from systems.inventory.models.inventory import InventoryItem
from systems.inventory.models.inventory_batch import InventoryBatch
from systems.inventory.schemas.borrow_request_schemas import (
    BorrowRequestBatchAssignment,
    BorrowRequestItemAssignmentUpdate,
)
from systems.inventory.services.borrow_request_service import BorrowService
from systems.inventory.services.inventory_service import InventoryService


@pytest.fixture
def session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db_session:
        yield db_session


@pytest.fixture
def services(monkeypatch: pytest.MonkeyPatch) -> tuple[InventoryService, BorrowService]:
    monkeypatch.setattr(audit_service, "log_action", lambda *args, **kwargs: None)
    monkeypatch.setattr(InventoryService, "_require_config_key", lambda *args, **kwargs: None)
    monkeypatch.setattr(InventoryService, "get_item_status", lambda *args, **kwargs: "healthy")
    monkeypatch.setattr(BorrowService, "_require_setting", lambda *args, **kwargs: None)
    monkeypatch.setattr(BorrowService, "_require_borrow_status", lambda *args, **kwargs: None)

    from systems.inventory.services.alert_service import alert_service

    monkeypatch.setattr(alert_service, "evaluate_stock_alerts", lambda *args, **kwargs: None)

    inventory_service = InventoryService()
    borrow_service = BorrowService()
    borrow_service.inventory_service = inventory_service
    return inventory_service, borrow_service


def _create_user() -> User:
    suffix = uuid4().hex[:8]
    return User(
        last_name="Optimizer",
        first_name="Pat",
        email=f"optimizer-{suffix}@example.com",
        username=f"optimizer-{suffix}",
        hashed_password="not-used",
        role="admin",
    )


def _build_approved_mixed_request(
    session: Session,
    inventory_service: InventoryService,
    actor: User,
) -> tuple[BorrowRequest, InventoryItem, list[str], InventoryItem, str]:
    trackable_item = InventoryItem(
        item_id=f"ITEM-{uuid4().hex[:8]}",
        name=f"Trackable {uuid4().hex[:8]}",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    session.add(trackable_item)
    session.flush()

    unit_ids: list[str] = []
    for _ in range(2):
        unit = inventory_service.create_unit(
            session,
            item_id=trackable_item.item_id,
            serial_number=f"SER-{uuid4().hex[:8]}",
            actor_id=actor.id,
        )
        session.flush()
        unit_ids.append(unit.unit_id)

    bulk_item = InventoryItem(
        item_id=f"ITEM-{uuid4().hex[:8]}",
        name=f"Bulk {uuid4().hex[:8]}",
        classification="materials",
        item_type="supply",
        unit_of_measure="roll",
        is_trackable=False,
    )
    session.add(bulk_item)
    session.flush()

    batch = InventoryBatch(
        batch_id=f"BATCH-{uuid4().hex[:8]}",
        inventory_uuid=bulk_item.id,
        total_qty=8,
        available_qty=8,
        status="healthy",
    )
    session.add(batch)
    session.flush()
    inventory_service._sync_item_quantities(session, bulk_item.item_id)
    session.flush()

    request = BorrowRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        borrower_uuid=actor.id,
        transaction_ref=f"TXN-{uuid4().hex[:8]}",
        status="approved",
        approved_by=actor.id,
        approval_channel="standard",
        request_channel="inventory_manager",
    )
    session.add(request)
    session.flush()

    session.add(
        BorrowRequestItem(
            borrow_uuid=request.id,
            item_uuid=trackable_item.id,
            qty_requested=1,
        )
    )
    session.add(
        BorrowRequestItem(
            borrow_uuid=request.id,
            item_uuid=bulk_item.id,
            qty_requested=3,
        )
    )
    session.flush()

    return request, trackable_item, unit_ids, bulk_item, batch.batch_id


def test_get_assignment_options_returns_available_units_and_batches(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, trackable_item, unit_ids, bulk_item, batch_id = _build_approved_mixed_request(
        session,
        inventory_service,
        actor,
    )

    options = borrow_service.get_assignment_options(session, request.request_id)

    assert options.request_id == request.request_id
    assert len(options.items) == 2

    by_item_id = {item.item_id: item for item in options.items}
    assert len(by_item_id[trackable_item.item_id].available_units) == len(unit_ids)
    assert by_item_id[trackable_item.item_id].available_units[0].unit_id in unit_ids

    assert len(by_item_id[bulk_item.item_id].available_batches) == 1
    assert by_item_id[bulk_item.item_id].available_batches[0].batch_id == batch_id
    assert by_item_id[bulk_item.item_id].available_batches[0].available_qty == 8


def test_assign_request_inventory_handles_mixed_item_payload(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, trackable_item, unit_ids, bulk_item, batch_id = _build_approved_mixed_request(
        session,
        inventory_service,
        actor,
    )

    updated_request = borrow_service.assign_request_inventory(
        session,
        request_id=request.request_id,
        assignments=[
            BorrowRequestItemAssignmentUpdate(
                item_id=trackable_item.item_id,
                unit_ids=[unit_ids[0]],
            ),
            BorrowRequestItemAssignmentUpdate(
                item_id=bulk_item.item_id,
                batch_assignments=[
                    BorrowRequestBatchAssignment(
                        batch_id=batch_id,
                        qty=3,
                    )
                ],
            ),
        ],
        actor_id=actor.id,
        note="bulk assignment test",
    )
    session.flush()

    unit_assignments = session.exec(
        select(BorrowRequestUnit).where(BorrowRequestUnit.borrow_uuid == request.id)
    ).all()
    batch_assignments = session.exec(
        select(BorrowRequestBatch).where(BorrowRequestBatch.borrow_uuid == request.id)
    ).all()

    assert updated_request.request_id == request.request_id
    assert len(unit_assignments) == 1
    assert len(batch_assignments) == 1
    assert unit_assignments[0].borrow_uuid == request.id
    assert batch_assignments[0].qty_assigned == 3
