FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (needed for compiling asyncpg/psycopg2 if no binary available)
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Expose FastAPI port
EXPOSE 8100

# Default command (can be overridden for Celery workers)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
