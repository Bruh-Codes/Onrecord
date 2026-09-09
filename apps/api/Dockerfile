# One image, two entrypoints (Agent.md §4). The API runs:
#   uvicorn app.api.main:app --host 0.0.0.0 --port 8000
# The worker runs:
#   celery -A app.workers.celery_app worker --loglevel INFO
# docker-compose.yml (repo root, once added) picks the command per service.

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

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.api.main:app --host 0.0.0.0 --port 8000"]
