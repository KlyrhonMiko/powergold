from uuid import UUID

from sqlalchemy import JSON
from sqlmodel import Column, Field

from core.base_model import BaseModel


class UserImportHistory(BaseModel, table=True):
    __tablename__ = "user_import_history"

    filename: str = Field(max_length=255)
    actor_id: UUID = Field(foreign_key="users.id")
    total_rows: int = Field(default=0)
    success_count: int = Field(default=0)
    error_count: int = Field(default=0)
    status: str = Field(max_length=50)
    error_log: dict | list = Field(default_factory=dict, sa_column=Column(JSON))
    credentials_log: dict | list = Field(default_factory=list, sa_column=Column(JSON))
