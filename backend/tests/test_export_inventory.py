import asyncio
import csv
import io
from datetime import datetime

import pytest
from openpyxl import load_workbook
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from systems.admin.models.user import User
from systems.inventory.models.borrow_request import BorrowRequest
from systems.inventory.models.borrow_request_batch import BorrowRequestBatch
from systems.inventory.models.borrow_request_item import BorrowRequestItem
from systems.inventory.models.borrow_request_unit import BorrowRequestUnit
from systems.inventory.models.inventory import InventoryItem
from systems.inventory.models.inventory_batch import InventoryBatch
from systems.inventory.models.inventory_unit import InventoryUnit
from systems.inventory.schemas.import_export_schemas import (
    LedgerMovementsExportFilters,
    LedgerRequestsExportFilters,
)
from systems.inventory.services.export_service import ExportService


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
def export_service() -> ExportService:
    return ExportService()


def _consume_streaming_response(response) -> bytes:
    async def _read() -> bytes:
        chunks: list[bytes] = []
        async for chunk in response.body_iterator:
            if isinstance(chunk, bytes):
                chunks.append(chunk)
            else:
                chunks.append(chunk.encode())
        return b"".join(chunks)

    return asyncio.run(_read())


def _parse_csv_response(response) -> list[list[str]]:
    payload = _consume_streaming_response(response).decode("utf-8")
    return list(csv.reader(io.StringIO(payload)))


def _parse_workbook_response(response):
    payload = _consume_streaming_response(response)
    return load_workbook(io.BytesIO(payload))


def _seed_export_fixture_data(session: Session) -> dict[str, str]:
    released_by = User(
        first_name="Release",
        last_name="Officer",
        email="release@example.com",
        username="release-officer",
        hashed_password="hashed",
        role="staff",
        employee_id="EMP-REL-001",
    )
    returned_by = User(
        first_name="Return",
        last_name="Officer",
        email="return@example.com",
        username="return-officer",
        hashed_password="hashed",
        role="staff",
        employee_id="EMP-RET-001",
    )
    borrower_one = User(
        first_name="John",
        last_name="Doe",
        email="john.doe@example.com",
        username="john-doe",
        hashed_password="hashed",
        role="borrower",
        employee_id="EMP-2025-001",
        user_id="BOR-1001",
    )
    borrower_two = User(
        first_name="Jane",
        last_name="Smith",
        email="jane.smith@example.com",
        username="jane-smith",
        hashed_password="hashed",
        role="borrower",
        employee_id="EMP-2025-002",
        user_id="BOR-1002",
    )
    session.add_all([released_by, returned_by, borrower_one, borrower_two])
    session.flush()

    equipment = InventoryItem(
        item_id="ITEM-TRACK-001",
        name="Tracked Camera",
        category="electronics",
        classification="equipment",
        item_type="device",
        is_trackable=True,
        total_qty=2,
        available_qty=0,
    )
    materials = InventoryItem(
        item_id="ITEM-BULK-001",
        name="Cleaning Solvent",
        category="supplies",
        classification="materials",
        item_type="consumable",
        unit_of_measure="can",
        is_trackable=False,
        total_qty=50,
        available_qty=40,
    )
    session.add_all([equipment, materials])
    session.flush()

    unit_one = InventoryUnit(
        unit_id="UNIT-001",
        inventory_uuid=equipment.id,
        serial_number="SN/001",
        status="borrowed",
        condition="good",
    )
    unit_two = InventoryUnit(
        unit_id="UNIT-002",
        inventory_uuid=equipment.id,
        serial_number="SN-002",
        status="borrowed",
        condition="good",
    )
    batch_one = InventoryBatch(
        batch_id="BATCH-001",
        inventory_uuid=materials.id,
        total_qty=50,
        available_qty=40,
        status="available",
    )
    session.add_all([unit_one, unit_two, batch_one])
    session.flush()

    request_one = BorrowRequest(
        request_id="REQ-001",
        transaction_ref="TXN-001",
        borrower_uuid=borrower_one.id,
        request_date=datetime(2026, 5, 1, 9, 0, 0),
        released_at=datetime(2026, 5, 1, 10, 0, 0),
        released_by=released_by.id,
        returned_at=datetime(2026, 5, 3, 15, 0, 0),
        returned_by=returned_by.id,
        received_by=returned_by.id,
        status="returned",
    )
    request_two = BorrowRequest(
        request_id="REQ-002",
        transaction_ref="TXN-002",
        borrower_uuid=borrower_two.id,
        request_date=datetime(2026, 5, 2, 11, 0, 0),
        released_at=datetime(2026, 5, 2, 12, 0, 0),
        released_by=released_by.id,
        returned_at=datetime(2026, 5, 4, 16, 0, 0),
        returned_by=returned_by.id,
        received_by=returned_by.id,
        status="returned",
    )
    session.add_all([request_one, request_two])
    session.flush()

    session.add_all(
        [
            BorrowRequestItem(borrow_uuid=request_one.id, item_uuid=equipment.id, qty_requested=1),
            BorrowRequestItem(borrow_uuid=request_one.id, item_uuid=materials.id, qty_requested=5),
            BorrowRequestItem(borrow_uuid=request_two.id, item_uuid=equipment.id, qty_requested=1),
        ]
    )
    session.flush()

    session.add_all(
        [
            BorrowRequestUnit(
                borrow_unit_id="BRU-001",
                borrow_uuid=request_one.id,
                unit_uuid=unit_one.id,
                released_by=released_by.id,
                released_at=datetime(2026, 5, 1, 10, 5, 0),
                returned_by=returned_by.id,
                returned_at=datetime(2026, 5, 3, 15, 5, 0),
                condition_on_release="good",
                condition_on_return="fair",
                return_notes="Minor scratches observed",
            ),
            BorrowRequestUnit(
                borrow_unit_id="BRU-002",
                borrow_uuid=request_two.id,
                unit_uuid=unit_two.id,
                released_by=released_by.id,
                released_at=datetime(2026, 5, 2, 12, 5, 0),
                returned_by=returned_by.id,
                returned_at=datetime(2026, 5, 4, 16, 5, 0),
                condition_on_release="excellent",
                condition_on_return="good",
            ),
        ]
    )
    session.add(
        BorrowRequestBatch(
            borrow_batch_id="BRB-001",
            borrow_uuid=request_one.id,
            batch_uuid=batch_one.id,
            qty_assigned=5,
            released_at=datetime(2026, 5, 1, 10, 10, 0),
            returned_at=datetime(2026, 5, 3, 15, 10, 0),
        )
    )
    session.commit()

    return {
        "borrower_one_user_id": borrower_one.user_id,
        "equipment_item_id": equipment.item_id,
        "serial_one": unit_one.serial_number or "",
    }


def test_format_export_date(export_service: ExportService) -> None:
    result = export_service._format_export_date()
    assert result.count("-") == 2
    month, day, year = result.split("-")
    assert len(month) == 2
    assert len(day) == 2
    assert len(year) == 4


def test_make_export_filename(export_service: ExportService) -> None:
    filename = export_service._make_export_filename("borrow_request_report")
    assert filename.startswith("borrow_request_report-")


def test_build_borrower_label_with_user(export_service: ExportService) -> None:
    user_map = {"uuid-1": "John Doe - EMP-2025-001"}
    label = export_service._build_borrower_label(user_map, "uuid-1")
    assert label == "John Doe - EMP-2025-001"


def test_build_borrower_label_with_customer_fallback(export_service: ExportService) -> None:
    user_map: dict[str, str] = {}
    label = export_service._build_borrower_label(user_map, None, "Walk-in Customer")
    assert label == "Walk-in Customer"


def test_sanitize_sheet_title(export_service: ExportService) -> None:
    assert export_service._sanitize_sheet_title("Trackable/Equipments") == "Trackable-Equipments"
    assert export_service._sanitize_sheet_title("SN/001") == "SN-001"


def test_equipment_history_rejects_missing_item_id_v2(
    export_service: ExportService,
    session: Session,
) -> None:
    with pytest.raises(ValueError, match="item_id is required"):
        export_service._export_movements_v2(
            session=session,
            format="csv",
            movement_type=None,
            item_id=None,
            serial_number=None,
            timeline_mode=None,
            anchor_date=None,
            date_from=None,
            date_to=None,
            include_deleted=False,
            include_archived=False,
        )


def test_movement_export_filter_validates_item_id_required() -> None:
    with pytest.raises(ValueError, match="item_id is required"):
        LedgerMovementsExportFilters(format="csv", report_version="v1")


def test_borrow_history_filter_defaults_to_v2() -> None:
    filters = LedgerRequestsExportFilters(format="csv")
    assert filters.report_version == "v2"


def test_movement_export_filter_defaults_to_v2() -> None:
    filters = LedgerMovementsExportFilters(format="csv", item_id="ITEM-001")
    assert filters.report_version == "v2"


def test_borrow_history_filter_allows_specified_borrower() -> None:
    filters = LedgerRequestsExportFilters(format="csv", borrower_id="user-1")
    assert filters.borrower_id == "user-1"


def test_borrow_history_csv_contains_simplified_rows(
    export_service: ExportService,
    session: Session,
) -> None:
    _seed_export_fixture_data(session)

    response = export_service._export_borrow_history_v2(
        session=session,
        format="csv",
        status=None,
        item_id=None,
        borrower_id=None,
        serial_number=None,
        timeline_mode=None,
        anchor_date=None,
        date_from=None,
        date_to=None,
        include_deleted=False,
        include_archived=False,
    )

    rows = _parse_csv_response(response)
    assert rows[0] == [
        "Request Date",
        "Request ID",
        "Borrower's Name + Employee ID",
        "What they Borrowed",
        "Serial/Batch Number",
        "Unit of Measure",
        "Quantity",
        "Returned Quantity",
        "Not Returned Quantity",
        "Return Outcome",
        "Request Status",
        "Due Date",
        "Returned On Time",
        "Released at",
        "Released by",
        "Returned at",
        "Returned by",
    ]
    assert ["05/01/2026", "REQ-001", "John Doe - EMP-2025-001", "Tracked Camera", "SN/001", "", "1", "1", "0", "Fully Returned", "returned", "", "N/A", "2026-05-01 10:05:00", "Release Officer - EMP-REL-001", "2026-05-03 15:05:00", "Return Officer - EMP-RET-001"] in rows[1:]
    assert ["05/01/2026", "REQ-001", "John Doe - EMP-2025-001", "Cleaning Solvent", "BATCH-001", "can", "5", "5", "0", "Fully Returned", "returned", "", "N/A", "2026-05-01 10:10:00", "Release Officer - EMP-REL-001", "2026-05-03 15:10:00", "Return Officer - EMP-RET-001"] in rows[1:]
    assert response.headers["Content-Disposition"].startswith("attachment; filename=borrow_request_report-")


def test_borrow_history_xlsx_groups_by_borrower_when_filter_is_absent(
    export_service: ExportService,
    session: Session,
) -> None:
    _seed_export_fixture_data(session)

    response = export_service._export_borrow_history_v2(
        session=session,
        format="xlsx",
        status=None,
        item_id=None,
        borrower_id=None,
        serial_number=None,
        timeline_mode=None,
        anchor_date=None,
        date_from=None,
        date_to=None,
        include_deleted=False,
        include_archived=False,
    )

    workbook = _parse_workbook_response(response)
    assert sorted(workbook.sheetnames) == ["Jane Smith - EMP-2025-002", "John Doe - EMP-2025-001"]


def test_borrow_history_xlsx_uses_safe_sheet_names_when_borrower_is_specified(
    export_service: ExportService,
    session: Session,
) -> None:
    ids = _seed_export_fixture_data(session)

    response = export_service._export_borrow_history_v2(
        session=session,
        format="xlsx",
        status=None,
        item_id=None,
        borrower_id=ids["borrower_one_user_id"],
        serial_number=None,
        timeline_mode=None,
        anchor_date=None,
        date_from=None,
        date_to=None,
        include_deleted=False,
        include_archived=False,
    )

    workbook = _parse_workbook_response(response)
    assert workbook.sheetnames == ["Trackable-Equipments", "Untrackable-Materials"]


def test_equipment_history_csv_contains_simplified_rows(
    export_service: ExportService,
    session: Session,
) -> None:
    ids = _seed_export_fixture_data(session)

    response = export_service._export_movements_v2(
        session=session,
        format="csv",
        movement_type=None,
        item_id=ids["equipment_item_id"],
        serial_number=None,
        timeline_mode=None,
        anchor_date=None,
        date_from=None,
        date_to=None,
        include_deleted=False,
        include_archived=False,
    )

    rows = _parse_csv_response(response)
    assert rows[0] == [
        "Serial Number",
        "Request ID Reference",
        "Request Date",
        "Who Borrowed",
        "Status on Release",
        "Released at",
        "Returned at",
        "Status on Return",
    ]
    assert ["SN/001", "REQ-001", "05/01/2026", "John Doe - EMP-2025-001", "good", "2026-05-01 10:05:00", "2026-05-03 15:05:00", "fair"] in rows[1:]
    assert response.headers["Content-Disposition"].startswith("attachment; filename=equipment_histry_report-")


def test_equipment_history_xlsx_groups_per_serial_with_safe_sheet_names(
    export_service: ExportService,
    session: Session,
) -> None:
    ids = _seed_export_fixture_data(session)

    response = export_service._export_movements_v2(
        session=session,
        format="xlsx",
        movement_type=None,
        item_id=ids["equipment_item_id"],
        serial_number=None,
        timeline_mode=None,
        anchor_date=None,
        date_from=None,
        date_to=None,
        include_deleted=False,
        include_archived=False,
    )

    workbook = _parse_workbook_response(response)
    assert workbook.sheetnames == ["SN-001", "SN-002"]
