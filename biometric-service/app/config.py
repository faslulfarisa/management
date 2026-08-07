"""
Application configuration using Pydantic BaseSettings.
All settings are loaded from environment variables or .env file.
"""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for the biometric attendance microservice."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Service ──────────────────────────────────────────────
    service_host: str = "0.0.0.0"
    service_port: int = 8100
    debug: bool = False
    log_level: str = "INFO"
    service_name: str = "biometric-attendance-service"

    # ── Database ─────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://biometric_user:biometric_pass@localhost:5432/biometric_db"
    sync_database_url: str = "postgresql://biometric_user:biometric_pass@localhost:5432/biometric_db"
    database_echo: bool = False
    database_pool_size: int = 20
    database_max_overflow: int = 10

    # ── Redis ────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/1"

    # ── Ai-HRMS Integration ──────────────────────────────────
    hms_base_url: str = "http://localhost:3001/api"
    hms_api_key: str = "biometric-service-key-change-in-production"
    hms_callback_enabled: bool = True

    # ── pyzk Device Defaults ─────────────────────────────────
    pyzk_connect_timeout: int = 10
    pyzk_read_timeout: int = 30
    pyzk_max_retries: int = 3
    pyzk_default_port: int = 4370

    # ── Sync Schedule (seconds) ──────────────────────────────
    sync_interval_seconds: int = 300
    heartbeat_interval_seconds: int = 120
    process_interval_seconds: int = 180

    # ── Attendance Engine ────────────────────────────────────
    duplicate_punch_threshold_minutes: int = 2
    default_grace_period_minutes: int = 15
    default_overtime_threshold_minutes: int = 30
    default_half_day_threshold_minutes: int = 240
    default_min_work_hours: float = 8.0

    # ── CORS ─────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000,http://localhost:3001"

    @property
    def cors_origin_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
