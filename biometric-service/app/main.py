"""
FastAPI application entrypoint.
Biometric Attendance Microservice for ZKTeco devices.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db, close_db
from app.api.router import api_router
from app.api.websocket import ws_router
from app.services.websocket_manager import manager as ws_manager

settings = get_settings()

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Lifespan ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info("Starting Biometric Attendance Microservice v1.0.0")
    logger.info(f"Service: {settings.service_name} on port {settings.service_port}")

    # Initialize database connection
    try:
        await init_db()
        logger.info("Database connection established")
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down Biometric Attendance Microservice")
    await ws_manager.disconnect_all()
    await close_db()
    logger.info("Shutdown complete")


# ── App Factory ──────────────────────────────────────────────
app = FastAPI(
    title="Biometric Attendance Microservice",
    description=(
        "Standalone microservice for ZKTeco biometric device management, "
        "attendance syncing, real-time monitoring, and automated attendance processing. "
        "Designed to operate independently from Ai-HRMS core."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ───────────────────────────────────────────────────
app.include_router(api_router, prefix="/api/v1")
app.include_router(ws_router)


# ── Health Check ─────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    """Service health check endpoint."""
    return {
        "status": "healthy",
        "service": settings.service_name,
        "version": "1.0.0",
    }


@app.get("/", tags=["Health"])
async def root():
    """Root endpoint with service information."""
    return {
        "service": "Biometric Attendance Microservice",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


# ── Run (dev) ────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.service_host,
        port=settings.service_port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
