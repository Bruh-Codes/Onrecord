from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery("sme_api", broker=settings.redis_url, backend=settings.redis_url)

# Import tasks so Celery registers them.
import app.workers.tasks  # noqa: F401, E402