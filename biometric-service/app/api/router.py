"""
API Router Aggregator.
Includes all feature routers under a common /api/v1 prefix.
"""

from fastapi import APIRouter, Depends

from app.api import devices
from app.api import employees
from app.api import attendance
from app.api import shifts
from app.api import sync
from app.security import verify_service_request

api_router = APIRouter(dependencies=[Depends(verify_service_request)])

api_router.include_router(devices.router, prefix="/devices", tags=["Devices"])
api_router.include_router(employees.router, prefix="/employees", tags=["Employees"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["Attendance"])
api_router.include_router(shifts.router, prefix="/shifts", tags=["Shifts"])
api_router.include_router(sync.router, prefix="/sync", tags=["Synchronization"])
