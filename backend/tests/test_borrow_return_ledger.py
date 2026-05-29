from uuid import uuid4
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from systems.admin.models.user import User
from systems.admin.services.audit_service import audit_service
from systems.inventory.models.borrow_request import BorrowRequest
from systems.inventory.models.borrow_request_batch import BorrowRequestBatch
from systems.inventory.models.borrow_request_event import BorrowRequestEvent
from systems.inventory.models.borrow_request_item import BorrowRequestItem
from systems.inventory.models.borrow_request_unit import BorrowRequestUnit
from systems.inventory.models.borrow_participant import BorrowParticipant
from systems.inventory.models.inventory import InventoryItem
from systems.inventory.models.inventory_batch import InventoryBatch
from systems.inventory.models.inventory_movement import InventoryMovement
from systems.inventory.models.inventory_unit import InventoryUnit
from systems.inventory.models.entrusted_item import EntrustedItem
from systems.inventory.schemas.borrow_request_schemas import (
    BorrowRequestCreate,
    BorrowRequestBatchAssignment,
    BorrowRequestBatchReturn,
    BorrowRequestUnitReturn,
)
from systems.inventory.services.borrow_request_service import BorrowService
from systems.inventory.services.inventory_service import InventoryService
from utils.time_utils import get_now_manila


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
        last_name="Tester",
        first_name="Flow",
        email=f"flow-{suffix}@example.com",
        username=f"flow-{suffix}",
        hashed_password="not-used",
        role="admin",
    )


def _build_released_trackable_request(
    session: Session,
    inventory_service: InventoryService,
    actor: User,
) -> tuple[BorrowRequest, InventoryItem, InventoryUnit]:
    item = InventoryItem(
        item_id="ITEM-TRACK-001",
        name="Trackable Drill",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    session.add(item)
    session.flush()

    unit = inventory_service.create_unit(
        session,
        item_id=item.item_id,
        serial_number=f"SER-{uuid4().hex[:8]}",
        actor_id=actor.id,
    )
    session.flush()

    request = BorrowRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        borrower_uuid=actor.id,
        transaction_ref=f"TXN-{uuid4().hex[:8]}",
        status="released",
        released_by=actor.id,
        received_by=actor.id,
        approval_channel="standard",
        request_channel="inventory_manager",
    )
    session.add(request)
    session.flush()

    borrow_item = BorrowRequestItem(
        borrow_uuid=request.id,
        item_uuid=item.id,
        qty_requested=1,
    )
    assignment = BorrowRequestUnit(
        borrow_unit_id=f"BRU-{uuid4().hex[:8]}",
        borrow_uuid=request.id,
        unit_uuid=unit.id,
        assigned_by=actor.id,
        released_by=actor.id,
        approved_by=actor.id,
        released_at=request.created_at,
        condition_on_release=unit.condition,
    )
    session.add(borrow_item)
    session.add(assignment)

    unit.status = "borrowed"
    session.add(unit)
    inventory_service.adjust_stock(
        session,
        item.item_id,
        -1,
        movement_type="borrow_release",
        reference_id=request.request_id,
        reference_type="borrow_request",
        actor_id=actor.id,
        unit_uuid=unit.id,
    )
    session.flush()

    return request, item, unit


def _build_released_multi_item_trackable_request(
    session: Session,
    inventory_service: InventoryService,
    actor: User,
) -> tuple[BorrowRequest, list[InventoryItem], list[InventoryUnit]]:
    items: list[InventoryItem] = []
    units: list[InventoryUnit] = []
    for name in ("Clamp Meter", "Impact Driver"):
        item = InventoryItem(
            item_id=f"ITEM-{uuid4().hex[:8]}",
            name=f"{name} {uuid4().hex[:8]}",
            classification="tools",
            item_type="equipment",
            is_trackable=True,
        )
        session.add(item)
        session.flush()
        unit = inventory_service.create_unit(
            session,
            item_id=item.item_id,
            serial_number=f"SER-{uuid4().hex[:8]}",
            actor_id=actor.id,
        )
        session.flush()
        items.append(item)
        units.append(unit)

    request = BorrowRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        borrower_uuid=actor.id,
        transaction_ref=f"TXN-{uuid4().hex[:8]}",
        status="released",
        approved_by=actor.id,
        released_by=actor.id,
        received_by=actor.id,
        approval_channel="standard",
        request_channel="inventory_manager",
    )
    session.add(request)
    session.flush()

    for item, unit in zip(items, units, strict=True):
        session.add(
            BorrowRequestItem(
                borrow_uuid=request.id,
                item_uuid=item.id,
                qty_requested=1,
            )
        )
        session.add(
            BorrowRequestUnit(
                borrow_unit_id=f"BRU-{uuid4().hex[:8]}",
                borrow_uuid=request.id,
                unit_uuid=unit.id,
                assigned_by=actor.id,
                released_by=actor.id,
                approved_by=actor.id,
                released_at=request.created_at,
                condition_on_release=unit.condition,
            )
        )
        unit.status = "borrowed"
        session.add(unit)
        inventory_service.adjust_stock(
            session,
            item.item_id,
            -1,
            movement_type="borrow_release",
            reference_id=request.request_id,
            reference_type="borrow_request",
            actor_id=actor.id,
            unit_uuid=unit.id,
        )
    session.flush()

    return request, items, units


def _create_non_trackable_item(session: Session) -> InventoryItem:
    item = InventoryItem(
        item_id=f"ITEM-BULK-{uuid4().hex[:8]}",
        name=f"Bulk Cable {uuid4().hex[:8]}",
        classification="materials",
        item_type="supply",
        is_trackable=False,
    )
    session.add(item)
    session.flush()
    return item


def _build_approved_non_trackable_request(
    session: Session,
    actor: User,
    item: InventoryItem,
    qty_requested: int,
) -> BorrowRequest:
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

    borrow_item = BorrowRequestItem(
        borrow_uuid=request.id,
        item_uuid=item.id,
        qty_requested=qty_requested,
    )
    session.add(borrow_item)
    session.flush()
    return request


def _build_released_non_trackable_request(
    session: Session,
    inventory_service: InventoryService,
    actor: User,
    qty_requested: int = 4,
    opening_qty: int = 10,
) -> tuple[BorrowRequest, InventoryItem, InventoryBatch, BorrowRequestBatch]:
    item = _create_non_trackable_item(session)
    batch = InventoryBatch(
        batch_id=f"BATCH-{uuid4().hex[:8]}",
        inventory_uuid=item.id,
        total_qty=opening_qty,
        available_qty=opening_qty,
        status="healthy",
    )
    session.add(batch)
    session.flush()
    inventory_service._sync_item_quantities(session, item.item_id)
    session.flush()

    request = BorrowRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        borrower_uuid=actor.id,
        transaction_ref=f"TXN-{uuid4().hex[:8]}",
        status="released",
        approved_by=actor.id,
        released_by=actor.id,
        received_by=actor.id,
        approval_channel="standard",
        request_channel="inventory_manager",
    )
    session.add(request)
    session.flush()

    borrow_item = BorrowRequestItem(
        borrow_uuid=request.id,
        item_uuid=item.id,
        qty_requested=qty_requested,
    )
    assignment = BorrowRequestBatch(
        borrow_batch_id=f"BRB-{uuid4().hex[:8]}",
        borrow_uuid=request.id,
        batch_uuid=batch.id,
        qty_assigned=qty_requested,
        assigned_by=actor.id,
        released_at=request.created_at,
    )
    session.add(borrow_item)
    session.add(assignment)
    session.flush()

    inventory_service.adjust_stock(
        session,
        item.item_id,
        -qty_requested,
        movement_type="borrow_release",
        reference_id=request.request_id,
        reference_type="borrow_request",
        actor_id=actor.id,
        batch_id=batch.batch_id,
    )
    session.flush()
    session.refresh(item)

    return request, item, batch, assignment


@pytest.mark.parametrize(
    ("condition_on_return", "expected_status", "expected_movement_type", "expected_qty_change", "expected_available_qty"),
    [
        ("poor", "maintenance", "maintenance", 0, 0),
        ("good", "available", "borrow_return", 1, 1),
    ],
)
def test_trackable_return_uses_condition_driven_ledger_behavior(
    session: Session,
    services: tuple[InventoryService, BorrowService],
    condition_on_return: str,
    expected_status: str,
    expected_movement_type: str,
    expected_qty_change: int,
    expected_available_qty: int,
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, item, unit = _build_released_trackable_request(session, inventory_service, actor)

    borrow_service.return_request(
        session,
        request.request_id,
        actor.id,
        unit_returns=[
            BorrowRequestUnitReturn(
                unit_id=unit.unit_id,
                condition_on_return=condition_on_return,
            )
        ],
    )
    session.flush()

    session.refresh(unit)
    session.refresh(request)
    session.refresh(item)

    balances = inventory_service.get_item_balances(session, item)
    movements = list(
        session.exec(
            select(InventoryMovement)
            .where(
                InventoryMovement.reference_id == request.request_id,
                InventoryMovement.unit_uuid == unit.id,
            )
            .order_by(InventoryMovement.occurred_at.asc())
        ).all()
    )

    assert request.status == "returned"
    assert unit.status == expected_status
    assert unit.condition == condition_on_return
    assert balances["available_qty"] == expected_available_qty
    assert item.available_qty == expected_available_qty
    assert [movement.movement_type for movement in movements] == [
        "borrow_release",
        expected_movement_type,
    ]
    assert movements[-1].qty_change == expected_qty_change

    reconciliation = inventory_service.reconcile_movements(session, item.item_id)
    assert reconciliation.is_reconciled is True


def test_adjust_stock_rejects_non_trackable_quantity_change_without_batch(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, _ = services
    item = _create_non_trackable_item(session)

    with pytest.raises(
        ValueError,
        match="requires a batch_id for quantity-changing movements",
    ):
        inventory_service.adjust_stock(
            session,
            item.item_id,
            5,
            movement_type="procurement",
            note="Invalid bulk adjustment without batch",
        )


def test_assign_batches_rejects_duplicate_batch_ids(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    _, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = _create_non_trackable_item(session)
    batch = InventoryBatch(
        batch_id=f"BATCH-{uuid4().hex[:8]}",
        inventory_uuid=item.id,
        total_qty=10,
        available_qty=10,
        status="healthy",
    )
    session.add(batch)
    session.flush()

    request = _build_approved_non_trackable_request(session, actor, item, qty_requested=4)

    with pytest.raises(ValueError, match="batch_id values must be unique"):
        borrow_service.assign_batches(
            session,
            request.request_id,
            [
                BorrowRequestBatchAssignment(batch_id=batch.batch_id, qty=2),
                BorrowRequestBatchAssignment(batch_id=batch.batch_id, qty=2),
            ],
            actor.id,
            item.item_id,
        )


def test_non_trackable_return_requires_released_batch_assignments(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    _, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = _create_non_trackable_item(session)
    request = BorrowRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        borrower_uuid=actor.id,
        transaction_ref=f"TXN-{uuid4().hex[:8]}",
        status="released",
        released_by=actor.id,
        received_by=actor.id,
        approval_channel="standard",
        request_channel="inventory_manager",
    )
    session.add(request)
    session.flush()
    session.add(
        BorrowRequestItem(
            borrow_uuid=request.id,
            item_uuid=item.id,
            qty_requested=3,
        )
    )
    session.flush()

    with pytest.raises(ValueError, match="has no batch assignments to return"):
        borrow_service.return_request(session, request.request_id, actor.id)

    movements = list(
        session.exec(
            select(InventoryMovement).where(InventoryMovement.reference_id == request.request_id)
        ).all()
    )
    assert movements == []


def test_non_trackable_return_restores_batch_available_quantity(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, item, batch, assignment = _build_released_non_trackable_request(
        session,
        inventory_service,
        actor,
    )

    assert batch.available_qty == 6
    assert item.available_qty == 6

    borrow_service.return_request(session, request.request_id, actor.id)
    session.flush()

    session.refresh(batch)
    session.refresh(assignment)
    session.refresh(request)
    session.refresh(item)

    movements = list(
        session.exec(
            select(InventoryMovement)
            .where(
                InventoryMovement.reference_id == request.request_id,
                InventoryMovement.batch_uuid == batch.id,
            )
            .order_by(InventoryMovement.occurred_at.asc())
        ).all()
    )

    balances = inventory_service.get_item_balances(session, item)

    assert request.status == "returned"
    assert assignment.returned_at is not None
    assert batch.available_qty == 10
    assert item.available_qty == 10
    assert balances["available_qty"] == 10
    assert [movement.movement_type for movement in movements] == [
        "borrow_release",
        "borrow_return",
    ]
    assert [movement.qty_change for movement in movements] == [-4, 4]


def test_non_trackable_return_can_restore_partial_batch_quantity(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, item, batch, assignment = _build_released_non_trackable_request(
        session,
        inventory_service,
        actor,
    )

    borrow_service.return_request(
        session,
        request.request_id,
        actor.id,
        batch_returns=[
            BorrowRequestBatchReturn(
                borrow_batch_id=assignment.borrow_batch_id,
                qty_returned=1,
            )
        ],
    )
    session.flush()

    session.refresh(batch)
    session.refresh(assignment)
    session.refresh(request)
    session.refresh(item)

    serialized_assignments = borrow_service.serialize_assigned_batches(session, request)
    balances = inventory_service.get_item_balances(session, item)
    movements = list(
        session.exec(
            select(InventoryMovement)
            .where(
                InventoryMovement.reference_id == request.request_id,
                InventoryMovement.batch_uuid == batch.id,
            )
            .order_by(InventoryMovement.occurred_at.asc())
        ).all()
    )

    assert request.status == "returned"
    assert assignment.returned_at is not None
    assert batch.available_qty == 7
    assert item.available_qty == 7
    assert balances["available_qty"] == 7
    assert [movement.movement_type for movement in movements] == [
        "borrow_release",
        "borrow_return",
    ]
    assert [movement.qty_change for movement in movements] == [-4, 1]
    assert serialized_assignments[0].qty_returned == 1
    assert serialized_assignments[0].qty_not_returned == 3


def test_non_trackable_partial_return_requires_all_batch_assignments_when_payload_present(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = _create_non_trackable_item(session)
    first_batch = InventoryBatch(
        batch_id=f"BATCH-{uuid4().hex[:8]}",
        inventory_uuid=item.id,
        total_qty=5,
        available_qty=5,
        status="healthy",
    )
    second_batch = InventoryBatch(
        batch_id=f"BATCH-{uuid4().hex[:8]}",
        inventory_uuid=item.id,
        total_qty=5,
        available_qty=5,
        status="healthy",
    )
    session.add(first_batch)
    session.add(second_batch)
    session.flush()
    inventory_service._sync_item_quantities(session, item.item_id)
    session.flush()

    request = BorrowRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        borrower_uuid=actor.id,
        transaction_ref=f"TXN-{uuid4().hex[:8]}",
        status="released",
        approved_by=actor.id,
        released_by=actor.id,
        received_by=actor.id,
        approval_channel="standard",
        request_channel="inventory_manager",
    )
    session.add(request)
    session.flush()
    session.add(BorrowRequestItem(borrow_uuid=request.id, item_uuid=item.id, qty_requested=4))
    first_assignment = BorrowRequestBatch(
        borrow_batch_id=f"BRB-{uuid4().hex[:8]}",
        borrow_uuid=request.id,
        batch_uuid=first_batch.id,
        qty_assigned=2,
        assigned_by=actor.id,
        released_at=request.created_at,
    )
    second_assignment = BorrowRequestBatch(
        borrow_batch_id=f"BRB-{uuid4().hex[:8]}",
        borrow_uuid=request.id,
        batch_uuid=second_batch.id,
        qty_assigned=2,
        assigned_by=actor.id,
        released_at=request.created_at,
    )
    session.add(first_assignment)
    session.add(second_assignment)
    session.flush()

    inventory_service.adjust_stock(
        session,
        item.item_id,
        -2,
        movement_type="borrow_release",
        reference_id=request.request_id,
        reference_type="borrow_request",
        actor_id=actor.id,
        batch_id=first_batch.batch_id,
    )
    inventory_service.adjust_stock(
        session,
        item.item_id,
        -2,
        movement_type="borrow_release",
        reference_id=request.request_id,
        reference_type="borrow_request",
        actor_id=actor.id,
        batch_id=second_batch.batch_id,
    )
    session.flush()

    with pytest.raises(ValueError, match="must include all released batch assignments"):
        borrow_service.return_request(
            session,
            request.request_id,
            actor.id,
            batch_returns=[
                BorrowRequestBatchReturn(
                    borrow_batch_id=first_assignment.borrow_batch_id,
                    qty_returned=1,
                )
            ],
        )


def test_reverse_movement_rejects_second_reversal(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, _, batch, _ = _build_released_non_trackable_request(
        session,
        inventory_service,
        actor,
    )
    borrow_service.return_request(session, request.request_id, actor.id)
    session.flush()

    return_movement = session.exec(
        select(InventoryMovement).where(
            InventoryMovement.reference_id == request.request_id,
            InventoryMovement.batch_uuid == batch.id,
            InventoryMovement.movement_type == "borrow_return",
        )
    ).first()
    assert return_movement is not None

    reversal = inventory_service.reverse_movement(
        session,
        return_movement.movement_id,
        reason="Undo incorrect return",
        reason_code="procurement_correction",
        actor_id=actor.id,
    )
    session.flush()

    with pytest.raises(ValueError, match="has already been reversed"):
        inventory_service.reverse_movement(
            session,
            return_movement.movement_id,
            reason="Undo again",
            reason_code="procurement_correction",
            actor_id=actor.id,
        )

    assert reversal.reference_id == return_movement.movement_id


def test_reversing_batch_borrow_return_keeps_total_quantity_intact(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, item, batch, _ = _build_released_non_trackable_request(
        session,
        inventory_service,
        actor,
    )
    borrow_service.return_request(session, request.request_id, actor.id)
    session.flush()

    return_movement = session.exec(
        select(InventoryMovement).where(
            InventoryMovement.reference_id == request.request_id,
            InventoryMovement.batch_uuid == batch.id,
            InventoryMovement.movement_type == "borrow_return",
        )
    ).first()
    assert return_movement is not None

    inventory_service.reverse_movement(
        session,
        return_movement.movement_id,
        reason="Undo incorrect return",
        reason_code="procurement_correction",
        actor_id=actor.id,
    )
    session.flush()

    session.refresh(batch)
    balances = inventory_service.get_item_balances(session, item)

    assert batch.total_qty == 10
    assert batch.available_qty == 6
    assert balances["total_qty"] == 10
    assert balances["available_qty"] == 6


def test_borrowed_unit_does_not_auto_expire_and_can_still_be_returned(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, item, unit = _build_released_trackable_request(session, inventory_service, actor)

    unit.expiration_date = get_now_manila() - timedelta(days=1)
    session.add(unit)
    session.flush()
    session.refresh(unit)

    assert unit.status == "borrowed"

    borrow_service.return_request(
        session,
        request.request_id,
        actor.id,
        unit_returns=[BorrowRequestUnitReturn(unit_id=unit.unit_id, condition_on_return="good")],
    )
    session.flush()
    session.refresh(unit)
    session.refresh(item)

    assert unit.status == "available"
    assert item.available_qty == 1


def test_borrow_request_create_rejects_duplicate_item_ids():
    with pytest.raises(ValueError, match="unique item_id values"):
        BorrowRequestCreate(
            items=[
                {"item_id": "ITEM-001", "qty_requested": 1},
                {"item_id": "ITEM-001", "qty_requested": 2},
            ]
        )


def test_borrow_request_create_rejects_more_than_fifty_unique_items():
    with pytest.raises(ValueError, match="at most 50 unique items"):
        BorrowRequestCreate(
            items=[
                {"item_id": f"ITEM-{index:03d}", "qty_requested": 1}
                for index in range(51)
            ]
        )


def test_returned_request_does_not_block_new_identical_request(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    _, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = InventoryItem(
        item_id=f"ITEM-TRACK-{uuid4().hex[:8]}",
        name=f"Meter {uuid4().hex[:8]}",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    session.add(item)
    session.flush()

    returned_request = BorrowRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        borrower_uuid=actor.id,
        transaction_ref=f"TXN-{uuid4().hex[:8]}",
        status="returned",
        returned_by=actor.id,
        received_by=actor.id,
        approval_channel="standard",
        request_channel="inventory_manager",
    )
    session.add(returned_request)
    session.flush()
    session.add(
        BorrowRequestItem(
            borrow_uuid=returned_request.id,
            item_uuid=item.id,
            qty_requested=2,
        )
    )
    session.flush()

    created_request = borrow_service.create_request(
        session,
        BorrowRequestCreate(items=[{"item_id": item.item_id, "qty_requested": 2}]),
        borrower_id=actor.user_id,
        request_channel="inventory_manager",
        actor_id=actor.id,
    )
    session.flush()

    assert created_request.request_id != returned_request.request_id
    assert created_request.status == "pending"


def test_release_receipt_scopes_serial_numbers_per_trackable_item(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, items, units = _build_released_multi_item_trackable_request(
        session,
        inventory_service,
        actor,
    )

    receipt = borrow_service.generate_release_receipt(session, request.request_id)
    receipt_map = {line.item_id: line.serial_numbers for line in receipt.items}

    assert receipt_map[items[0].item_id] == [units[0].serial_number]
    assert receipt_map[items[1].item_id] == [units[1].serial_number]


def test_release_receipt_includes_partial_untrackable_return_summary(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, item, _, assignment = _build_released_non_trackable_request(
        session,
        inventory_service,
        actor,
    )

    borrow_service.return_request(
        session,
        request.request_id,
        actor.id,
        batch_returns=[
            BorrowRequestBatchReturn(
                borrow_batch_id=assignment.borrow_batch_id,
                qty_returned=2,
            )
        ],
    )
    session.flush()

    receipt = borrow_service.generate_release_receipt(session, request.request_id)
    item_line = next(line for line in receipt.items if line.item_id == item.item_id)

    assert receipt.status == "returned"
    assert item_line.qty_released == 4
    assert item_line.qty_returned == 2
    assert item_line.qty_not_returned == 2
    assert item_line.batch_details == [
        {
            "batch_id": assignment.batch_id,
            "qty_released": 4,
            "qty_returned": 2,
            "qty_not_returned": 2,
        }
    ]


def test_serialize_borrow_request_includes_assigned_units_and_batches(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    track_request, _, track_unit = _build_released_trackable_request(
        session,
        inventory_service,
        actor,
    )
    bulk_request, _, bulk_batch, _ = _build_released_non_trackable_request(
        session,
        inventory_service,
        actor,
    )

    track_read = borrow_service.serialize_borrow_request(session, track_request)
    bulk_read = borrow_service.serialize_borrow_request(session, bulk_request)

    assert [assignment.unit_id for assignment in track_read.assigned_units] == [track_unit.unit_id]
    assert [assignment.batch_id for assignment in bulk_read.assigned_batches] == [bulk_batch.batch_id]


def test_serialize_borrow_request_restores_involved_people_from_participants(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    _, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = InventoryItem(
        item_id=f"ITEM-{uuid4().hex[:8]}",
        name=f"Participant Test {uuid4().hex[:8]}",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    session.add(item)
    session.flush()

    request = borrow_service.create_request(
        session,
        BorrowRequestCreate(
            items=[{"item_id": item.item_id, "qty_requested": 1}],
            involved_people=[{"name": "Witness One", "role": "witness"}],
        ),
        borrower_id=actor.user_id,
        request_channel="inventory_manager",
        actor_id=actor.id,
    )
    session.flush()

    request_read = borrow_service.serialize_borrow_request(session, request)

    assert request_read.involved_people == [
        {
            "user_id": None,
            "name": "Witness One",
            "fullname": "Witness One",
            "role": "witness",
        }
    ]


def test_reconcile_movements_uses_full_history_beyond_first_page(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, _ = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = InventoryItem(
        item_id=f"ITEM-{uuid4().hex[:8]}",
        name=f"Large History Tool {uuid4().hex[:8]}",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    session.add(item)
    session.flush()

    for _ in range(101):
        inventory_service.create_unit(
            session,
            item_id=item.item_id,
            serial_number=f"SER-{uuid4().hex[:8]}",
            actor_id=actor.id,
        )
    session.flush()
    session.refresh(item)

    reconciliation = inventory_service.reconcile_movements(session, item.item_id)

    assert reconciliation.movement_count == 101
    assert reconciliation.ledger_balance == 101
    assert reconciliation.actual_balance == 101
    assert reconciliation.is_reconciled is True


def test_get_all_movements_enriches_borrow_context(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    request, item, _ = _build_released_trackable_request(session, inventory_service, actor)
    request.customer_name = "Ledger Client"
    request.location_name = "Ledger Bay"
    session.add(request)
    session.flush()

    movements, total = inventory_service.get_all_movements(
        session,
        reference_id=request.request_id,
    )

    assert total == 1
    assert movements[0]["movement_type"] == "borrow_release"
    assert movements[0]["borrower_name"] == f"{actor.last_name}, {actor.first_name}"
    assert movements[0]["customer_name"] == "Ledger Client"
    assert movements[0]["location_name"] == "Ledger Bay"
    assert movements[0]["inventory_id"] == item.item_id


def test_expired_available_unit_transitions_to_expired_and_updates_snapshot(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, _ = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = InventoryItem(
        item_id=f"ITEM-{uuid4().hex[:8]}",
        name=f"Expire Test {uuid4().hex[:8]}",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    session.add(item)
    session.flush()

    unit = inventory_service.create_unit(
        session,
        item_id=item.item_id,
        serial_number=f"SER-{uuid4().hex[:8]}",
        actor_id=actor.id,
    )
    session.flush()

    inventory_service.update_unit(
        session,
        unit.unit_id,
        expiration_date=get_now_manila() - timedelta(days=1),
        actor_id=actor.id,
    )
    session.flush()
    session.refresh(unit)
    session.refresh(item)

    assert unit.status == "expired"
    assert item.available_qty == 0


def test_retire_unit_updates_item_snapshot(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, _ = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = InventoryItem(
        item_id=f"ITEM-{uuid4().hex[:8]}",
        name=f"Retire Test {uuid4().hex[:8]}",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    session.add(item)
    session.flush()

    unit = inventory_service.create_unit(
        session,
        item_id=item.item_id,
        serial_number=f"SER-{uuid4().hex[:8]}",
        actor_id=actor.id,
    )
    session.flush()

    inventory_service.retire_unit(session, unit.unit_id, actor_id=actor.id)
    session.flush()
    session.refresh(unit)
    session.refresh(item)

    assert unit.status == "retired"
    assert item.total_qty == 0
    assert item.available_qty == 0


def test_rejected_request_does_not_block_new_identical_request(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    _, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = InventoryItem(
        item_id=f"ITEM-{uuid4().hex[:8]}",
        name=f"Rejected Flow {uuid4().hex[:8]}",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    session.add(item)
    session.flush()

    rejected_request = BorrowRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        borrower_uuid=actor.id,
        transaction_ref=f"TXN-{uuid4().hex[:8]}",
        status="rejected",
        approval_channel="standard",
        request_channel="inventory_manager",
    )
    session.add(rejected_request)
    session.flush()
    session.add(
        BorrowRequestItem(
            borrow_uuid=rejected_request.id,
            item_uuid=item.id,
            qty_requested=2,
        )
    )
    session.flush()

    created_request = borrow_service.create_request(
        session,
        BorrowRequestCreate(items=[{"item_id": item.item_id, "qty_requested": 2}]),
        borrower_id=actor.user_id,
        request_channel="inventory_manager",
        actor_id=actor.id,
    )
    session.flush()

    assert created_request.request_id != rejected_request.request_id
    assert created_request.status == "pending"


def test_void_request_only_allows_approved_requests_and_preserves_request_row(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    trackable_item = InventoryItem(
        item_id=f"ITEM-{uuid4().hex[:8]}",
        name=f"Voidable Camera {uuid4().hex[:8]}",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    bulk_item = _create_non_trackable_item(session)
    session.add(trackable_item)
    session.flush()

    unit = inventory_service.create_unit(
        session,
        item_id=trackable_item.item_id,
        serial_number=f"SER-{uuid4().hex[:8]}",
        actor_id=actor.id,
    )
    session.flush()

    batch = InventoryBatch(
        batch_id=f"BATCH-{uuid4().hex[:8]}",
        inventory_uuid=bulk_item.id,
        total_qty=Decimal("5"),
        available_qty=Decimal("5"),
        status="healthy",
    )
    session.add(batch)
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

    request_item = BorrowRequestItem(
        borrow_uuid=request.id,
        item_uuid=trackable_item.id,
        qty_requested=1,
    )
    bulk_request_item = BorrowRequestItem(
        borrow_uuid=request.id,
        item_uuid=bulk_item.id,
        qty_requested=2,
    )
    participant = BorrowParticipant(
        borrow_uuid=request.id,
        user_uuid=actor.id,
        name="Flow Tester",
        role_in_request="witness",
    )
    unit_assignment = BorrowRequestUnit(
        borrow_unit_id=f"BRU-{uuid4().hex[:8]}",
        borrow_uuid=request.id,
        unit_uuid=unit.id,
        assigned_by=actor.id,
        assigned_at=request.created_at,
    )
    batch_assignment = BorrowRequestBatch(
        borrow_batch_id=f"BRB-{uuid4().hex[:8]}",
        borrow_uuid=request.id,
        batch_uuid=batch.id,
        qty_assigned=2,
        assigned_by=actor.id,
        assigned_at=request.created_at,
    )
    event = BorrowRequestEvent(
        event_id=f"BRE-{uuid4().hex[:8]}",
        borrow_uuid=request.id,
        event_type="approved",
        actor_id=actor.id,
    )
    session.add_all(
        [
            request_item,
            bulk_request_item,
            participant,
            unit_assignment,
            batch_assignment,
            event,
        ]
    )
    session.flush()

    borrow_service.void_request(
        session,
        request.request_id,
        actor_id=actor.id,
        note="Approval entered in error",
    )
    session.flush()

    session.refresh(request)
    session.refresh(request_item)
    session.refresh(bulk_request_item)
    session.refresh(participant)
    session.refresh(unit_assignment)
    session.refresh(batch_assignment)
    session.refresh(event)

    assert request.status == "voided"
    assert request.is_deleted is False
    assert request_item.is_deleted is False
    assert bulk_request_item.is_deleted is False
    assert participant.is_deleted is False
    assert unit_assignment.is_deleted is False
    assert batch_assignment.is_deleted is False
    assert event.is_deleted is False

    void_events = session.exec(
        select(BorrowRequestEvent).where(
            BorrowRequestEvent.borrow_uuid == request.id,
            BorrowRequestEvent.event_type == "voided",
            BorrowRequestEvent.is_deleted.is_(False),
        )
    ).all()
    assert len(void_events) == 1
    assert void_events[0].note == "Approval entered in error"

    pending_request = BorrowRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        borrower_uuid=actor.id,
        transaction_ref=f"TXN-{uuid4().hex[:8]}",
        status="pending",
        request_channel="inventory_manager",
    )
    session.add(pending_request)
    session.flush()

    with pytest.raises(ValueError, match="approved"):
        borrow_service.void_request(session, pending_request.request_id, actor_id=actor.id)


def test_assign_batches_persists_assigned_by_actor(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    _, borrow_service = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = _create_non_trackable_item(session)
    batch = InventoryBatch(
        batch_id=f"BATCH-{uuid4().hex[:8]}",
        inventory_uuid=item.id,
        total_qty=10,
        available_qty=10,
        status="healthy",
    )
    session.add(batch)
    session.flush()

    request = _build_approved_non_trackable_request(session, actor, item, qty_requested=4)

    assignments = borrow_service.assign_batches(
        session,
        request.request_id,
        [BorrowRequestBatchAssignment(batch_id=batch.batch_id, qty=4)],
        actor.id,
        item.item_id,
    )
    session.flush()

    assert assignments[0].assigned_by == actor.id


def test_close_batch_requires_zero_available_qty_and_no_outstanding_releases(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, _ = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = _create_non_trackable_item(session)
    batch = InventoryBatch(
        batch_id=f"BATCH-{uuid4().hex[:8]}",
        inventory_uuid=item.id,
        total_qty=Decimal("4"),
        available_qty=Decimal("2"),
        status="healthy",
    )
    session.add(batch)
    session.flush()

    with pytest.raises(ValueError, match="0 available quantity"):
        inventory_service.close_batch(session, batch.batch_id, actor_id=actor.id)

    batch.available_qty = Decimal("0")
    session.add(batch)
    session.flush()

    request = BorrowRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        borrower_uuid=actor.id,
        transaction_ref=f"TXN-{uuid4().hex[:8]}",
        status="released",
        approved_by=actor.id,
        released_by=actor.id,
        request_channel="inventory_manager",
        approval_channel="standard",
    )
    session.add(request)
    session.flush()

    session.add(
        BorrowRequestBatch(
            borrow_batch_id=f"BRB-{uuid4().hex[:8]}",
            borrow_uuid=request.id,
            batch_uuid=batch.id,
            qty_assigned=2,
            assigned_by=actor.id,
            released_at=request.created_at,
        )
    )
    session.flush()

    with pytest.raises(ValueError, match="outstanding released quantities"):
        inventory_service.close_batch(session, batch.batch_id, actor_id=actor.id)

    session.rollback()


def test_close_batch_soft_deletes_empty_batch_and_hides_it_from_lists(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, _ = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = _create_non_trackable_item(session)
    batch = InventoryBatch(
        batch_id=f"BATCH-{uuid4().hex[:8]}",
        inventory_uuid=item.id,
        total_qty=Decimal("0"),
        available_qty=Decimal("0"),
        status="out_of_stock",
    )
    session.add(batch)
    session.flush()

    inventory_service.close_batch(session, batch.batch_id, actor_id=actor.id)
    session.flush()
    session.refresh(batch)
    session.refresh(item)

    listed_batches, total = inventory_service.get_batches(session, item.item_id)
    assert batch.is_deleted is True
    assert batch.deleted_at is not None
    assert listed_batches == []
    assert total == 0


def test_remove_unit_requires_terminal_status_and_hides_removed_unit_from_lists(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, _ = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = InventoryItem(
        item_id=f"ITEM-{uuid4().hex[:8]}",
        name=f"Removal Rig {uuid4().hex[:8]}",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    session.add(item)
    session.flush()

    active_unit = inventory_service.create_unit(
        session,
        item_id=item.item_id,
        serial_number=f"SER-{uuid4().hex[:8]}",
        actor_id=actor.id,
    )
    removable_unit = inventory_service.create_unit(
        session,
        item_id=item.item_id,
        serial_number=f"SER-{uuid4().hex[:8]}",
        actor_id=actor.id,
    )
    session.flush()

    with pytest.raises(ValueError, match="can only be removed"):
        inventory_service.remove_unit(session, active_unit.unit_id, actor_id=actor.id)

    inventory_service.update_unit(
        session,
        removable_unit.unit_id,
        status="maintenance",
        actor_id=actor.id,
    )
    session.flush()

    inventory_service.remove_unit(session, removable_unit.unit_id, actor_id=actor.id)
    session.flush()
    session.refresh(removable_unit)
    session.refresh(item)

    units, total = inventory_service.get_units_by_status(session, item.item_id)
    assert removable_unit.is_deleted is True
    assert removable_unit.deleted_at is not None
    assert [unit.unit_id for unit in units] == [active_unit.unit_id]
    assert total == 1


def test_borrowed_or_entrusted_unit_cannot_be_edited_until_returned(
    session: Session,
    services: tuple[InventoryService, BorrowService],
):
    inventory_service, _ = services
    actor = _create_user()
    session.add(actor)
    session.flush()

    item = InventoryItem(
        item_id=f"ITEM-{uuid4().hex[:8]}",
        name=f"Entrusted Lock {uuid4().hex[:8]}",
        classification="tools",
        item_type="equipment",
        is_trackable=True,
    )
    session.add(item)
    session.flush()

    unit = inventory_service.create_unit(
        session,
        item_id=item.item_id,
        serial_number=f"SER-{uuid4().hex[:8]}",
        actor_id=actor.id,
    )
    session.flush()

    unit.status = "borrowed"
    session.add(unit)
    session.flush()

    with pytest.raises(ValueError, match="cannot be edited"):
        inventory_service.update_unit(
            session,
            unit.unit_id,
            status="maintenance",
            actor_id=actor.id,
        )

    with pytest.raises(ValueError, match="cannot be edited"):
        inventory_service.update_unit(
            session,
            unit.unit_id,
            condition="fair",
            description="Blocked borrowed metadata update",
            expiration_date=get_now_manila(),
            actor_id=actor.id,
        )

    unit.status = "entrusted"
    session.add(unit)
    session.flush()

    session.add(
        EntrustedItem(
            assignment_id=f"ENT-{uuid4().hex[:8]}",
            unit_uuid=unit.id,
            user_id=actor.id,
            assigned_by=actor.id,
            assigned_at=get_now_manila(),
            notes="Locked for entrustment",
        )
    )
    session.flush()

    with pytest.raises(ValueError, match="cannot be edited"):
        inventory_service.update_unit(
            session,
            unit.unit_id,
            status="maintenance",
            actor_id=actor.id,
        )

    with pytest.raises(ValueError, match="cannot be edited"):
        inventory_service.update_unit(
            session,
            unit.unit_id,
            condition="fair",
            description="Blocked entrusted metadata update",
            expiration_date=get_now_manila(),
            actor_id=actor.id,
        )
