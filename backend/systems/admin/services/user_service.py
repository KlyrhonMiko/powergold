import secrets
import string
from datetime import timedelta
from typing import Any, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlmodel import Session, select, func, or_

from core.base_service import BaseService
from systems.admin.models.user import User
from systems.admin.services.password_policy_service import PasswordPolicyService
from systems.admin.schemas.user_schemas import UserCreate, UserUpdate
from utils.id_generator import get_next_sequence
from utils.security import decrypt_sensitive_value, encrypt_sensitive_value, get_password_hash
from utils.time_utils import get_now_manila


class UserService(BaseService[User, UserCreate, UserUpdate]):
    _BORROWER_ROLES = {"borrower", "brwr", "borrow"}
    _SECURITY_SETTINGS_CATEGORY = "security_settings"
    _SECONDARY_PASSWORD_ROTATION_INTERVAL_KEY = "secondary_password_rotation_interval_days"
    _DEFAULT_SECONDARY_PASSWORD_ROTATION_DAYS = 30
    _SENSITIVE_AUDIT_KEYS = {
        "password",
        "hashed_password",
        "secondary_password",
        "current_password",
        "recovery_credential",
        "recovery_credential_encrypted",
        "one_time_login_password",
        "generated_credentials",
    }
    _SPECIAL_PASSWORD_CHARS = "!@#$%^&*()-_=+"

    def __init__(self):
        super().__init__(User, lookup_field="user_id")
        self.password_policy_service = PasswordPolicyService()

    @staticmethod
    def _normalize_role(role: str | None) -> str:
        return (role or "").strip().lower()

    @classmethod
    def _is_borrower_role(cls, role: str | None) -> bool:
        return cls._normalize_role(role) in cls._BORROWER_ROLES

    @classmethod
    def _redact_sensitive_payload(cls, value: Any, *, parent_key: str | None = None) -> Any:
        if parent_key and parent_key.lower() in cls._SENSITIVE_AUDIT_KEYS:
            return "[REDACTED]"

        if isinstance(value, dict):
            return {
                key: cls._redact_sensitive_payload(nested_value, parent_key=key)
                for key, nested_value in value.items()
            }

        if isinstance(value, list):
            return [
                cls._redact_sensitive_payload(item, parent_key=parent_key)
                for item in value
            ]

        return value

    def _generate_policy_compliant_password(self, session: Session, role: str, *, min_length: int = 12) -> str:
        normalized_role = self._normalize_role(role)
        policy = self.password_policy_service.get_policy(session)
        target_length = max(policy.min_length, min_length)

        char_groups: list[str] = []
        if policy.require_uppercase:
            char_groups.append(string.ascii_uppercase)
        if policy.require_lowercase:
            char_groups.append(string.ascii_lowercase)
        if policy.require_number:
            char_groups.append(string.digits)
        if policy.require_special:
            char_groups.append(self._SPECIAL_PASSWORD_CHARS)

        if not char_groups:
            # Keep generated passwords strong even when policy is permissive.
            char_groups = [string.ascii_uppercase, string.ascii_lowercase, string.digits]

        universal_charset = "".join(char_groups)

        for _ in range(20):
            required = [secrets.choice(group) for group in char_groups]
            remaining = [
                secrets.choice(universal_charset)
                for _ in range(max(target_length - len(required), 0))
            ]
            password_chars = required + remaining
            secrets.SystemRandom().shuffle(password_chars)
            generated = "".join(password_chars)

            try:
                self.password_policy_service.validate_for_role(
                    session,
                    generated,
                    normalized_role,
                )
            except HTTPException:
                continue

            return generated

        raise RuntimeError("Unable to generate a password that satisfies policy requirements")

    def _generate_secondary_password(self) -> str:
        return secrets.token_urlsafe(24)

    def _generate_import_login_code(self) -> str:
        return "".join(secrets.choice(string.digits) for _ in range(6))

    def _get_secondary_password_rotation_interval_days(self, session: Session) -> int:
        from systems.auth.services.configuration_service import AuthConfigService

        auth_config_service = AuthConfigService()
        raw_value = auth_config_service.get_value(
            session,
            self._SECONDARY_PASSWORD_ROTATION_INTERVAL_KEY,
            str(self._DEFAULT_SECONDARY_PASSWORD_ROTATION_DAYS),
            category=self._SECURITY_SETTINGS_CATEGORY,
        )

        try:
            parsed = int(str(raw_value).strip())
        except (TypeError, ValueError):
            return self._DEFAULT_SECONDARY_PASSWORD_ROTATION_DAYS

        return max(1, min(parsed, 365))

    def _rotate_secondary_password(self, user: User) -> str:
        secondary_password = self._generate_secondary_password()
        user.recovery_credential_encrypted = encrypt_sensitive_value(secondary_password)
        user.recovery_credential_rotated_at = get_now_manila()
        return secondary_password

    def _is_secondary_password_due_for_rotation(self, session: Session, user: User) -> bool:
        if self._is_borrower_role(user.role):
            return False

        if not user.recovery_credential_encrypted or user.recovery_credential_rotated_at is None:
            return True

        interval_days = self._get_secondary_password_rotation_interval_days(session)
        now = get_now_manila()
        next_rotation_at = user.recovery_credential_rotated_at + timedelta(days=interval_days)
        return now >= next_rotation_at

    def rotate_due_secondary_passwords(
        self,
        session: Session,
        actor_id: UUID | None = None,
    ) -> int:
        candidates = session.exec(
            select(User).where(
                User.is_deleted.is_(False),
            )
        ).all()

        rotated_count = 0
        for user in candidates:
            if not self._is_secondary_password_due_for_rotation(session, user):
                continue

            before = user.model_dump(mode="json")
            self._rotate_secondary_password(user)
            user.updated_at = get_now_manila()
            session.add(user)

            self._log_audit(
                session=session,
                action="secondary_password_auto_rotated",
                entity_id=user.user_id,
                before=self._redact_sensitive_payload(before),
                after=self._redact_sensitive_payload(user.model_dump(mode="json")),
                actor_id=actor_id,
                reason_code="secondary_password_due_rotation",
            )
            rotated_count += 1

        if rotated_count:
            session.flush()

        return rotated_count

    def _verify_secondary_password(self, user: User, secondary_password: str) -> bool:
        encrypted_value = user.recovery_credential_encrypted
        if not encrypted_value:
            raise HTTPException(
                status_code=404,
                detail="Secondary password is not available for this user.",
            )

        try:
            current_value = decrypt_sensitive_value(encrypted_value)
        except ValueError as exc:
            raise HTTPException(
                status_code=500,
                detail="Secondary password is unavailable due to a decryption error.",
            ) from exc

        provided = secondary_password.strip()
        if not provided:
            raise HTTPException(
                status_code=400,
                detail="Secondary password is required.",
            )

        return secrets.compare_digest(current_value, provided)

    def requires_session_revocation(self, user: User, schema: UserUpdate) -> bool:
        updates = schema.model_dump(exclude_unset=True)
        if not updates:
            return False

        if updates.get("change_password") and updates.get("password"):
            return True

        for field_name in ("email", "username", "role"):
            if field_name in updates and updates[field_name] != getattr(user, field_name):
                return True

        return False

    def get_all(
        self,
        session: Session,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        shift_type: Optional[str] = None,
        include_archived: bool = False,
        is_archived: Optional[bool] = None,
    ) -> tuple[list[User], int]:
        """Get users with optional search and filter params."""
        statement = select(User)
        
        # Apply archival filtering
        if is_archived is not None:
            statement = statement.where(User.is_archived == is_archived)
        elif not include_archived:
            statement = statement.where(User.is_archived.is_(False))

        # Default: only show active users
        if is_active is None:
            statement = statement.where(User.is_deleted.is_(False))
        elif is_active:
            statement = statement.where(User.is_deleted.is_(False))
        else:
            statement = statement.where(User.is_deleted.is_(True))

        if search:
            statement = statement.where(
                or_(
                    User.user_id.ilike(f"%{search}%"),
                    User.email.ilike(f"%{search}%"),
                    User.first_name.ilike(f"%{search}%"),
                    User.last_name.ilike(f"%{search}%"),
                )
            )
        if role is not None:
            statement = statement.where(User.role == role)
        if shift_type is not None:
            statement = statement.where(User.shift_type == shift_type)

        count_stmt = select(func.count()).select_from(statement.subquery())
        total = session.exec(count_stmt).one()

        results = session.exec(
            statement.order_by(User.last_name.asc(), User.first_name.asc()).offset(skip).limit(limit)
        ).all()

        return list(results), total

    def create(
        self,
        session: Session,
        schema: UserCreate,
        actor_id: UUID | None = None,
    ) -> User:
        created, _ = self.create_with_generated_credentials(
            session,
            schema,
            actor_id=actor_id,
        )
        return created

    def create_with_generated_credentials(
        self,
        session: Session,
        schema: UserCreate,
        actor_id: UUID | None = None,
    ) -> tuple[User, dict[str, str] | None]:
        from systems.auth.services.configuration_service import AuthConfigService

        auth_config_service = AuthConfigService()
        self.validate_uniqueness(
            session,
            schema,
            unique_fields=[["email"], ["username"]],
        )

        normalized_role = self._normalize_role(schema.role)

        setting = auth_config_service.get_by_key(
            session,
            key=normalized_role,
            category="users_role"
        )

        if not setting:
             raise ValueError(
                f"Configuration Error: ID prefix for role '{schema.role}' is not defined. "
                f"Please add it to system_settings under category 'users_role'."
            )

        prefix = setting.value

        data = schema.model_dump()
        data["role"] = normalized_role
        supplied_password = data.pop("password", None)

        generated_credentials: dict[str, str] | None = None
        if self._is_borrower_role(normalized_role):
            if not supplied_password:
                raise HTTPException(
                    status_code=400,
                    detail="Borrower PIN/password is required.",
                )

            self.password_policy_service.validate_for_role(
                session,
                supplied_password,
                normalized_role,
            )
            data["hashed_password"] = get_password_hash(supplied_password)
            data["password_rotated_at"] = get_now_manila()
            data["must_change_password"] = False
            data["recovery_credential_encrypted"] = None
            data["recovery_credential_rotated_at"] = None
        else:
            one_time_login_password = self._generate_policy_compliant_password(
                session,
                normalized_role,
                min_length=12,
            )
            secondary_password = self._generate_secondary_password()

            data["hashed_password"] = get_password_hash(one_time_login_password)
            data["must_change_password"] = True
            data["password_rotated_at"] = None
            data["recovery_credential_encrypted"] = encrypt_sensitive_value(secondary_password)
            data["recovery_credential_rotated_at"] = get_now_manila()

            generated_credentials = {
                "one_time_login_password": one_time_login_password,
                "secondary_password": secondary_password,
            }

        if not data.get(self.lookup_field):
            data[self.lookup_field] = get_next_sequence(session, self.model, self.lookup_field, prefix)

        db_obj = self.model(**data)
        session.add(db_obj)

        self._log_audit(
            session=session,
            action="created",
            entity_id=db_obj.user_id,
            after=self._redact_sensitive_payload(db_obj.model_dump(mode="json")),
            actor_id=actor_id,
        )

        session.flush()
        session.refresh(db_obj)
        return db_obj, generated_credentials

    def create_imported_with_generated_credentials(
        self,
        session: Session,
        schema: UserCreate,
        actor_id: UUID | None = None,
    ) -> tuple[User, dict[str, str] | None]:
        normalized_role = self._normalize_role(schema.role)
        
        if self._is_borrower_role(normalized_role):
            generated_login_code = self._generate_import_login_code()
            generated_schema = schema.model_copy(update={"password": generated_login_code})
            created_user, _ = self.create_with_generated_credentials(
                session,
                generated_schema,
                actor_id=actor_id,
            )
            return created_user, {
                "one_time_login_password": generated_login_code,
                "secondary_password": "",
            }
            
        from systems.auth.services.configuration_service import AuthConfigService

        auth_config_service = AuthConfigService()
        self.validate_uniqueness(
            session,
            schema,
            unique_fields=[["email"], ["username"]],
        )

        setting = auth_config_service.get_by_key(
            session,
            key=normalized_role,
            category="users_role"
        )
        if not setting:
            raise ValueError(
                f"Configuration Error: ID prefix for role '{schema.role}' is not defined. "
                f"Please add it to system_settings under category 'users_role'."
            )

        prefix = setting.value
        data = schema.model_dump()
        data["role"] = normalized_role
        data.pop("password", None)
        
        one_time_login_password = self._generate_policy_compliant_password(session, normalized_role, min_length=12)
        secondary_password = self._generate_secondary_password()
        
        data["hashed_password"] = get_password_hash(one_time_login_password)
        data["must_change_password"] = True
        data["password_rotated_at"] = None
        data["recovery_credential_encrypted"] = encrypt_sensitive_value(secondary_password)
        data["recovery_credential_rotated_at"] = get_now_manila()

        if not data.get(self.lookup_field):
            data[self.lookup_field] = get_next_sequence(session, self.model, self.lookup_field, prefix)

        db_obj = self.model(**data)
        session.add(db_obj)

        self._log_audit(
            session=session,
            action="created",
            entity_id=db_obj.user_id,
            after=self._redact_sensitive_payload(db_obj.model_dump(mode="json")),
            actor_id=actor_id,
        )

        session.flush()
        session.refresh(db_obj)
        return db_obj, {
            "one_time_login_password": one_time_login_password,
            "secondary_password": secondary_password,
        }

    def regenerate_import_credentials(
        self,
        session: Session,
        user: User,
        actor_id: UUID | None = None,
    ) -> dict[str, str]:
        before = user.model_dump(mode="json")

        if self._is_borrower_role(user.role):
            generated_login_code = self._generate_import_login_code()
            user.hashed_password = get_password_hash(generated_login_code)
            user.must_change_password = False
            user.password_rotated_at = get_now_manila()
            user.recovery_credential_encrypted = None
            user.recovery_credential_rotated_at = None
            user.updated_at = get_now_manila()
            session.add(user)

            self._log_audit(
                session=session,
                action="import_credentials_regenerated",
                entity_id=user.user_id,
                before=self._redact_sensitive_payload(before),
                after=self._redact_sensitive_payload(user.model_dump(mode="json")),
                actor_id=actor_id,
                reason_code="bulk_import_update_reset",
            )
            session.flush()
            session.refresh(user)
            return {
                "one_time_login_password": generated_login_code,
                "secondary_password": "",
            }

        one_time_login_password = self._generate_policy_compliant_password(session, user.role, min_length=12)
        secondary_password = self._generate_secondary_password()
        
        user.hashed_password = get_password_hash(one_time_login_password)
        user.must_change_password = True
        user.password_rotated_at = None
        user.recovery_credential_encrypted = encrypt_sensitive_value(secondary_password)
        user.recovery_credential_rotated_at = get_now_manila()
        user.updated_at = get_now_manila()
        session.add(user)

        self._log_audit(
            session=session,
            action="import_credentials_regenerated",
            entity_id=user.user_id,
            before=self._redact_sensitive_payload(before),
            after=self._redact_sensitive_payload(user.model_dump(mode="json")),
            actor_id=actor_id,
            reason_code="bulk_import_update_reset",
        )
        session.flush()
        session.refresh(user)
        return {
            "one_time_login_password": one_time_login_password,
            "secondary_password": secondary_password,
        }

    def update(
        self,
        session: Session,
        db_obj: User,
        schema: UserUpdate,
        actor_id: UUID | None = None,
    ) -> User:
        before = db_obj.model_dump(mode="json")
        obj_data = schema.model_dump(exclude_unset=True)
        change_password_requested = obj_data.pop("change_password", False)

        if "role" in obj_data:
            obj_data["role"] = self._normalize_role(obj_data.get("role"))

        if "password" in obj_data:
            password = obj_data.pop("password")

            if not change_password_requested:
                password = None

            if change_password_requested and not password:
                raise HTTPException(
                    status_code=400,
                    detail="Password is required when change_password is true.",
                )

        else:
            password = None

        if password:
            target_role = obj_data.get("role") or db_obj.role
            self.password_policy_service.validate_for_role(session, password, target_role)
            obj_data["hashed_password"] = get_password_hash(password)
            obj_data["password_rotated_at"] = get_now_manila()
            obj_data["must_change_password"] = False

        # Pop non-model fields
        obj_data.pop("current_password", None)

        for key, value in obj_data.items():
            setattr(db_obj, key, value)

        db_obj.updated_at = get_now_manila()
        session.add(db_obj)

        self._log_audit(
            session=session,
            action="updated",
            entity_id=db_obj.user_id,
            before=self._redact_sensitive_payload(before),
            after=self._redact_sensitive_payload(db_obj.model_dump(mode="json")),
            actor_id=actor_id,
        )

        session.flush()
        session.refresh(db_obj)
        return db_obj


    def get_secondary_password(
        self,
        session: Session,
        user: User,
        actor_id: UUID | None = None,
    ) -> str:
        if self._is_borrower_role(user.role):
            raise HTTPException(
                status_code=400,
                detail="Borrower accounts do not use admin recovery credentials.",
            )

        before = user.model_dump(mode="json")
        encrypted_value = user.recovery_credential_encrypted
        action = "secondary_password_retrieved"
        reason_code = "secondary_password_retrieval"

        if not encrypted_value:
            # Legacy non-borrower users can exist without a secondary password.
            # Bootstrap one on first privileged retrieval request.
            secondary_password = self._rotate_secondary_password(user)
            user.updated_at = get_now_manila()
            session.add(user)
            action = "secondary_password_bootstrapped"
            reason_code = "secondary_password_bootstrap"
        else:
            try:
                secondary_password = decrypt_sensitive_value(encrypted_value)
            except ValueError as exc:
                raise HTTPException(
                    status_code=500,
                    detail="Secondary password is unavailable due to a decryption error.",
                ) from exc

        self._log_audit(
            session=session,
            action=action,
            entity_id=user.user_id,
            before=self._redact_sensitive_payload(before),
            after=self._redact_sensitive_payload(user.model_dump(mode="json")),
            actor_id=actor_id,
            reason_code=reason_code,
        )

        return secondary_password

    def get_recovery_credential(
        self,
        session: Session,
        user: User,
        actor_id: UUID | None = None,
    ) -> str:
        # Backward-compatibility wrapper for legacy callers.
        return self.get_secondary_password(session, user, actor_id=actor_id)

    def reset_login_password(
        self,
        session: Session,
        user: User,
        secondary_password: str,
        actor_id: UUID | None = None,
    ) -> tuple[str, str]:
        if self._is_borrower_role(user.role):
            raise HTTPException(
                status_code=400,
                detail="Borrower accounts are not eligible for admin login password reset.",
            )

        if not self._verify_secondary_password(user, secondary_password):
            raise HTTPException(
                status_code=403,
                detail="Invalid secondary password.",
            )

        before = user.model_dump(mode="json")
        new_one_time_password = self._generate_policy_compliant_password(
            session,
            user.role,
            min_length=12,
        )
        new_secondary_password = self._generate_secondary_password()

        user.hashed_password = get_password_hash(new_one_time_password)
        user.must_change_password = True
        user.password_rotated_at = None
        user.recovery_credential_encrypted = encrypt_sensitive_value(new_secondary_password)
        user.recovery_credential_rotated_at = get_now_manila()
        user.updated_at = get_now_manila()
        session.add(user)

        self._log_audit(
            session=session,
            action="login_password_reset",
            entity_id=user.user_id,
            before=self._redact_sensitive_payload(before),
            after=self._redact_sensitive_payload(user.model_dump(mode="json")),
            actor_id=actor_id,
            reason_code="admin_secondary_password_verified_reset",
        )

        session.flush()
        session.refresh(user)
        return new_one_time_password, new_secondary_password
