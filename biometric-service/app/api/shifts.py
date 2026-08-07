"""
Shift Rules API Routes.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.models.shift_rule import ShiftRule
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
    """List shift rules for a tenant."""
    query = select(ShiftRule).where(ShiftRule.tenant_id == tenant_id)
    if is_active is not None:
        query = query.where(ShiftRule.is_active == is_active)
        
    query = query.order_by(ShiftRule.name)
    result = await session.execute(query)
    shifts = list(result.scalars().all())
    
    return {
        "success": True,
        "data": shifts,
        "total": len(shifts)
    }


@router.post("", response_model=ShiftRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(
    data: ShiftRuleCreate,
    session: AsyncSession = Depends(get_session),
):
    """Create a new shift rule."""
    existing = await session.execute(
        select(ShiftRule).where(
            ShiftRule.tenant_id == data.tenant_id,
            ShiftRule.code == data.code
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Shift code must be unique")
        
    shift = ShiftRule(**data.model_dump())
    session.add(shift)
    await session.flush()
    return shift


@router.put("/{shift_id}", response_model=ShiftRuleResponse)
async def update_shift(
    shift_id: uuid.UUID,
    data: ShiftRuleUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Update a shift rule."""
    result = await session.execute(
        select(ShiftRule).where(ShiftRule.id == shift_id)
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
        
    update_data = data.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(shift, k, v)
        
    await session.flush()
    return shift


@router.delete("/{shift_id}")
async def delete_shift(
    shift_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Soft delete a shift rule."""
    result = await session.execute(
        select(ShiftRule).where(ShiftRule.id == shift_id)
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
        
    shift.is_active = False
    await session.flush()
    return {"success": True, "message": "Shift rule deactivated"}
