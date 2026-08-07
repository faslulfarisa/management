"""
Application configuration using Pydantic BaseSettings.
All settings are loaded from environment variables or .env file.
"""

from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for the biometric attendance microservice."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Service ──────────────────────────────────────────────
    service_host: str = "0.0.0.0"
    service_port: int = 8100
    debug: bool = False
    log_level: str = "INFO"
    service_name: str = "biometric-attendance-service"
    environment: str = "development"

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
    inbound_api_keys: str = ""
    require_request_signatures: bool = False
    request_signature_secret: str = ""
    request_timestamp_tolerance_seconds: int = 300
    replay_nonce_ttl_seconds: int = 600

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
    # ── CORS ─────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000,http://localhost:3001"

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, str) and value.lower() in {"release", "prod", "production"}:
            return False
        return value

    @property
    def cors_origin_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def accepted_inbound_api_keys(self) -> List[str]:
        """API keys accepted by this adapter for NestJS/admin calls."""
        configured = [key.strip() for key in self.inbound_api_keys.split(",") if key.strip()]
        return configured or [self.hms_api_key]

    @property
    def effective_signature_secret(self) -> str:
        """Shared HMAC secret. Defaults to the legacy HMS API key for compatibility."""
        return self.request_signature_secret or self.hms_api_key

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}


DEFAULT_API_KEYS = {
    "",
    "biometric-service-key-change-in-production",
    "change-me",
    "changeme",
    "default",
}


def validate_startup_security(settings: Settings) -> None:
    """Fail fast when production security settings are unsafe."""
    keys = settings.accepted_inbound_api_keys
    unsafe_keys = [key for key in keys if key.strip().lower() in DEFAULT_API_KEYS or len(key.strip()) < 24]
    if settings.is_production and unsafe_keys:
        raise RuntimeError("Unsafe biometric service API key configuration")

    if settings.is_production and settings.hms_api_key.strip().lower() in DEFAULT_API_KEYS:
        raise RuntimeError("HRMS callback API key must be configured for production")

    if settings.is_production and not settings.require_request_signatures:
        raise RuntimeError("Request signatures must be required in production")

    if settings.is_production and len(settings.effective_signature_secret.strip()) < 32:
        raise RuntimeError("Request signature secret must be at least 32 characters in production")


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
