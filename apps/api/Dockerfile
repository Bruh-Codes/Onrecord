# One image, two entrypoints (Agent.md §4). The API runs:
#   uvicorn app.api.main:app --host 0.0.0.0 --port 8000
# The worker runs:
#   celery -A app.workers.celery_app worker --loglevel INFO
# docker-compose.yml (repo root, once added) picks the command per service.

# syntax=docker/dockerfile:1.7

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libxcb1 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

RUN pip install --no-cache-dir .

# Mount a Railway volume at this path on the worker to persist Docling and
# Hugging Face model downloads across worker restarts.
ENV HF_HOME=/root/.cache/huggingface

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.api.main:app --host 0.0.0.0 --port 8000"]
