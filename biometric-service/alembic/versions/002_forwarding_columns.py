"""add is_forwarded and forwarded_at to attendance_logs

Revision ID: 002
Revises: 001
Create Date: 2026-05-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'attendance_logs',
        sa.Column(
            'is_forwarded',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
            comment='Whether this punch has been forwarded to NestJS /biometrics/punch',
        ),
    )
    op.add_column(
        'attendance_logs',
        sa.Column(
            'forwarded_at',
            sa.DateTime(timezone=True),
            nullable=True,
            comment='Timestamp when the punch was successfully forwarded to NestJS',
        ),
    )
    op.create_index(
        'ix_attendance_logs_is_forwarded',
        'attendance_logs',
        ['is_forwarded'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_attendance_logs_is_forwarded', table_name='attendance_logs')
    op.drop_column('attendance_logs', 'forwarded_at')
    op.drop_column('attendance_logs', 'is_forwarded')
