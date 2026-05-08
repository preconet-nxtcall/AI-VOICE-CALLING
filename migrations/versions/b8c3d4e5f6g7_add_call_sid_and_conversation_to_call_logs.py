"""Add call_sid and conversation to call_logs

Revision ID: b8c3d4e5f6g7
Revises: a7b2c3d4e5f6
Create Date: 2026-05-08 11:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8c3d4e5f6g7'
down_revision = 'a7b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # Use batch_alter_table for SQLite compatibility, though user is on Postgres
    with op.batch_alter_table('call_logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('call_sid', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('conversation', sa.JSON(), nullable=True))
        batch_op.create_index(batch_op.f('ix_call_logs_call_sid'), ['call_sid'], unique=True)


def downgrade():
    with op.batch_alter_table('call_logs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_call_logs_call_sid'))
        batch_op.drop_column('conversation')
        batch_op.drop_column('call_sid')
