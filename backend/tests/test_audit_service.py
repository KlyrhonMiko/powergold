from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from core.models.audit_log import AuditLog
from systems.admin.services.audit_service import AuditService
from utils.time_utils import format_datetime


def test_log_action_serializes_decimal_datetime_and_uuid_payloads() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    service = AuditService()
    actor_id = uuid4()
    occurred_at = datetime(2026, 5, 18, 17, 17, 39)

    with Session(engine) as session:
        entry = service.log_action(
            db=session,
            entity_type="inventory",
            entity_id="ITEM-000148",
            action="stock_adjustment",
            actor_id=actor_id,
            before={"qty": Decimal("0.000"), "at": occurred_at, "actor": actor_id},
            after={"qty": Decimal("100.125"), "qty_change": Decimal("100.125")},
        )
        session.commit()

        stored = session.exec(
            select(AuditLog).where(AuditLog.id == entry.id)
        ).one()

    assert stored.before_json == {
        "qty": 0,
        "at": format_datetime(occurred_at),
        "actor": str(actor_id),
    }
    assert stored.after_json == {
        "qty": 100.125,
        "qty_change": 100.125,
    }
