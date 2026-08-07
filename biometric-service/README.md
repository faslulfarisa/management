# Biometric Attendance Microservice

A standalone, production-grade microservice built with FastAPI, PostgreSQL, Redis, and Celery for managing ZKTeco biometric devices and processing attendance.

## Features
- **Standalone Architecture:** Runs independently with its own database, preventing tight coupling with the Ai-HRMS core.
- **Dual Device Modes:** Supports both pyzk (PULL mode over TCP) and ADMS (PUSH mode over HTTP).
- **Attendance Engine:** Sophisticated processing pipeline handling duplicates, shifts, overnight boundaries, grace periods, and overtime calculation.
- **Real-time WebSockets:** Live attendance feeds for the dashboard.
- **Background Jobs:** Celery-powered periodic syncing, retries, and device heartbeat monitoring.
- **Ai-HRMS Integration:** Automatically pushes processed attendance sessions back to the main Ai-HRMS core via REST callback.

## Quick Start (Docker)

1. Clone the repository
2. Copy `.env.example` to `.env`
3. Run `docker-compose up -d`
4. Access the API at `http://localhost:8100/docs`

## Local Development (Without Docker)

### Prerequisites
- Python 3.11+
- PostgreSQL
- Redis

### Setup
```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate  # Or `venv\Scripts\activate` on Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Setup configuration
cp .env.example .env

# 4. Run database migrations
alembic upgrade head

# 5. Start FastAPI server
uvicorn app.main:app --reload --port 8100

# 6. Start Celery worker (in a new terminal)
celery -A app.tasks.celery_app worker --loglevel=info

# 7. Start Celery beat scheduler (in a new terminal)
celery -A app.tasks.celery_app beat --loglevel=info
```

## Integration with Ai-HRMS Core

This microservice communicates with the Ai-HRMS core in two ways:
1. **Device PUSH (ADMS):** Devices pushing directly to Ai-HRMS core can still be processed here if the HTTP payloads are forwarded or if they push directly to this service's endpoints.
2. **Attendance Callback:** When the attendance engine finishes processing a shift session, it POSTs the results back to the HRMS core at `HMS_BASE_URL/integrations/zkteco/punch`.
