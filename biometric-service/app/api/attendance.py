"""
Attendance Data API Routes.
"""

import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.models.attendance_log import AttendanceLog
from app.schemas.attendance import (
    ProcessRequest,
    ProcessResponse,
)

router = APIRouter()


@router.post("/process", response_model=ProcessResponse)
async def process_attendance(
    request: ProcessRequest,
):
    """
    Deprecated compatibility endpoint.

    The Python service is a device adapter only. Attendance processing belongs
    exclusively to the NestJS HRMS backend.
    """
    raise HTTPException(
        status_code=410,
        detail="Attendance processing is handled by the NestJS HRMS attendance engine",
    )


@router.get("/sessions")
async def get_sessions(
    tenant_id: uuid.UUID = Query(...),
    employee_id: Optional[uuid.UUID] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """Deprecated compatibility endpoint for processed attendance sessions."""
    raise HTTPException(
        status_code=410,
        detail="Processed attendance sessions are owned by the NestJS HRMS attendance engine",
    )


@router.get("/logs")
async def get_raw_logs(
    tenant_id: uuid.UUID = Query(...),
    employee_id: Optional[uuid.UUID] = None,
    device_id: Optional[uuid.UUID] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
):
    """Get raw device punches."""
    query = select(AttendanceLog).where(AttendanceLog.tenant_id == tenant_id)
    
    if employee_id:
        query = query.where(AttendanceLog.employee_id == employee_id)
    if device_id:
        query = query.where(AttendanceLog.device_id == device_id)
        
    from sqlalchemy import func
    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar() or 0
    
    query = query.order_by(AttendanceLog.punch_time.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await session.execute(query)
    logs = list(result.scalars().all())
    
    return {
        "success": True,
        "data": logs,
        "total": total,
        "page": page,
        "limit": limit
    }
