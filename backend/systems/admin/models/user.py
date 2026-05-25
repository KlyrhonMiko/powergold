import random
import string
from datetime import datetime

from sqlalchemy import Index, text
from sqlmodel import Field

from core.base_model import BaseModel


def _generate_user_id(prefix: str = "USER") -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"{prefix}-{suffix}"


class User(BaseModel, table=True):
    __tablename__ = "users"

    user_id: str = Field(
        default_factory=_generate_user_id,
        unique=True,
        index=True,
        max_length=20,
    )
    last_name: str = Field(max_length=100)
    first_name: str = Field(max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)

    email: str | None = Field(default=None, index=True, max_length=255)
    contact_number: str | None = Field(default=None, max_length=20)

    username: str = Field(index=True, max_length=50)
    hashed_password: str = Field(max_length=255)

    role: str = Field(max_length=50)
    employee_id: str | None = Field(default=None, index=True, max_length=50)
    shift_type: str = Field(default="day", max_length=20)
    must_change_password: bool = Field(default=False, nullable=False)
    password_rotated_at: datetime | None = Field(default=None, nullable=True)
    recovery_credential_encrypted: str | None = Field(
        default=None,
        max_length=1024,
        nullable=True,
    )
    recovery_credential_rotated_at: datetime | None = Field(default=None, nullable=True)

    @property
    def full_name(self) -> str:
        if self.middle_name:
            return f"{self.first_name} {self.middle_name} {self.last_name}"
        return f"{self.first_name} {self.last_name}"

    __table_args__ = (
        Index(
            "ix_user_username_active",
            "username",
            unique=True,
            postgresql_where=text("is_deleted IS FALSE"),
        ),
        Index(
            "ix_user_email_active",
            "email",
            unique=True,
            postgresql_where=text("is_deleted IS FALSE"),
        ),
        Index(
            "ix_user_employee_id_active",
            "employee_id",
            unique=True,
            postgresql_where=text("is_deleted IS FALSE"),
        ),
    )
