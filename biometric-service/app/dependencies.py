"""
FastAPI dependency injection providers.
Centralizes all injectable dependencies for route handlers.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.config import Settings, get_settings


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide a transactional database session per request.
    Commits on success, rolls back on exception.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def get_config() -> Settings:
    """Provide application settings."""
    return get_settings()
