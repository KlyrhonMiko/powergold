from datetime import datetime
from decimal import Decimal
from sqlmodel import Session, select, func, and_
from typing import TYPE_CHECKING, Any, Optional
from uuid import UUID

from core.base_service import BaseService
from systems.admin.models.user import User
from systems.inventory.models.borrow_request import BorrowRequest
from systems.inventory.models.borrow_request_event import BorrowRequestEvent
from systems.inventory.models.borrow_request_item import BorrowRequestItem
from systems.inventory.models.borrow_request_unit import BorrowRequestUnit
from systems.inventory.models.borrow_request_batch import BorrowRequestBatch
from systems.inventory.models.inventory import InventoryItem
from systems.inventory.models.inventory_movement import InventoryMovement
from systems.inventory.schemas.borrow_request_schemas import (
    BorrowRequestBatchRead,
    BorrowRequestBatchReturn,
    BorrowRequestCreate,
    BorrowRequestEventRead,
    BorrowRequestEventGlobalRead,
    BorrowRequestRead,
    BorrowRequestUnitReturn,
    BorrowRequestUpdate,
    BorrowRequestBatchAssignment,
)
from systems.inventory.models.borrow_participant import BorrowParticipant

from systems.inventory.services.inventory_service import InventoryService
from systems.inventory.services.configuration_service import (
    BorrowerConfigService,
    InventoryConfigService,
)
from systems.admin.services.user_service import UserService
from systems.admin.services.audit_service import audit_service
from utils.id_generator import get_next_sequence
from utils.time_utils import get_now_manila, normalize_datetime_to_manila
from systems.inventory.quantity import (
    TRACKABLE_UNIT_QUANTITY,
    ZERO_QUANTITY,
    format_quantity,
    require_whole_quantity,
)

if TYPE_CHECKING:
    from systems.inventory.schemas.borrow_request_schemas import ReleaseReceiptRead

_DEFAULT_STATUSES = [
    "pending",
    "approved",
    "released",
    "returned",
    "rejected",
    "closed",
]

_ACTIVE_BORROW_STATUSES = {"pending", "approved", "released"}


class BorrowService(
    BaseService[BorrowRequest, BorrowRequestCreate, BorrowRequestUpdate]
):
    def __init__(self):
        super().__init__(BorrowRequest, lookup_field="request_id")
        self.inventory_service = InventoryService()
        self.user_service = UserService()
        self.config_service = BorrowerConfigService()
        self.inventory_config_service = InventoryConfigService()

    def _require_setting(
        self,
        session: Session,
        key: str,
        table_name: str,
        field_name: str,
        field_label: str,
    ) -> None:
        """Helper to ensure a configuration setting exists for a given table/field."""
        # Use inventory config service for inventory-related settings
        config_service = (
            self.inventory_config_service
            if table_name.startswith("inventory_")
            else self.config_service
        )

        config_service.require_table_field_key(
            session,
            key=key,
            table_name=table_name,
            field_name=field_name,
            field_label=field_label,
        )

    def _require_borrow_status(self, session: Session, status_key: str) -> None:
        category = self.config_service.category_for("borrow_requests", "status")
        if self.config_service.exists(session, status_key, category):
            return
        raise ValueError(
            f"Invalid borrow request status: '{status_key}'. Missing system setting "
            f"({category}, {status_key})."
        )

    def _get_workflow(self, session: Session) -> list[str]:
        settings = self.config_service.get_by_category(
            session,
            self.config_service.category_for("borrow_requests", "status"),
        )
        if not settings:
            return _DEFAULT_STATUSES
        return [s.key for s in sorted(settings, key=lambda s: int(s.value))]

    def _active_statuses(self, session: Session) -> list[str]:
        workflow = self._get_workflow(session)
        return [status for status in workflow if status in _ACTIVE_BORROW_STATUSES]

    def _has_identical_active_request(
        self,
        session: Session,
        borrower_uuid: UUID,
        new_items: list,
        items_by_id: dict[str, InventoryItem],
    ) -> bool:
        """
        Check if the borrower already has an active request with the exact same
        items and quantities.
        """
        active_requests = session.exec(
            select(BorrowRequest).where(
                BorrowRequest.borrower_uuid == borrower_uuid,
                BorrowRequest.status.in_(self._active_statuses(session)),
                BorrowRequest.is_deleted.is_(False),
            )
        ).all()

        if not active_requests:
            return False

        # Build signature of the new request: set of (item_uuid, qty)
        new_signature = frozenset(
            (items_by_id[item_req.item_id].id, item_req.qty_requested)
            for item_req in new_items
        )

        for req in active_requests:
            # We must fetch the items for each active request
            req_items = session.exec(
                select(BorrowRequestItem).where(
                    BorrowRequestItem.borrow_uuid == req.id,
                    BorrowRequestItem.is_deleted.is_(False),
                )
            ).all()

            existing_signature = frozenset(
                (item.item_uuid, item.qty_requested) for item in req_items
            )

            if existing_signature == new_signature:
                return True

        return False

    def _normalize_compliance_fields(self, data: dict) -> dict:
        payload = {**data}
        is_emergency = bool(payload.get("is_emergency"))
        request_channel = str(payload.get("request_channel") or "inventory_manager")
        payload["request_channel"] = request_channel
        compliance_notes = payload.get("compliance_followup_notes")

        if is_emergency:
            payload["compliance_followup_required"] = True
            if not compliance_notes:
                if request_channel == "borrower_portal":
                    payload["compliance_followup_notes"] = (
                        "Emergency request from portal. Verify condition manually."
                    )
                else:
                    payload["compliance_followup_notes"] = (
                        "Emergency request. Verify condition manually."
                    )
        elif payload.get("compliance_followup_required") and not compliance_notes:
            payload["compliance_followup_notes"] = "Compliance follow-up required."

        return payload

    def _get_user_by_uuid(self, session: Session, user_id: UUID | None) -> User | None:
        if user_id is None:
            return None
        return session.exec(
            select(User).where(User.id == user_id, User.is_deleted.is_(False))
        ).first()

    def _get_item_by_uuid(
        self, session: Session, item_uuid: UUID | None
    ) -> InventoryItem | None:
        if item_uuid is None:
            return None
        return session.exec(
            select(InventoryItem).where(
                InventoryItem.id == item_uuid,
                InventoryItem.is_deleted.is_(False),
            )
        ).first()

    def _build_user_id_map(
        self, session: Session, user_ids: set[UUID | None]
    ) -> dict[UUID, str]:
        clean_ids = [uid for uid in user_ids if uid is not None]
        if not clean_ids:
            return {}

        users = session.exec(
            select(User).where(
                User.is_deleted.is_(False),
                User.id.in_(clean_ids),
            )
        ).all()
        return {user.id: user.user_id for user in users}

    def _build_user_name_map(
        self, session: Session, user_ids: set[UUID | None]
    ) -> dict[UUID, str]:
        clean_ids = [uid for uid in user_ids if uid is not None]
        if not clean_ids:
            return {}

        users = session.exec(
            select(User).where(
                User.is_deleted.is_(False),
                User.id.in_(clean_ids),
            )
        ).all()
        return {
            user.id: f"{user.last_name}, {user.first_name}"
            for user in users
        }

    def _build_item_details_map(
        self, session: Session, item_ids: set[UUID | None]
    ) -> dict[UUID, dict[str, str]]:
        clean_ids = [iid for iid in item_ids if iid is not None]
        if not clean_ids:
            return {}

        items = session.exec(
            select(InventoryItem).where(
                InventoryItem.id.in_(clean_ids),
            )
        ).all()
        return {
            item.id: {
                "item_id": item.item_id,
                "name": item.name,
                "classification": item.classification,
                "item_type": item.item_type,
                "unit_of_measure": item.unit_of_measure,
                "is_trackable": item.is_trackable,
            }
            for item in items
        }

    def get_all(
        self,
        session: Session,
        skip: int = 0,
        limit: int = 100,
        status: str | None = None,
        request_channel: str | None = None,
        is_emergency: bool | None = None,
        borrower_id: str | None = None,
        search: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        returned_on_time: bool | None = None,
        include_archived: bool = False,
        is_archived: Optional[bool] = None,
    ) -> tuple[list[BorrowRequest], int]:
        """Get all borrow requests with optional filters and pagination."""
        needs_user_join = search is not None

        if needs_user_join:
            statement = (
                select(BorrowRequest)
                .outerjoin(User, BorrowRequest.borrower_uuid == User.id)
                .where(BorrowRequest.is_deleted.is_(False))
            )
        else:
            statement = select(BorrowRequest).where(BorrowRequest.is_deleted.is_(False))

        # Apply archival filtering
        if is_archived is not None:
            statement = statement.where(BorrowRequest.is_archived == is_archived)
        elif not include_archived:
            statement = statement.where(BorrowRequest.is_archived.is_(False))

        if status is not None:
            statement = statement.where(BorrowRequest.status == status)
        if request_channel is not None:
            statement = statement.where(BorrowRequest.request_channel == request_channel)
        if is_emergency is not None:
            statement = statement.where(BorrowRequest.is_emergency == is_emergency)
        if returned_on_time is not None:
            statement = statement.where(BorrowRequest.returned_on_time == returned_on_time)
        if date_from is not None:
            statement = statement.where(BorrowRequest.request_date >= date_from)
        if date_to is not None:
            statement = statement.where(BorrowRequest.request_date <= date_to)
        if borrower_id is not None:
            borrower = self.user_service.get(session, borrower_id)
            if not borrower:
                return [], 0
            statement = statement.where(BorrowRequest.borrower_uuid == borrower.id)
        if search is not None:
            term = f"%{search}%"
            borrower_full_name = (User.first_name + " " + User.last_name).label("borrower_full_name")
            borrower_full_name_rev = (User.last_name + ", " + User.first_name).label("borrower_full_name_rev")
            statement = statement.where(
                BorrowRequest.request_id.ilike(term)
                | BorrowRequest.customer_name.ilike(term)
                | BorrowRequest.location_name.ilike(term)
                | User.user_id.ilike(term)
                | User.first_name.ilike(term)
                | User.last_name.ilike(term)
                | borrower_full_name.ilike(term)
                | borrower_full_name_rev.ilike(term)
            )

        count_statement = select(func.count()).select_from(statement.subquery())
        total_count = session.exec(count_statement).one()

        results = session.exec(
            statement.order_by(BorrowRequest.request_date.desc()).offset(skip).limit(limit)
        ).all()
        return list(results), total_count

    def get_by_borrower(
        self,
        session: Session,
        borrower_uuid: UUID,
        skip: int = 0,
        limit: int = 100,
        status: str | None = None,
        is_emergency: bool | None = None,
        search: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> tuple[list[BorrowRequest], int]:
        """Get all requests for a specific borrower with optional filters and pagination."""
        statement = (
            select(BorrowRequest)
            .where(
                BorrowRequest.borrower_uuid == borrower_uuid,
                BorrowRequest.is_deleted.is_(False),
            )
            .order_by(BorrowRequest.request_date.desc())
        )

        if status is not None:
            statement = statement.where(BorrowRequest.status == status)
        if is_emergency is not None:
            statement = statement.where(BorrowRequest.is_emergency == is_emergency)
        if date_from is not None:
            statement = statement.where(BorrowRequest.request_date >= date_from)
        if date_to is not None:
            statement = statement.where(BorrowRequest.request_date <= date_to)
        if search is not None:
            term = f"%{search}%"
            statement = statement.where(
                BorrowRequest.request_id.ilike(term)
                | BorrowRequest.customer_name.ilike(term)
                | BorrowRequest.location_name.ilike(term)
            )

        total_statement = select(func.count()).select_from(statement.subquery())

        total_count = session.exec(total_statement).one()
        items = session.exec(statement.offset(skip).limit(limit)).all()

        return list(items), total_count


    def serialize_borrow_request(
        self, session: Session, borrow_req: BorrowRequest
    ) -> BorrowRequestRead:
        actor_ids = {
            event.actor_id
            for event in (borrow_req.events or [])
            if event.actor_id is not None
        }
        actor_ids.add(borrow_req.borrower_uuid)
        user_id_map = self._build_user_id_map(session, actor_ids)
        borrower_name_map = self._build_user_name_map(session, {borrow_req.borrower_uuid})
        actor_name_map = self._build_user_name_map(session, actor_ids)

        # Get all items for this request
        request_items = []
        item_uuids = set()
        if borrow_req.id:
            request_items = session.exec(
                select(BorrowRequestItem)
                .where(
                    BorrowRequestItem.borrow_uuid == borrow_req.id,
                    BorrowRequestItem.is_deleted.is_(False),
                )
                .order_by(BorrowRequestItem.created_at.asc())
            ).all()
            item_uuids = {item.item_uuid for item in request_items if item.item_uuid}

        item_details_map = self._build_item_details_map(session, item_uuids)
        assigned_units = self._get_borrow_assignments(session, borrow_req)
        assigned_batches: list[BorrowRequestBatch] = []
        participants: list[BorrowParticipant] = []
        if borrow_req.id:
            assigned_batches = list(
                session.exec(
                    select(BorrowRequestBatch)
                    .where(
                        BorrowRequestBatch.borrow_uuid == borrow_req.id,
                        BorrowRequestBatch.is_deleted.is_(False),
                    )
                    .order_by(BorrowRequestBatch.created_at.asc())
                ).all()
            )
            participants = list(
                session.exec(
                    select(BorrowParticipant)
                    .where(
                        BorrowParticipant.borrow_uuid == borrow_req.id,
                        BorrowParticipant.is_deleted.is_(False),
                    )
                    .order_by(BorrowParticipant.created_at.asc())
                ).all()
            )

        participant_user_ids = {
            participant.user_uuid for participant in participants if participant.user_uuid is not None
        }
        participant_user_id_map = self._build_user_id_map(session, participant_user_ids)
        participant_name_map = self._build_user_name_map(session, participant_user_ids)

        payload = borrow_req.model_dump(mode="json")
        payload["borrower_user_id"] = user_id_map.get(borrow_req.borrower_uuid)
        payload["borrower_name"] = borrower_name_map.get(borrow_req.borrower_uuid)
        payload["closed_by_user_id"] = user_id_map.get(borrow_req.closed_by)

        # Populate items list
        payload_items = []
        for item in request_items:
            item_details = item_details_map.get(item.item_uuid, {})
            fallback_item_id = str(item.item_uuid) if item.item_uuid else "UNKNOWN-ITEM"
            payload_items.append(
                {
                    "item_id": item_details.get("item_id") or fallback_item_id,
                    "name": item_details.get("name") or "Deleted Inventory Item",
                    "classification": item_details.get("classification"),
                    "item_type": item_details.get("item_type"),
                    "is_trackable": item_details.get("is_trackable", False),
                    "qty_requested": item.qty_requested,
                }
            )
        payload["items"] = payload_items

        # Remove legacy fields from payload
        payload.pop("item_id", None)
        payload.pop("qty_requested", None)

        payload["events"] = [
            {
                **event.model_dump(mode="json"),
                "actor_user_id": user_id_map.get(event.actor_id),
                "actor_name": actor_name_map.get(event.actor_id, "System"),
            }
            for event in (borrow_req.events or [])
        ]
        payload["assigned_units"] = [
            {
                **assignment.model_dump(mode="json"),
                "unit_id": assignment.unit_id,
                "serial_number": assignment.serial_number,
            }
            for assignment in assigned_units
        ]
        payload["assigned_batches"] = self.serialize_assigned_batches(
            session, borrow_req, assigned_batches=assigned_batches
        )
        payload["involved_people"] = [
            {
                "user_id": participant_user_id_map.get(participant.user_uuid),
                "name": participant.name,
                "fullname": participant_name_map.get(participant.user_uuid) or participant.name,
                "role": participant.role_in_request,
            }
            for participant in participants
        ] or None
        return BorrowRequestRead.model_validate(payload)

    def _build_batch_return_qty_map(
        self,
        session: Session,
        request_id: str,
        assigned_batches: list[BorrowRequestBatch],
    ) -> dict[UUID, Decimal]:
        batch_uuids = [assignment.batch_uuid for assignment in assigned_batches if assignment.batch_uuid]
        if not batch_uuids:
            return {}

        return_movements = list(
            session.exec(
                select(InventoryMovement)
                .where(
                    InventoryMovement.reference_id == request_id,
                    InventoryMovement.movement_type == "borrow_return",
                    InventoryMovement.batch_uuid.in_(batch_uuids),
                )
                .order_by(InventoryMovement.occurred_at.asc())
            ).all()
        )
        if not return_movements:
            return {}

        reversed_movement_ids = {
            movement.reference_id
            for movement in session.exec(
                select(InventoryMovement).where(
                    InventoryMovement.movement_type == "reversal",
                    InventoryMovement.reference_id.in_(
                        [movement.movement_id for movement in return_movements]
                    ),
                )
            ).all()
            if movement.reference_id
        }

        qty_by_batch: dict[UUID, Decimal] = {}
        for movement in return_movements:
            if movement.movement_id in reversed_movement_ids or movement.batch_uuid is None:
                continue
            qty_by_batch[movement.batch_uuid] = (
                qty_by_batch.get(movement.batch_uuid, ZERO_QUANTITY)
                + max(movement.qty_change, ZERO_QUANTITY)
            )
        return qty_by_batch

    def serialize_assigned_batches(
        self,
        session: Session,
        borrow_req: BorrowRequest,
        assigned_batches: list[BorrowRequestBatch] | None = None,
    ) -> list[BorrowRequestBatchRead]:
        if assigned_batches is None:
            if not borrow_req.id:
                return []
            assigned_batches = list(
                session.exec(
                    select(BorrowRequestBatch)
                    .where(
                        BorrowRequestBatch.borrow_uuid == borrow_req.id,
                        BorrowRequestBatch.is_deleted.is_(False),
                    )
                    .order_by(BorrowRequestBatch.created_at.asc())
                ).all()
            )

        item_uuids = {
            assignment.inventory_batch.inventory_uuid
            for assignment in assigned_batches
            if assignment.inventory_batch is not None
        }
        item_details_map = self._build_item_details_map(session, item_uuids)
        qty_returned_map = self._build_batch_return_qty_map(
            session, borrow_req.request_id, assigned_batches
        )

        return [
            BorrowRequestBatchRead.model_validate(
                {
                    **assignment.model_dump(),
                    "batch_id": assignment.batch_id,
                    "item_id": item_details_map.get(
                        assignment.inventory_batch.inventory_uuid, {}
                    ).get("item_id")
                    if assignment.inventory_batch
                    else None,
                    "item_name": item_details_map.get(
                        assignment.inventory_batch.inventory_uuid, {}
                    ).get("name")
                    if assignment.inventory_batch
                    else None,
                    "unit_of_measure": item_details_map.get(
                        assignment.inventory_batch.inventory_uuid, {}
                    ).get("unit_of_measure")
                    if assignment.inventory_batch
                    else None,
                    "qty_returned": qty_returned_map.get(
                        assignment.batch_uuid,
                        assignment.qty_assigned if assignment.returned_at is not None else ZERO_QUANTITY,
                    ),
                    "qty_not_returned": max(
                        assignment.qty_assigned
                        - qty_returned_map.get(
                            assignment.batch_uuid,
                            assignment.qty_assigned if assignment.returned_at is not None else ZERO_QUANTITY,
                        ),
                        ZERO_QUANTITY,
                    ),
                }
            )
            for assignment in assigned_batches
        ]

    @staticmethod
    def _parse_receipt_datetime(value: object) -> datetime | None:
        if value in (None, ""):
            return None

        if isinstance(value, datetime):
            return normalize_datetime_to_manila(value)

        if isinstance(value, str):
            candidate = value.strip()
            if not candidate:
                return None

            try:
                iso_candidate = candidate.replace("Z", "+00:00")
                return normalize_datetime_to_manila(datetime.fromisoformat(iso_candidate))
            except ValueError:
                pass

            for pattern in (
                "%m/%d/%Y - %I:%M:%S %p",
                "%m/%d/%Y - %H:%M:%S",
                "%d/%m/%Y - %I:%M:%S %p",
                "%d/%m/%Y - %H:%M:%S",
                "%Y-%m-%d - %I:%M:%S %p",
                "%Y-%m-%d - %H:%M:%S",
            ):
                try:
                    return normalize_datetime_to_manila(datetime.strptime(candidate, pattern))
                except ValueError:
                    continue

        return None

    def _hydrate_release_receipt_snapshot(
        self,
        snapshot: dict[str, Any],
        db_request: BorrowRequest,
    ) -> "ReleaseReceiptRead":
        from systems.inventory.schemas.borrow_request_schemas import ReleaseReceiptRead

        normalized_snapshot = {**snapshot}

        raw_released_at = normalized_snapshot.get("released_at")
        parsed_released_at = self._parse_receipt_datetime(raw_released_at)
        if parsed_released_at is not None:
            normalized_snapshot["released_at"] = parsed_released_at
        elif raw_released_at in (None, ""):
            normalized_snapshot["released_at"] = None
        else:
            normalized_snapshot["released_at"] = db_request.released_at

        raw_expected_return_at = normalized_snapshot.get("expected_return_at")
        parsed_expected_return_at = self._parse_receipt_datetime(raw_expected_return_at)
        if parsed_expected_return_at is not None:
            normalized_snapshot["expected_return_at"] = parsed_expected_return_at
        elif raw_expected_return_at in (None, ""):
            normalized_snapshot["expected_return_at"] = None
        else:
            normalized_snapshot["expected_return_at"] = db_request.return_at

        normalized_snapshot["items"] = normalized_snapshot.get("items") or []

        return ReleaseReceiptRead.model_validate(normalized_snapshot)

    @staticmethod
    def _build_release_receipt_snapshot(receipt: "ReleaseReceiptRead") -> dict[str, Any]:
        snapshot = receipt.model_dump(mode="json")
        snapshot["released_at"] = (
            receipt.released_at.isoformat() if receipt.released_at else None
        )
        snapshot["expected_return_at"] = (
            receipt.expected_return_at.isoformat() if receipt.expected_return_at else None
        )
        snapshot["returned_at"] = (
            receipt.returned_at.isoformat() if receipt.returned_at else None
        )
        return snapshot

    @staticmethod
    def _merge_receipt_snapshot_with_live_receipt(
        snapshot_receipt: "ReleaseReceiptRead",
        live_receipt: "ReleaseReceiptRead",
    ) -> "ReleaseReceiptRead":
        return live_receipt.model_copy(
            update={
                "transaction_ref": snapshot_receipt.transaction_ref,
                "receipt_number": snapshot_receipt.receipt_number,
                "borrower_name": snapshot_receipt.borrower_name,
                "borrower_user_id": snapshot_receipt.borrower_user_id,
                "customer_name": snapshot_receipt.customer_name,
                "location_name": snapshot_receipt.location_name,
                "released_at": snapshot_receipt.released_at,
                "released_by_name": snapshot_receipt.released_by_name,
                "expected_return_at": snapshot_receipt.expected_return_at,
                "is_emergency": snapshot_receipt.is_emergency,
                "approval_channel": snapshot_receipt.approval_channel,
                "notes": snapshot_receipt.notes,
                "borrower_signature": snapshot_receipt.borrower_signature,
            }
        )

    def generate_release_receipt(
        self, session: Session, request_id: str
    ) -> "ReleaseReceiptRead":
        from systems.inventory.schemas.borrow_request_schemas import (
            ReleaseReceiptRead,
            ReleaseReceiptItemRead,
        )

        db_request = self.get(session, request_id)
        if not db_request:
            raise ValueError("Request not found")

        if db_request.status not in ("released", "returned", "closed"):
            raise ValueError("Receipt is only available for released requests")

        user_id_map = self._build_user_id_map(
            session,
            {
                db_request.borrower_uuid,
                db_request.released_by,
                db_request.returned_by,
                db_request.received_by,
            },
        )
        user_name_map = self._build_user_name_map(
            session,
            {
                db_request.borrower_uuid,
                db_request.released_by,
                db_request.returned_by,
                db_request.received_by,
            },
        )

        request_items = session.exec(
            select(BorrowRequestItem)
            .where(
                BorrowRequestItem.borrow_uuid == db_request.id,
                BorrowRequestItem.is_deleted.is_(False),
            )
            .order_by(BorrowRequestItem.created_at.asc())
        ).all()

        item_uuids = {item.item_uuid for item in request_items if item.item_uuid}
        item_details_map = self._build_item_details_map(session, item_uuids)

        receipt_items = []
        request_units = []
        serialized_batch_assignments = self.serialize_assigned_batches(session, db_request)
        if any(details.get("is_trackable") for details in item_details_map.values()):
            request_units = session.exec(
                select(BorrowRequestUnit).where(
                    BorrowRequestUnit.borrow_uuid == db_request.id,
                    BorrowRequestUnit.is_deleted.is_(False),
                )
            ).all()

        for borrow_item in request_items:
            details = item_details_map.get(borrow_item.item_uuid, {})
            serial_numbers = []
            qty_returned = ZERO_QUANTITY
            qty_not_returned = borrow_item.qty_requested
            batch_details: list[dict[str, Any]] = []
            if details.get("is_trackable"):
                matching_units = [
                    u
                    for u in request_units
                    if u.inventory_unit
                    and u.inventory_unit.inventory_uuid == borrow_item.item_uuid
                ]
                serial_numbers = [
                    u.inventory_unit.serial_number
                    for u in matching_units
                    if u.inventory_unit and u.inventory_unit.serial_number
                ]
                qty_returned = TRACKABLE_UNIT_QUANTITY * sum(
                    1 for u in matching_units if u.returned_at is not None
                )
                qty_not_returned = max(
                    borrow_item.qty_requested - qty_returned,
                    ZERO_QUANTITY,
                )
            else:
                batch_details = [
                    {
                        "batch_id": assignment.batch_id,
                        "qty_released": assignment.qty_assigned,
                        "qty_returned": assignment.qty_returned,
                        "qty_not_returned": assignment.qty_not_returned,
                    }
                    for assignment in serialized_batch_assignments
                    if assignment.item_id == details.get("item_id")
                ]
                qty_returned = sum(
                    (detail["qty_returned"] for detail in batch_details),
                    ZERO_QUANTITY,
                )
                qty_not_returned = sum(
                    (detail["qty_not_returned"] for detail in batch_details),
                    ZERO_QUANTITY,
                )

            receipt_items.append(
                ReleaseReceiptItemRead(
                    item_id=details.get("item_id", ""),
                    name=details.get("name", ""),
                    classification=details.get("classification"),
                    unit_of_measure=details.get("unit_of_measure"),
                    is_trackable=details.get("is_trackable", False),
                    qty_released=borrow_item.qty_requested,
                    qty_returned=qty_returned,
                    qty_not_returned=qty_not_returned,
                    serial_numbers=serial_numbers,
                    batch_details=batch_details,
                )
            )

        live_receipt = ReleaseReceiptRead(
            request_id=db_request.request_id,
            transaction_ref=db_request.transaction_ref,
            receipt_number=f"RCT-{db_request.request_id}",
            status=db_request.status,
            borrower_name=user_name_map.get(db_request.borrower_uuid),
            borrower_user_id=user_id_map.get(db_request.borrower_uuid),
            customer_name=db_request.customer_name,
            location_name=db_request.location_name,
            released_at=db_request.released_at,
            released_by_name=user_name_map.get(db_request.released_by),
            expected_return_at=db_request.return_at,
            returned_at=db_request.returned_at,
            returned_by_name=user_name_map.get(db_request.received_by or db_request.returned_by),
            is_emergency=db_request.is_emergency or False,
            approval_channel=db_request.approval_channel or "standard",
            notes=db_request.notes,
            items=receipt_items,
            borrower_signature=db_request.borrower_signature,
        )
        if db_request.receipt_snapshot:
            snapshot_receipt = self._hydrate_release_receipt_snapshot(
                db_request.receipt_snapshot,
                db_request,
            )
            return self._merge_receipt_snapshot_with_live_receipt(
                snapshot_receipt,
                live_receipt,
            )
        return live_receipt

    def save_signature(
        self, session: Session, request_id: str, signature_data: str
    ) -> BorrowRequest:
        db_request = self.get(session, request_id)
        if not db_request:
            raise ValueError("Request not found")

        db_request.borrower_signature = signature_data

        # Capture snapshot of the receipt with the signature
        receipt = self.generate_release_receipt(session, request_id)
        db_request.receipt_snapshot = self._build_release_receipt_snapshot(receipt)

        session.add(db_request)
        return db_request

    def serialize_borrow_requests(
        self,
        session: Session,
        borrow_requests: list[BorrowRequest],
    ) -> list[BorrowRequestRead]:
        return [
            self.serialize_borrow_request(session, request)
            for request in borrow_requests
        ]

    def serialize_borrow_events(
        self,
        session: Session,
        events: list[BorrowRequestEvent],
    ) -> list[BorrowRequestEventRead]:
        actor_ids = {event.actor_id for event in events if event.actor_id is not None}
        user_id_map = self._build_user_id_map(session, actor_ids)

        # Build map for actor_name
        user_name_map = {}
        if actor_ids:
            users = session.exec(select(User).where(User.id.in_(actor_ids))).all()
            user_name_map = {u.id: f"{u.last_name}, {u.first_name}" for u in users}

        return [
            BorrowRequestEventRead.model_validate(
                {
                    **event.model_dump(mode="json"),
                    "actor_user_id": user_id_map.get(event.actor_id),
                    "actor_name": user_name_map.get(event.actor_id, "System"),
                }
            )
            for event in events
        ]

    def serialize_global_events(
        self,
        session: Session,
        events: list[tuple[BorrowRequestEvent, str, str | None]],
    ) -> list[BorrowRequestEventGlobalRead]:
        actor_ids = {event.actor_id for event, _, _ in events if event.actor_id is not None}
        user_id_map = self._build_user_id_map(session, actor_ids)
        return [
            BorrowRequestEventGlobalRead.model_validate(
                {
                    **event.model_dump(mode="json"),
                    "actor_user_id": user_id_map.get(event.actor_id),
                    "actor_name": actor_full_name or "System",
                    "request_id": request_id,
                }
            )
            for event, request_id, actor_full_name in events
        ]

    def get_all_events(
        self,
        session: Session,
        page: int = 1,
        per_page: int = 20,
        event_type: str | None = None,
        request_id: str | None = None,
        actor_name: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> tuple[list[tuple[BorrowRequestEvent, str, str | None]], int]:
        # Concatenate first_name and last_name for join and search
        full_name_col = (User.last_name + ", " + User.first_name).label("actor_full_name")

        statement = (
            select(BorrowRequestEvent, BorrowRequest.request_id, full_name_col)
            .join(BorrowRequest, BorrowRequestEvent.borrow_uuid == BorrowRequest.id)
            .outerjoin(User, BorrowRequestEvent.actor_id == User.id)
            .order_by(BorrowRequestEvent.occurred_at.desc())
        )

        filters = []
        if event_type:
            filters.append(BorrowRequestEvent.event_type == event_type)
        if request_id:
            filters.append(BorrowRequest.request_id.ilike(f"%{request_id}%"))
        if actor_name:
            filters.append(full_name_col.ilike(f"%{actor_name}%"))
        if date_from:
            filters.append(BorrowRequestEvent.occurred_at >= date_from)
        if date_to:
            filters.append(BorrowRequestEvent.occurred_at <= date_to)

        if filters:
            statement = statement.where(and_(*filters))

        # Count total
        count_statement = (
            select(func.count())
            .select_from(BorrowRequestEvent)
            .join(BorrowRequest, BorrowRequestEvent.borrow_uuid == BorrowRequest.id)
        )
        if actor_name:
            count_statement = count_statement.outerjoin(
                User, BorrowRequestEvent.actor_id == User.id
            )

        if filters:
            count_statement = count_statement.where(and_(*filters))
        total = session.exec(count_statement).one()

        # Pagination
        statement = statement.offset((page - 1) * per_page).limit(per_page)
        results = session.exec(statement).all()

        return results, total

    def _get_borrow_assignments(
        self, session: Session, borrow_request: BorrowRequest
    ) -> list[BorrowRequestUnit]:
        if borrow_request.id is None:
            return []
        assignment_filter = BorrowRequestUnit.borrow_uuid == borrow_request.id

        return list(
            session.exec(
                select(BorrowRequestUnit)
                .where(
                    assignment_filter,
                    BorrowRequestUnit.is_deleted.is_(False),
                )
                .order_by(BorrowRequestUnit.created_at.asc())
            ).all()
        )

    def _validate_trackable_assignment_prerequisites(
        self,
        session: Session,
        db_request: BorrowRequest,
        borrow_item: BorrowRequestItem,
    ) -> list[BorrowRequestUnit]:
        item = borrow_item.inventory_item
        if not item.is_trackable:
            return []

        # Filter assignments that belong to this specific item
        assignments = [
            a
            for a in self._get_borrow_assignments(session, db_request)
            if a.inventory_unit and a.inventory_unit.inventory_uuid == item.id
        ]

        requested_qty = require_whole_quantity(
            borrow_item.qty_requested,
            field_name=f"qty_requested for trackable item '{item.item_id}'",
        )

        if len(assignments) != requested_qty:
            raise ValueError(
                f"Trackable item '{item.item_id}' requires exactly {format_quantity(requested_qty)} assigned units before release, but found {len(assignments)}"
            )

        return assignments

    def _validate_batch_assignment_prerequisites(
        self,
        session: Session,
        db_request: BorrowRequest,
        borrow_item: BorrowRequestItem,
    ) -> list[BorrowRequestBatch]:
        """Ensures that non-trackable items have all requested quantity assigned to batches."""
        item = borrow_item.inventory_item
        if item.is_trackable:
            return []

        # Filter assignments that belong to this specific item
        assignments = [
            a
            for a in db_request.assigned_batches
            if a.inventory_batch and a.inventory_batch.inventory_uuid == item.id
        ]

        total_assigned = sum((a.qty_assigned for a in assignments), ZERO_QUANTITY)

        if total_assigned != borrow_item.qty_requested:
            raise ValueError(
                f"Non-trackable item '{item.item_id}' requires {format_quantity(borrow_item.qty_requested)} assigned units before release, but found {format_quantity(total_assigned)} assigned in batches."
            )

        return assignments



    def get_assigned_units(
        self, session: Session, request_id: str
    ) -> list[BorrowRequestUnit]:
        db_request = self.get(session, request_id)
        if not db_request:
            return []
        return self._get_borrow_assignments(session, db_request)

    def assign_units(
        self,
        session: Session,
        request_id: str,
        unit_ids: list[str],
        actor_id: UUID,
        item_id: str | None = None,
        note: str | None = None,
    ) -> list[BorrowRequestUnit]:
        db_request = self.get(session, request_id)
        if not db_request:
            raise ValueError("Request not found")

        if db_request.status != "approved":
            raise ValueError("Units can only be assigned when request is approved")

        self._require_setting(
            session,
            key="units_assigned",
            table_name="borrow_request_events",
            field_name="event_type",
            field_label="borrow request event type",
        )

        normalized_unit_ids = [
            unit_id.strip() for unit_id in unit_ids if unit_id and unit_id.strip()
        ]
        if not normalized_unit_ids:
            return []
        if len(normalized_unit_ids) != len(unit_ids):
            raise ValueError("unit_ids must not contain empty values")
        if len(set(normalized_unit_ids)) != len(normalized_unit_ids):
            raise ValueError("unit_ids must be unique")

        # Determine which item we are assigning to
        item_uuid = None
        if item_id:
            # Look up item by item_id string (e.g. 'ITEM-001')
            item_obj = self.inventory_service.get(session, item_id)
            if not item_obj:
                raise ValueError(f"Item {item_id} not found")
            item_uuid = item_obj.id
        else:
            # Fallback: Infer from first unit
            first_unit = self.inventory_service.get_unit(session, normalized_unit_ids[0])
            if not first_unit:
                raise ValueError(f"Unit {normalized_unit_ids[0]} not found")
            item_uuid = first_unit.inventory_uuid

        borrow_item = next(
            (i for i in db_request.items if i.item_uuid == item_uuid), None
        )
        if not borrow_item:
            raise ValueError(
                f"Item {item_id or 'shared by units'} is not part of this borrow request"
            )

        item = borrow_item.inventory_item
        if not item.is_trackable:
            raise ValueError("Unit assignment is only applicable to trackable items")

        requested_qty = require_whole_quantity(
            borrow_item.qty_requested,
            field_name=f"qty_requested for trackable item '{item.item_id}'",
        )

        if len(normalized_unit_ids) != requested_qty:
            raise ValueError(
                f"Expected {format_quantity(requested_qty)} units for item {item.item_id}, got {len(normalized_unit_ids)}"
            )

        # Clear existing assignments for THIS item to support reassignment
        existing_assignments = [
            a
            for a in self._get_borrow_assignments(session, db_request)
            if a.inventory_unit and a.inventory_unit.inventory_uuid == item_uuid
        ]
        is_reassign = len(existing_assignments) > 0
        for a in existing_assignments:
            session.delete(a)

        borrower = self._get_user_by_uuid(session, db_request.borrower_uuid)
        now = get_now_manila()
        created_assignments: list[BorrowRequestUnit] = []

        for unit_id in normalized_unit_ids:
            unit = self.inventory_service.get_unit(session, unit_id)
            if not unit:
                raise ValueError(f"Unit {unit_id} not found")

            if unit.inventory_uuid != item_uuid:
                raise ValueError(
                    f"Unit {unit_id} does not belong to item {item.item_id}"
                )
            if unit.status != "available":
                # Special check: If we're reassigning, we should ensure the newly selected units are available.
                # However, what if we're reselecting the SAME units? (unlikely but possible in some UIs)
                raise ValueError(f"Unit {unit_id} is not available for assignment")

            assignment = BorrowRequestUnit(
                borrow_unit_id=get_next_sequence(
                    session, BorrowRequestUnit, "borrow_unit_id", "BRU"
                ),
                borrow_uuid=db_request.id,
                unit_uuid=unit.id,
                requested_at=db_request.request_date,
                approved_at=db_request.approved_at,
                assigned_at=now,
                requested_by=borrower.id if borrower else None,
                approved_by=db_request.approved_by,
                assigned_by=actor_id,
            )
            session.add(assignment)
            created_assignments.append(assignment)

        event = BorrowRequestEvent(
            event_id=get_next_sequence(session, BorrowRequestEvent, "event_id", "BRE"),
            borrow_uuid=db_request.id,
            event_type="units_assigned",
            actor_id=actor_id,
            note=f"{'Re-assigned' if is_reassign else 'Assigned'} units for item {item.item_id}. {note or ''}",
        )
        session.add(event)

        audit_service.log_action(
            db=session,
            entity_type="borrow",
            entity_id=db_request.request_id,
            action="assign_units",
            after={
                "request_id": db_request.request_id,
                "unit_ids": normalized_unit_ids,
            },
            actor_id=actor_id,
        )

        session.flush()
        for assignment in created_assignments:
            session.refresh(assignment, ["inventory_unit"])
        return created_assignments

    def assign_batches(
        self,
        session: Session,
        request_id: str,
        batch_assignments: list[BorrowRequestBatchAssignment],
        actor_id: UUID,
        item_id: str,
        note: str | None = None,
    ) -> list[BorrowRequestBatch]:
        """Assign specific inventory batches and quantities to a borrow request item."""
        db_request = self.get(session, request_id)
        if not db_request:
            raise ValueError("Request not found")

        if db_request.status != "approved":
            raise ValueError("Batches can only be assigned when request is approved")

        self._require_setting(
            session,
            key="units_assigned",
            table_name="borrow_request_events",
            field_name="event_type",
            field_label="borrow request event type",
        )

        # Look up item
        item_obj = self.inventory_service.get(session, item_id)
        if not item_obj:
            raise ValueError(f"Item {item_id} not found")
        
        borrow_item = next(
            (i for i in db_request.items if i.item_uuid == item_obj.id), None
        )
        if not borrow_item:
            raise ValueError(f"Item {item_id} is not part of this borrow request")

        if item_obj.is_trackable:
            raise ValueError("Batch assignment is only applicable to non-trackable items")

        aggregated_assignments: dict[str, Decimal] = {}
        for assignment in batch_assignments:
            aggregated_assignments[assignment.batch_id] = (
                aggregated_assignments.get(assignment.batch_id, ZERO_QUANTITY) + assignment.qty
            )

        if len(aggregated_assignments) != len(batch_assignments):
            raise ValueError("batch_id values must be unique within a single assignment request")

        total_to_assign = sum(aggregated_assignments.values(), ZERO_QUANTITY)
        if total_to_assign != borrow_item.qty_requested:
            raise ValueError(
                f"Expected to assign {format_quantity(borrow_item.qty_requested)} units, but got assignments for {format_quantity(total_to_assign)}"
            )

        from systems.inventory.models import InventoryBatch

        validated_batches: list[tuple[InventoryBatch, Decimal]] = []
        for batch_id, qty in aggregated_assignments.items():
            batch = session.exec(
                select(InventoryBatch).where(
                    InventoryBatch.batch_id == batch_id,
                    InventoryBatch.inventory_uuid == item_obj.id,
                )
            ).first()

            if not batch:
                raise ValueError(f"Batch {batch_id} not found for item {item_id}")

            if batch.available_qty < qty:
                raise ValueError(
                    f"Batch {batch_id} only has {format_quantity(batch.available_qty)} available"
                )

            validated_batches.append((batch, qty))

        # Clear existing assignments for this item
        existing_assignments = [
            ba for ba in db_request.assigned_batches 
            if ba.inventory_batch and ba.inventory_batch.inventory_uuid == item_obj.id
        ]
        for ba in existing_assignments:
            session.delete(ba)
        
        now = get_now_manila()
        created_assignments: list[BorrowRequestBatch] = []

        for batch, qty in validated_batches:
            assignment = BorrowRequestBatch(
                borrow_batch_id=get_next_sequence(
                    session, BorrowRequestBatch, "borrow_batch_id", "BRB"
                ),
                borrow_uuid=db_request.id,
                batch_uuid=batch.id,
                qty_assigned=qty,
                assigned_by=actor_id,
                assigned_at=now,
            )
            session.add(assignment)
            created_assignments.append(assignment)

        # Log event
        event = BorrowRequestEvent(
            event_id=get_next_sequence(session, BorrowRequestEvent, "event_id", "BRE"),
            borrow_uuid=db_request.id,
            event_type="units_assigned",
            actor_id=actor_id,
            note=f"Assigned {total_to_assign} units from batches for item {item_id}. {note or ''}",
        )
        session.add(event)

        audit_service.log_action(
            db=session,
            entity_type="borrow",
            entity_id=db_request.request_id,
            action="assign_batches",
            after={
                "request_id": db_request.request_id,
                "item_id": item_id,
                "assignments": [ba.model_dump() for ba in batch_assignments],
            },
            actor_id=actor_id,
        )

        session.flush()
        for assignment in created_assignments:
            session.refresh(assignment, ["inventory_batch"])
        return created_assignments

    def create_request(
        self,
        session: Session,
        schema: BorrowRequestCreate,
        borrower_id: str,
        request_channel: str,
        actor_id: UUID | None = None,
    ) -> BorrowRequest:
        # Resolve borrower using the passed string ID (e.g., "ST-001")
        borrower = self.user_service.get(session, borrower_id)
        if not borrower:
            raise ValueError(f"Borrower {borrower_id} not found")

        items_by_id = {}
        for item_req in schema.items:
            item = self.inventory_service.get(session, item_req.item_id)
            if not item:
                raise ValueError(f"Item {item_req.item_id} not found")
            if item.is_trackable:
                require_whole_quantity(
                    item_req.qty_requested,
                    field_name=f"qty_requested for trackable item '{item.item_id}'",
                )

            items_by_id[item_req.item_id] = item

        if self._has_identical_active_request(
            session, borrower.id, schema.items, items_by_id
        ):
            raise ValueError(
                "An identical request with the same items and quantities is already active. "
                "You can only re-submit the same request after the previous one is returned."
            )

        year = get_now_manila().year
        transaction_ref = get_next_sequence(
            session, self.model, "transaction_ref", f"TXN-{year}"
        )

        # Merge manual request_channel into data
        data = self._normalize_compliance_fields(
            {**schema.model_dump(), "request_channel": request_channel}
        )
        data["borrower_uuid"] = borrower.id

        if data.get("return_at") is not None:
            data["return_at"] = normalize_datetime_to_manila(data["return_at"])

        # Clean up remaining fields that shouldn't go into BorrowRequest model
        data.pop("items", None)

        # Apply standard metadata requirements
        self._require_setting(
            session,
            key=str(data["request_channel"]),
            table_name="borrow_requests",
            field_name="request_channel",
            field_label="borrow request channel",
        )
        self._require_borrow_status(session, "pending")
        self._require_setting(
            session,
            key="created",
            table_name="borrow_request_events",
            field_name="event_type",
            field_label="borrow request event type",
        )
        data["transaction_ref"] = transaction_ref

        participants_data = data.pop("involved_people", [])

        if not data.get(self.lookup_field):
            data[self.lookup_field] = get_next_sequence(
                session, self.model, self.lookup_field, "REQ"
            )

        db_obj = self.model(**data)
        session.add(db_obj)

        # Create child item records
        for item_req in schema.items:
            item_obj = items_by_id[item_req.item_id]
            borrow_item = BorrowRequestItem(
                borrow_uuid=db_obj.id,
                item_uuid=item_obj.id,
                qty_requested=item_req.qty_requested,
            )
            session.add(borrow_item)

        if participants_data:
            for p in participants_data:
                participant_user_id = p.get("user_id")
                participant_user = (
                    self.user_service.get(session, participant_user_id)
                    if participant_user_id
                    else None
                )
                participant = BorrowParticipant(
                    borrow_uuid=db_obj.id,
                    user_uuid=participant_user.id if participant_user else None,
                    name=p.get("name") or p.get("fullname"),
                    role_in_request=p.get("role") or "witness",
                )
                self._require_setting(
                    session,
                    key=participant.role_in_request,
                    table_name="borrow_participants",
                    field_name="role_in_request",
                    field_label="borrow participant role",
                )
                session.add(participant)

        event = BorrowRequestEvent(
            event_id=get_next_sequence(session, BorrowRequestEvent, "event_id", "BRE"),
            borrow_uuid=db_obj.id,
            event_type="created",
            actor_id=actor_id,
            note=schema.notes,
        )

        audit_service.log_action(
            db=session,
            entity_type="borrow",
            entity_id=db_obj.request_id,
            action="create",
            after=db_obj.model_dump(mode="json"),
            actor_id=actor_id,
        )
        session.add(event)

        session.flush()
        session.refresh(db_obj)
        return db_obj

    def approve_request(
        self,
        session: Session,
        request: str,
        actor_id: UUID,
        note: str | None = None,
    ) -> BorrowRequest:
        stage_0 = "pending"
        stage_1 = "approved"
        db_request = self.get(session, request)
        if not db_request or db_request.status != stage_0:
            raise ValueError(f"Request not found or not in '{stage_0}' status")

        self._require_borrow_status(session, stage_1)
        self._require_setting(
            session,
            key="standard",
            table_name="borrow_requests",
            field_name="approval_channel",
            field_label="borrow approval channel",
        )
        self._require_setting(
            session,
            key="approved",
            table_name="borrow_request_events",
            field_name="event_type",
            field_label="borrow request event type",
        )

        db_request.status = stage_1
        db_request.approval_channel = "standard"
        db_request.approved_by = actor_id
        db_request.approved_at = get_now_manila()

        # Log event
        event = BorrowRequestEvent(
            event_id=get_next_sequence(session, BorrowRequestEvent, "event_id", "BRE"),
            borrow_uuid=db_request.id,
            event_type="approved",
            actor_id=actor_id,
            note=note,
        )

        audit_service.log_action(
            db=session,
            entity_type="borrow",
            entity_id=db_request.request_id,
            action="approve",
            after=db_request.model_dump(mode="json"),
            actor_id=actor_id,
        )
        session.add(event)

        session.add(db_request)
        session.flush()
        session.refresh(db_request)
        return db_request


    def reject_request(
        self,
        session: Session,
        request_id: str,
        actor_id: UUID,
        note: str | None = None,
    ) -> BorrowRequest:
        stage_0 = "pending"
        db_request = self.get(session, request_id)
        if not db_request or db_request.status != stage_0:
            raise ValueError(f"Request not found or not in '{stage_0}' status")

        self._require_borrow_status(session, "rejected")
        self._require_setting(
            session,
            key="rejected",
            table_name="borrow_request_events",
            field_name="event_type",
            field_label="borrow request event type",
        )
        db_request.status = "rejected"

        event = BorrowRequestEvent(
            event_id=get_next_sequence(session, BorrowRequestEvent, "event_id", "BRE"),
            borrow_uuid=db_request.id,
            event_type="rejected",
            actor_id=actor_id,
            note=note,
        )

        audit_service.log_action(
            db=session,
            entity_type="borrow",
            entity_id=db_request.request_id,
            action="reject",
            after=db_request.model_dump(mode="json"),
            actor_id=actor_id,
        )
        session.add(event)

        session.add(db_request)
        session.flush()
        session.refresh(db_request)
        return db_request

    def release_request(
        self,
        session: Session,
        request_id: str,
        actor_id: UUID,
        note: str | None = None,
    ) -> BorrowRequest:
        stage_approved = "approved"
        stage_released = "released"
        db_request = self.get(session, request_id)
        if not db_request:
            raise ValueError("Request not found")

        is_emergency_bypass = (
            db_request.is_emergency and db_request.status == stage_approved
        )
        is_direct_release = (
            db_request.status == stage_approved and not db_request.is_emergency
        )
        if not (is_emergency_bypass or is_direct_release):
            raise ValueError(
                f"Request not found or not in '{stage_approved}' status"
            )

        now = get_now_manila()

        for borrow_item in db_request.items:
            item = borrow_item.inventory_item
            if not item:
                raise ValueError(
                    f"Inventory item record for {borrow_item.item_uuid} not found"
                )

            if is_direct_release:
                balances = self.inventory_service.get_item_balances(session, item)
                if balances["available_qty"] < borrow_item.qty_requested:
                    raise ValueError(
                        f"Insufficient stock for item {item.item_id}. Direct release requires all items to be in stock."
                    )

            if item.is_trackable:
                assignments = self._validate_trackable_assignment_prerequisites(
                    session, db_request, borrow_item
                )
                for assignment in assignments:
                    unit = assignment.inventory_unit
                    if not unit:
                        raise ValueError(
                            f"Assigned unit for assignment {assignment.borrow_unit_id} not found"
                        )
                    if unit.status != "available":
                        raise ValueError(
                            f"Assigned unit {unit.unit_id} is not available for release"
                        )

                    self.inventory_service._validate_status_transition(
                        session, unit.status, "borrowed"
                    )
                    unit.status = "borrowed"
                    assignment.released_at = now
                    assignment.released_by = actor_id
                    assignment.condition_on_release = unit.condition

                    if assignment.approved_by is None:
                        assignment.approved_by = db_request.approved_by
                        assignment.approved_at = db_request.approved_at

                    session.add(unit)
                    session.add(assignment)

                    self.inventory_service.adjust_stock(
                        session,
                        item.item_id,
                        -TRACKABLE_UNIT_QUANTITY,
                        movement_type="borrow_release",
                        reference_id=db_request.request_id,
                        reference_type="borrow_request",
                        actor_id=actor_id,
                        unit_uuid=unit.id,
                    )
            else:
                # Enforce batch assignments for non-trackable items
                batch_assignments = self._validate_batch_assignment_prerequisites(
                    session, db_request, borrow_item
                )

                for ba in batch_assignments:
                    ba.released_at = now
                    session.add(ba)

                    self.inventory_service.adjust_stock(
                        session,
                        item.item_id,
                        -ba.qty_assigned,
                        movement_type="borrow_release",
                        reference_id=db_request.request_id,
                        reference_type="borrow_request",
                        actor_id=actor_id,
                        batch_id=ba.inventory_batch.batch_id,
                    )

        self._require_borrow_status(session, stage_released)
        self._require_setting(
            session,
            key="released",
            table_name="borrow_request_events",
            field_name="event_type",
            field_label="borrow request event type",
        )
        db_request.status = stage_released
        if is_emergency_bypass:
            self._require_setting(
                session,
                key="emergency_bypass",
                table_name="borrow_requests",
                field_name="approval_channel",
                field_label="borrow approval channel",
            )
            db_request.approval_channel = "emergency_bypass"
        db_request.released_by = actor_id
        db_request.released_at = now

        # Log event
        event = BorrowRequestEvent(
            event_id=get_next_sequence(session, BorrowRequestEvent, "event_id", "BRE"),
            borrow_uuid=db_request.id,
            event_type="released",
            actor_id=actor_id,
            note=note
            or (
                "Emergency release bypassed warehouse stage"
                if is_emergency_bypass
                else None
            ),
        )

        audit_service.log_action(
            db=session,
            entity_type="borrow",
            entity_id=db_request.request_id,
            action="release",
            after=db_request.model_dump(mode="json"),
            actor_id=actor_id,
        )
        session.add(event)

        session.add(db_request)
        session.flush()
        session.refresh(db_request)
        return db_request

    def return_request(
        self,
        session: Session,
        request_id: str,
        actor_id: UUID,
        note: str | None = None,
        unit_returns: list[BorrowRequestUnitReturn] | None = None,
        batch_returns: list[BorrowRequestBatchReturn] | None = None,
    ) -> BorrowRequest:
        stage_4 = "released"
        stage_5 = "returned"
        db_request = self.get(session, request_id)
        if not db_request or db_request.status != stage_4:
            raise ValueError(f"Request not found or not in '{stage_4}' status")

        unit_return_map = {
            unit_return.unit_id: unit_return for unit_return in (unit_returns or [])
        }
        batch_return_map = {
            batch_return.borrow_batch_id: batch_return
            for batch_return in (batch_returns or [])
        }
        if batch_returns is not None and len(batch_return_map) != len(batch_returns):
            raise ValueError("borrow_batch_id values must be unique within a return request")

        active_batch_assignments = [
            assignment
            for assignment in db_request.assigned_batches
            if assignment.inventory_batch
            and assignment.released_at is not None
            and assignment.returned_at is None
        ]
        if batch_returns is not None and active_batch_assignments:
            expected_batch_ids = {
                assignment.borrow_batch_id for assignment in active_batch_assignments
            }
            provided_batch_ids = set(batch_return_map)
            if provided_batch_ids != expected_batch_ids:
                raise ValueError(
                    "Return payload for non-trackable items must include all released batch assignments"
                )

        for borrow_item in db_request.items:
            item = borrow_item.inventory_item
            if not item:
                raise ValueError(
                    f"Inventory item record for {borrow_item.item_uuid} not found"
                )

            if item.is_trackable:
                assignments = self._validate_trackable_assignment_prerequisites(
                    session, db_request, borrow_item
                )
                for assignment in assignments:
                    unit = assignment.inventory_unit
                    if not unit:
                        raise ValueError(
                            f"Assigned unit {assignment.borrow_unit_id} not found"
                        )
                    if unit.status != "borrowed":
                        raise ValueError(
                            f"Assigned unit {unit.unit_id} is not marked as borrowed"
                        )

                    return_data = unit_return_map.get(unit.unit_id)
                    condition_on_return = (
                        return_data.condition_on_return if return_data else None
                    )

                    # Auto-determine status based on condition
                    status_on_return = "available"
                    if condition_on_return:
                        if condition_on_return.lower() in {
                            "damaged",
                            "for_repair",
                            "repair",
                            "poor",
                            "unusable",
                        }:
                            status_on_return = "maintenance"

                    self.inventory_service._validate_status_transition(
                        session, unit.status, status_on_return
                    )
                    unit.status = status_on_return

                    if condition_on_return:
                        self._require_setting(
                            session,
                            key=condition_on_return,
                            table_name="inventory_units",
                            field_name="condition",
                            field_label="inventory unit condition",
                        )
                        unit.condition = condition_on_return

                    assignment.returned_at = get_now_manila()
                    assignment.returned_by = actor_id
                    assignment.condition_on_return = condition_on_return
                    assignment.return_notes = return_data.notes if return_data else None

                    session.add(unit)
                    session.add(assignment)

                    movement_type = "borrow_return"
                    qty_change = TRACKABLE_UNIT_QUANTITY
                    if status_on_return == "maintenance":
                        movement_type = "maintenance"
                        qty_change = ZERO_QUANTITY

                    self.inventory_service.adjust_stock(
                        session,
                        item.item_id,
                        qty_change,
                        movement_type=movement_type,
                        reference_id=db_request.request_id,
                        reference_type="borrow_request",
                        actor_id=actor_id,
                        unit_uuid=unit.id,
                    )
            else:
                # Check for batch assignments
                batch_assignments = [
                    a for a in db_request.assigned_batches 
                    if a.inventory_batch and a.inventory_batch.inventory_uuid == item.id
                    and a.released_at is not None and a.returned_at is None
                ]
                
                if batch_assignments:
                    for ba in batch_assignments:
                        requested_return = batch_return_map.get(ba.borrow_batch_id)
                        qty_returned = (
                            requested_return.qty_returned
                            if requested_return is not None
                            else ba.qty_assigned
                        )
                        if qty_returned > ba.qty_assigned:
                            raise ValueError(
                                f"Returned quantity for batch {ba.batch_id} cannot exceed assigned quantity {format_quantity(ba.qty_assigned)}"
                            )

                        ba.returned_at = get_now_manila()
                        session.add(ba)

                        if qty_returned > 0:
                            self.inventory_service.adjust_stock(
                                session,
                                item.item_id,
                                qty_returned,
                                movement_type="borrow_return",
                                reference_id=db_request.request_id,
                                reference_type="borrow_request",
                                actor_id=actor_id,
                                batch_id=ba.inventory_batch.batch_id,
                            )
                else:
                    raise ValueError(
                        f"Released non-trackable item {item.item_id} has no batch assignments to return"
                    )

        now = get_now_manila()
        self._require_borrow_status(session, stage_5)
        self._require_setting(
            session,
            key="returned",
            table_name="borrow_request_events",
            field_name="event_type",
            field_label="borrow request event type",
        )
        db_request.status = stage_5
        db_request.returned_by = actor_id
        db_request.received_by = actor_id
        db_request.returned_at = now

        # Calculate returned_on_time
        if db_request.return_at:
            normalized_return_at = normalize_datetime_to_manila(db_request.return_at)
            db_request.return_at = normalized_return_at
            db_request.returned_on_time = now <= normalized_return_at
        else:
            db_request.returned_on_time = True

        # Log event
        event = BorrowRequestEvent(
            event_id=get_next_sequence(session, BorrowRequestEvent, "event_id", "BRE"),
            borrow_uuid=db_request.id,
            event_type="returned",
            actor_id=actor_id,
            note=note,
        )

        audit_service.log_action(
            db=session,
            entity_type="borrow",
            entity_id=db_request.request_id,
            action="return",
            after=db_request.model_dump(mode="json"),
            actor_id=actor_id,
        )
        session.add(event)

        session.add(db_request)
        session.flush()
        session.refresh(db_request)
        return db_request

    def reopen_request(
        self,
        session: Session,
        request_id: str,
        actor_id: UUID,
        note: str | None = None,
    ) -> BorrowRequest:
        pending_stage = "pending"
        db_request = self.get(session, request_id)
        if not db_request or db_request.status != "rejected":
            raise ValueError("Request must be in 'rejected' status")

        duplicate_active_request = session.exec(
            select(BorrowRequest).where(
                BorrowRequest.borrower_uuid == db_request.borrower_uuid,
                BorrowRequest.is_deleted.is_(False),
                BorrowRequest.status.in_(self._active_statuses(session)),
                BorrowRequest.id != db_request.id,
            )
        ).first()
        if duplicate_active_request:
            raise ValueError(
                "Cannot reopen request while another active request for this borrower exists"
            )

        self._require_borrow_status(session, pending_stage)
        self._require_setting(
            session,
            key="reopened",
            table_name="borrow_request_events",
            field_name="event_type",
            field_label="borrow request event type",
        )
        db_request.status = pending_stage

        event = BorrowRequestEvent(
            event_id=get_next_sequence(session, BorrowRequestEvent, "event_id", "BRE"),
            borrow_uuid=db_request.id,
            event_type="reopened",
            actor_id=actor_id,
            note=note,
        )

        audit_service.log_action(
            db=session,
            entity_type="borrow",
            entity_id=db_request.request_id,
            action="reopen",
            after=db_request.model_dump(mode="json"),
            actor_id=actor_id,
        )
        session.add(event)

        session.add(db_request)
        session.flush()
        session.refresh(db_request)
        return db_request



    def close_request(
        self, session: Session, request_id: str, actor_id: UUID, notes: str | None = None
    ) -> BorrowRequest:
        db_request = self.get(session, request_id)
        if not db_request:
            raise ValueError("Request not found")

        if db_request.status == "closed":
            raise ValueError("Request is already closed")

        # Determine if closure is allowed
        # 1. If rejected
        # 2. If returned
        # 3. If released and all items are untrackable
        can_close = False
        reason = None

        if db_request.status == "rejected":
            can_close = True
            reason = "rejected"
        elif db_request.status == "returned":
            can_close = True
            reason = "returned"
        elif db_request.status == "released":
            # Check if all items are untrackable
            items = session.exec(
                select(BorrowRequestItem).where(
                    BorrowRequestItem.borrow_uuid == db_request.id,
                    BorrowRequestItem.is_deleted.is_(False),
                )
            ).all()

            all_untrackable = True
            for item in items:
                inv_item = session.get(InventoryItem, item.item_uuid)
                if inv_item and inv_item.is_trackable:
                    all_untrackable = False
                    break

            if all_untrackable:
                can_close = True
                reason = "released"
            else:
                raise ValueError("Trackable items must be returned before closing")
        else:
            raise ValueError(f"Cannot close request in status: {db_request.status}")

        if not can_close:
            raise ValueError("Conditions for closure not met")

        self._require_borrow_status(session, "closed")
        self._require_setting(
            session,
            key="closed",
            table_name="borrow_request_events",
            field_name="event_type",
            field_label="borrow request event type",
        )

        db_request.status = "closed"
        db_request.closed_at = get_now_manila()
        db_request.closed_by = actor_id
        db_request.close_reason = reason

        # Add event
        event = BorrowRequestEvent(
            event_id=get_next_sequence(session, BorrowRequestEvent, "event_id", "BRE"),
            borrow_uuid=db_request.id,
            event_type="closed",
            actor_id=actor_id,
            note=notes or f"Request closed - {reason}",
            occurred_at=get_now_manila(),
        )
        
        audit_service.log_action(
            db=session,
            entity_type="borrow",
            entity_id=db_request.request_id,
            action="close",
            after=db_request.model_dump(mode="json"),
            actor_id=actor_id,
        )

        session.add(event)
        session.add(db_request)
        session.flush()
        session.refresh(db_request)
        return db_request

borrow_request_service = BorrowService()
