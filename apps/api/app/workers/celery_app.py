from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery("sme_api", broker=settings.redis_url, backend=settings.redis_url)


@celery_app.task(name="ping")
def ping() -> str:
    """Proves the worker entrypoint boots and can reach Redis. The real S1-S10
    pipeline tasks land in app/workers/tasks.py once each stage is built."""
    return "pong"
