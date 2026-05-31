import json
from datetime import datetime, timezone
from typing import Type

from sqlmodel import Session, select
from systems.admin.models.user import User
from systems.admin.models.settings import AdminConfig
from systems.auth.models.settings import AuthConfig
from systems.inventory.models.settings import InventoryConfig, BorrowerConfig
from core.config import settings
from utils.security import get_password_hash
from data.system_init_data import SYSTEM_CONFIGS, RBAC_ROLES
from utils.logging import get_logger
from systems.auth.services.rbac_service import normalize_role, validate_role_policy_payload

logger = get_logger("core.init")

AUTH_CONFIG_CATEGORIES = {
    "security_settings",
    "rbac_roles",
    "users_role",
    "users_shift_type",
    "users_shift_definition",
}
NON_CRUCIAL_SEED_CATEGORIES = {
    "inventory_item_type",
    "inventory_classification",
    "inventory_category",
    "inventory_movements_reason_code",
    "inventory_unit_of_measure",
}
LEGACY_BORROWER_CONFIG_KEYS_BY_CATEGORY = {
    "borrow_requests_status": {
        "sent_to_warehouse",
        "warehouse_approved",
        "warehouse_rejected",
    },
    "borrow_requests_approval_channel": {
        "warehouse_manual",
        "warehouse_shortage_auto",
        "warehouse_standard",
        "warehouse_provisioned",
    },
    "borrow_request_events_event_type": {
        "sent_to_warehouse",
        "warehouse_approved",
        "warehouse_rejected",
    },
}
LEGACY_ADMIN_CONFIG_KEYS_BY_CATEGORY = {
    "audit_logs_action": {"warehouse_approve", "warehouse_reject"},
}
ConfigModel = Type[AdminConfig] | Type[InventoryConfig] | Type[BorrowerConfig] | Type[AuthConfig]


def _required_borrower_keys(category: str) -> set[str]:
    return {
        str(entry["key"])
        for entry in SYSTEM_CONFIGS
        if entry.get("system") == "borrower"
        and entry.get("category") == category
    }


def _is_seed_config_crucial(config_data: dict) -> bool:
    category = str(config_data.get("category", ""))
    return category not in NON_CRUCIAL_SEED_CATEGORIES


def resolve_bootstrap_admin_credentials() -> tuple[str, str]:
    """Resolve bootstrap admin credentials from environment-backed settings."""
    bootstrap_username = (settings.INITIAL_ADMIN_USERNAME or "").strip() or "admin"
    bootstrap_password = settings.INITIAL_ADMIN_PASSWORD

    if bootstrap_password:
        return bootstrap_username, bootstrap_password

    if settings.DEBUG and settings.ALLOW_INSECURE_DEV_DEFAULT_ADMIN:
        # Development-only deterministic fallback derived from SECRET_KEY.
        derived_password = f"dev-{settings.SECRET_KEY[:12]}"
        logger.warning(
            "Using insecure development fallback for bootstrap admin password. "
            "Set INITIAL_ADMIN_PASSWORD to avoid derived development credentials."
        )
        return bootstrap_username, derived_password

    raise RuntimeError(
        "INITIAL_ADMIN_PASSWORD is required to bootstrap ADMIN-001. "
        "Set INITIAL_ADMIN_PASSWORD or enable ALLOW_INSECURE_DEV_DEFAULT_ADMIN=true "
        "with DEBUG=true for local development only."
    )

class InitializationService:
    def _resolve_config_model(self, config_data: dict) -> tuple[ConfigModel, str]:
        category = config_data.get("category", "")
        system = config_data.get("system", "admin")

        # Mirror API endpoints used in seed_configuration.py routing.
        if category in AUTH_CONFIG_CATEGORIES:
            return AuthConfig, "admin"
        if system == "borrower":
            return BorrowerConfig, "borrower"
        if system == "inventory":
            return InventoryConfig, "inventory"
        return AdminConfig, "admin"

    def ensure_admin_user(self, session: Session):
        """Pre-create bootstrap admin user if it doesn't exist."""
        existing = session.exec(
            select(User).where(User.user_id == "ADMIN-001", User.is_deleted.is_(False))
        ).first()

        if not existing:
            bootstrap_username, bootstrap_password = resolve_bootstrap_admin_credentials()

            admin_user = User(
                user_id="ADMIN-001",
                username=bootstrap_username,
                email="admin@powergold.system",
                hashed_password=get_password_hash(bootstrap_password),
                first_name="System",
                last_name="Administrator",
                last_active=datetime.now(timezone.utc),
                middle_name="Init",
                contact_number="",
                employee_id="SYS-ADMIN-001",
                role="admin",
                shift_type="day",
                must_change_password=True,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            session.add(admin_user)
            logger.info("Created bootstrap administrator (%s)", bootstrap_username)
        else:
            logger.debug("Administrator account already exists.")

    def rebalance_misplaced_configurations(self, session: Session):
        """Move wrongly stored rows out of admin_configurations into their proper tables."""
        moved = 0
        reconciled = 0
        removed = 0

        misplaced_rows = session.exec(
            select(AdminConfig).where(
                (AdminConfig.system == "borrower")
                | (AdminConfig.category.in_(list(AUTH_CONFIG_CATEGORIES)))
            )
        ).all()

        for row in misplaced_rows:
            if row.category in AUTH_CONFIG_CATEGORIES:
                target_model: ConfigModel = AuthConfig
                target_system = "admin"
            elif row.system == "borrower":
                target_model = BorrowerConfig
                target_system = "borrower"
            else:
                continue

            existing = session.exec(
                select(target_model).where(
                    target_model.key == row.key,
                    target_model.category == row.category,
                )
            ).first()

            if not existing:
                session.add(
                    target_model(
                        system=target_system,
                        key=row.key,
                        value=row.value,
                        category=row.category,
                        description=row.description,
                        crucial=row.crucial,
                    )
                )
                moved += 1
            else:
                changed = False
                if existing.is_deleted:
                    existing.is_deleted = False
                    existing.deleted_at = None
                    changed = True
                if existing.system != target_system:
                    existing.system = target_system
                    changed = True
                if existing.value != row.value:
                    existing.value = row.value
                    changed = True
                if existing.description != row.description:
                    existing.description = row.description
                    changed = True
                if existing.crucial != row.crucial:
                    existing.crucial = row.crucial
                    changed = True

                if changed:
                    session.add(existing)
                    reconciled += 1

            session.delete(row)
            removed += 1

        if moved or reconciled or removed:
            logger.info(
                "Rebalanced misplaced configs: moved=%s reconciled=%s removed_from_admin=%s",
                moved,
                reconciled,
                removed,
            )
        else:
            logger.debug("No misplaced admin configurations found.")

    def seed_configurations(self, session: Session):
        """Idempotently seed general system configurations."""
        created_count = 0
        reconciled_count = 0
        restored_count = 0
        for config_data in SYSTEM_CONFIGS:
            model, normalized_system = self._resolve_config_model(config_data)
            should_be_crucial = _is_seed_config_crucial(config_data)
            
            existing = session.exec(
                select(model).where(
                    model.key == config_data["key"],
                    model.category == config_data["category"]
                )
            ).first()
    
            if not existing:
                config = model(
                    system=normalized_system,
                    key=config_data["key"],
                    value=config_data["value"],
                    category=config_data["category"],
                    description=config_data.get("description"),
                    crucial=should_be_crucial,
                )
                session.add(config)
                created_count += 1
                continue

            changed = False
            if existing.system != normalized_system:
                existing.system = normalized_system
                changed = True

            if should_be_crucial and existing.is_deleted:
                existing.is_deleted = False
                existing.deleted_at = None
                existing.crucial = True
                changed = True
                restored_count += 1
            elif not existing.is_deleted and existing.crucial != should_be_crucial:
                existing.crucial = should_be_crucial
                changed = True

            if changed:
                session.add(existing)
                reconciled_count += 1

        if created_count or reconciled_count:
            logger.info(
                "Synchronized system configurations: created=%s reconciled=%s restored=%s",
                created_count,
                reconciled_count,
                restored_count,
            )
        else:
            logger.debug("System configurations are up to date.")

    def seed_rbac_roles(self, session: Session):
        """Idempotently seed RBAC role-specific permissions."""
        created_count = 0
        reconciled_count = 0
        restored_count = 0
        for role_data in RBAC_ROLES:
            role_key = normalize_role(str(role_data.get("role", "")))
            try:
                payload = validate_role_policy_payload(
                    role_key,
                    {
                        "systems": role_data.get("systems"),
                        "permissions": role_data.get("permissions"),
                        "display_name": role_data.get("display_name"),
                    },
                )
            except ValueError as exc:
                raise RuntimeError(
                    f"Invalid RBAC seed payload for role '{role_data.get('role')}'"
                ) from exc
            
            existing = session.exec(
                select(AuthConfig).where(
                    AuthConfig.key == role_key,
                    AuthConfig.category == "rbac_roles"
                )
            ).first()

            description = f"Dynamic override for role: {role_data['role']}"
            serialized_payload = json.dumps(payload)

            if not existing:
                config = AuthConfig(
                    system="admin",
                    key=role_key,
                    value=serialized_payload,
                    category="rbac_roles",
                    description=description,
                )
                session.add(config)
                created_count += 1
                continue

            changed = False
            if existing.system != "admin":
                existing.system = "admin"
                changed = True
            if existing.value != serialized_payload:
                existing.value = serialized_payload
                changed = True
            if existing.description != description:
                existing.description = description
                changed = True
            if existing.is_deleted:
                existing.is_deleted = False
                existing.deleted_at = None
                restored_count += 1
                changed = True

            if changed:
                session.add(existing)
                reconciled_count += 1
        
        if created_count or reconciled_count:
            logger.info(
                "Synchronized role permission sets: created=%s reconciled=%s restored=%s",
                created_count,
                reconciled_count,
                restored_count,
            )
        else:
            logger.debug("Role permissions are up to date.")

    def validate_borrow_workflow_integrity(self, session: Session) -> None:
        """Ensure required borrow workflow taxonomy is present after seeding."""
        required_status_keys = _required_borrower_keys("borrow_requests_status")
        required_event_type_keys = _required_borrower_keys(
            "borrow_request_events_event_type"
        )

        status_keys = set(
            session.exec(
                select(BorrowerConfig.key).where(
                    BorrowerConfig.category == "borrow_requests_status",
                    BorrowerConfig.is_deleted.is_(False),
                )
            ).all()
        )
        missing_status = sorted(required_status_keys - status_keys)

        event_type_keys = set(
            session.exec(
                select(BorrowerConfig.key).where(
                    BorrowerConfig.category == "borrow_request_events_event_type",
                    BorrowerConfig.is_deleted.is_(False),
                )
            ).all()
        )
        missing_event_types = sorted(required_event_type_keys - event_type_keys)

        if missing_status or missing_event_types:
            problems: list[str] = []
            if missing_status:
                problems.append(f"missing borrow status keys: {', '.join(missing_status)}")
            if missing_event_types:
                problems.append(
                    "missing borrow event type keys: "
                    f"{', '.join(missing_event_types)}"
                )
            raise RuntimeError(
                "Borrow workflow taxonomy integrity check failed: "
                + "; ".join(problems)
            )

    def purge_legacy_configuration_keys(self, session: Session) -> None:
        """Remove deprecated warehouse-era workflow keys from existing configuration tables."""
        purged_rows = 0

        for category, keys in LEGACY_BORROWER_CONFIG_KEYS_BY_CATEGORY.items():
            legacy_rows = session.exec(
                select(BorrowerConfig).where(
                    BorrowerConfig.category == category,
                    BorrowerConfig.key.in_(list(keys)),
                    BorrowerConfig.is_deleted.is_(False),
                )
            ).all()
            for row in legacy_rows:
                session.delete(row)
                purged_rows += 1

        for category, keys in LEGACY_ADMIN_CONFIG_KEYS_BY_CATEGORY.items():
            legacy_rows = session.exec(
                select(AdminConfig).where(
                    AdminConfig.category == category,
                    AdminConfig.key.in_(list(keys)),
                    AdminConfig.is_deleted.is_(False),
                )
            ).all()
            for row in legacy_rows:
                session.delete(row)
                purged_rows += 1

        if purged_rows:
            logger.info("Removed %s legacy configuration keys.", purged_rows)

    def run(self, session: Session):
        """Run all initialization steps in sequence."""
        # Seed Data
        logger.info("Starting System Initialization Registry check...")
        self.ensure_admin_user(session)
        self.rebalance_misplaced_configurations(session)
        self.seed_configurations(session)
        self.seed_rbac_roles(session)
        self.purge_legacy_configuration_keys(session)
        self.validate_borrow_workflow_integrity(session)
        session.commit()
        logger.info("System Initialization Sequence Completed Successfully.")
