"""Add caller_id to campaigns

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b6
Create Date: 2026-05-11 20:05:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "d4e5f6a7b8c9"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("campaigns", schema=None) as batch_op:
        batch_op.add_column(sa.Column("caller_id", sa.String(length=40), nullable=True))


def downgrade():
    with op.batch_alter_table("campaigns", schema=None) as batch_op:
        batch_op.drop_column("caller_id")
