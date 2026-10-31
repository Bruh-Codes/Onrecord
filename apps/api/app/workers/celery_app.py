from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery("sme_api", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_always_eager = settings.task_always_eager
celery_app.conf.task_store_eager_result = settings.task_always_eager

# Connected spreadsheets are checked by a sweep. Run the worker with --beat
# (one worker only) so this schedule fires; Sync now works without it.
celery_app.conf.beat_schedule = {
    "sheets-sync-due": {"task": "sheets.sync_due", "schedule": 300.0},
}

# Import tasks so Celery registers them.
import app.workers.tasks  # noqa: F401, E402
import app.workers.sheet_tasks  # noqa: F401, E402
