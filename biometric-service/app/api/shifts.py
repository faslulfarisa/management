"""
Shift Rules API Routes.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.shift import (
    ShiftRuleCreate,
    ShiftRuleUpdate,
    ShiftRuleResponse,
    ShiftRuleListResponse,
)

router = APIRouter()


@router.get("", response_model=ShiftRuleListResponse)
async def list_shifts(
    tenant_id: uuid.UUID = Query(...),
    is_active: Optional[bool] = None,
    session: AsyncSession = Depends(get_session),
):
    """Deprecated compatibility endpoint. Shifts are owned by NestJS HRMS."""
    raise HTTPException(status_code=410, detail="Shift rules are managed by NestJS HRMS")


@router.post("", response_model=ShiftRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(
    data: ShiftRuleCreate,
    session: AsyncSession = Depends(get_session),
):
    """Deprecated compatibility endpoint. Shifts are owned by NestJS HRMS."""
    raise HTTPException(status_code=410, detail="Shift rules are managed by NestJS HRMS")


@router.put("/{shift_id}", response_model=ShiftRuleResponse)
async def update_shift(
    shift_id: uuid.UUID,
    data: ShiftRuleUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Deprecated compatibility endpoint. Shifts are owned by NestJS HRMS."""
    raise HTTPException(status_code=410, detail="Shift rules are managed by NestJS HRMS")


@router.delete("/{shift_id}")
async def delete_shift(
    shift_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Deprecated compatibility endpoint. Shifts are owned by NestJS HRMS."""
    raise HTTPException(status_code=410, detail="Shift rules are managed by NestJS HRMS")
