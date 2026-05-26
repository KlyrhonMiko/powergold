"""add user import history table

Revision ID: a8d9e1f2b3c4
Revises: f6b2c1d4e8a9
Create Date: 2026-05-26 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "a8d9e1f2b3c4"
down_revision: Union[str, Sequence[str], None] = "f6b2c1d4e8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_import_history",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("retention_tags", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False),
        sa.Column("success_count", sa.Integer(), nullable=False),
        sa.Column("error_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("error_log", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_import_history_is_archived"), "user_import_history", ["is_archived"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_import_history_is_archived"), table_name="user_import_history")
    op.drop_table("user_import_history")
