"""
Celery Application instance and scheduler configuration.
"""

from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "biometric_tasks",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.sync_tasks",
        "app.tasks.heartbeat_tasks",
    ],
)

# Celery Configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_concurrency=4,
    worker_max_tasks_per_child=100,
)

# Beat Scheduler Configuration
celery_app.conf.beat_schedule = {
    # ── Device Sync ───────────────────────────────────────────
    "sync-all-devices": {
        "task": "app.tasks.sync_tasks.sync_all_devices_task",
        "schedule": settings.sync_interval_seconds,
    },
    "retry-failed-syncs": {
        "task": "app.tasks.sync_tasks.retry_failed_syncs_task",
        "schedule": crontab(minute="*/15"),
    },
    "retry-unforwarded-punches": {
        "task": "app.tasks.sync_tasks.retry_unforwarded_punches_task",
        "schedule": crontab(minute="*/5"),
    },

    # ── Heartbeat ─────────────────────────────────────────────
    "check-device-heartbeats": {
        "task": "app.tasks.heartbeat_tasks.check_heartbeats_task",
        "schedule": settings.heartbeat_interval_seconds,
    },
}
