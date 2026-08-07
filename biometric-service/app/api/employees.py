"""
Employee Management API Routes.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.models.employee import BiometricEmployee
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeeListResponse,
    BulkEmployeeMap,
)

router = APIRouter()


@router.get("", response_model=EmployeeListResponse)
async def list_employees(
    tenant_id: uuid.UUID = Query(...),
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """List biometric employees."""
    query = select(BiometricEmployee).where(BiometricEmployee.tenant_id == tenant_id)
    
    if is_active is not None:
        query = query.where(BiometricEmployee.is_active == is_active)
    if search:
        query = query.where(BiometricEmployee.full_name.ilike(f"%{search}%"))
        
    from sqlalchemy import func
    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar() or 0
    
    query = query.order_by(BiometricEmployee.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await session.execute(query)
    employees = list(result.scalars().all())
    
    return {
        "success": True,
        "data": employees,
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def register_employee(
    data: EmployeeCreate,
    session: AsyncSession = Depends(get_session),
):
    """Register an employee for biometric attendance."""
    # Check if employee code already exists for this tenant
    existing = await session.execute(
        select(BiometricEmployee).where(
            BiometricEmployee.tenant_id == data.tenant_id,
            BiometricEmployee.employee_code == data.employee_code
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Employee code {data.employee_code} already registered"
        )
        
    employee = BiometricEmployee(
        tenant_id=data.tenant_id,
        hms_employee_id=data.hms_employee_id,
        employee_code=data.employee_code,
        full_name=data.full_name,
        device_user_id=data.device_user_id,
        card_number=data.card_number,
        devices=data.devices or []
    )
    session.add(employee)
    await session.flush()
    return employee


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: uuid.UUID,
    data: EmployeeUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Update employee biometric mapping."""
    result = await session.execute(
        select(BiometricEmployee).where(BiometricEmployee.id == employee_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    update_data = data.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(employee, k, v)
        
    await session.flush()
    return employee


@router.post("/bulk-map")
async def bulk_map_employees(
    data: BulkEmployeeMap,
    session: AsyncSession = Depends(get_session),
):
    """Assign multiple employees to multiple devices."""
    result = await session.execute(
        select(BiometricEmployee).where(
            BiometricEmployee.tenant_id == data.tenant_id,
            BiometricEmployee.id.in_(data.employee_ids)
        )
    )
    employees = result.scalars().all()
    
    for emp in employees:
        current_devices = set(emp.devices or [])
        new_devices = set(data.device_ids)
        emp.devices = list(current_devices.union(new_devices))
        
    await session.flush()
    
    return {
        "success": True,
        "message": f"Successfully mapped {len(employees)} employees to devices"
    }
