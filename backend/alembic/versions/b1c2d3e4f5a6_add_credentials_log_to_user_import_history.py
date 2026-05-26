"""add credentials log to user import history

Revision ID: b1c2d3e4f5a6
Revises: a8d9e1f2b3c4
Create Date: 2026-05-26 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a8d9e1f2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_import_history", sa.Column("credentials_log", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_import_history", "credentials_log")
