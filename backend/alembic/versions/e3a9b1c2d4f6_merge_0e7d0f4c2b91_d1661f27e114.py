"""merge 0e7d0f4c2b91 and d1661f27e114

Revision ID: e3a9b1c2d4f6
Revises: 0e7d0f4c2b91, d1661f27e114
Create Date: 2026-05-18 17:10:00.000000
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "e3a9b1c2d4f6"
down_revision: Union[str, Sequence[str], None] = ("0e7d0f4c2b91", "d1661f27e114")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Merge migration — no schema changes."""
    pass


def downgrade() -> None:
    pass
