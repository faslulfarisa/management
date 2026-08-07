"""
Attendance Data API Routes.
"""

import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.database import get_session
from app.models.attendance_log import AttendanceLog
from app.models.attendance_session import AttendanceSession
from app.models.employee import BiometricEmployee
from app.schemas.attendance import (
    ProcessRequest,
    ProcessResponse,
    AttendanceReportRequest,
    AttendanceReportResponse,
)
from app.services.attendance_engine import AttendanceEngine

router = APIRouter()


@router.post("/process", response_model=ProcessResponse)
async def process_attendance(
    request: ProcessRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Trigger the attendance processing engine manually.
    Usually runs via Celery, but this allows on-demand processing.
    """
    engine = AttendanceEngine(session)
    
    # Process specific employee/date if provided, else all unprocessed
    if request.employee_id and request.date:
        try:
            await engine.process_employee_day(request.employee_id, request.date)
            return {
                "success": True, 
                "processed": 1, 
                "errors": 0,
                "message": "Processed successfully"
            }
        except Exception as e:
            return {
                "success": False,
                "processed": 0,
                "errors": 1,
                "message": str(e)
            }
    else:
        # Process all pending for tenant
        result = await engine.process_unprocessed_punches(request.tenant_id)
        return {
            "success": True,
            "processed": result["processed"],
            "errors": result["errors"],
            "message": f"Processed {result['processed']} records"
        }


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
    """Get processed attendance sessions."""
    query = select(AttendanceSession, BiometricEmployee).join(
        BiometricEmployee, AttendanceSession.employee_id == BiometricEmployee.id
    ).where(AttendanceSession.tenant_id == tenant_id)
    
    if employee_id:
        query = query.where(AttendanceSession.employee_id == employee_id)
    if start_date:
        query = query.where(AttendanceSession.date >= start_date)
    if end_date:
        query = query.where(AttendanceSession.date <= end_date)
        
    from sqlalchemy import func
    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar() or 0
    
    query = query.order_by(AttendanceSession.date.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await session.execute(query)
    
    sessions_with_details = []
    for att_session, emp in result.all():
        data = att_session.__dict__.copy()
        data["employee_code"] = emp.employee_code
        data["employee_name"] = emp.full_name
        sessions_with_details.append(data)
        
    return {
        "success": True,
        "data": sessions_with_details,
        "total": total,
        "page": page,
        "limit": limit
    }


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
