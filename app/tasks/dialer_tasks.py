import logging

from app.services.dialer_worker import dialer_sweep_once

logger = logging.getLogger("dialer-tasks")


def register_dialer_tasks(celery):
    @celery.task(
        name="dialer.sweep_once",
        bind=True,
        autoretry_for=(Exception,),
        retry_backoff=bool(celery.conf.get("CELERY_DIALER_RETRY_BACKOFF", True)),
        retry_backoff_max=int(celery.conf.get("CELERY_DIALER_RETRY_BACKOFF_MAX", 120)),
        retry_jitter=bool(celery.conf.get("CELERY_DIALER_RETRY_JITTER", True)),
        max_retries=int(celery.conf.get("CELERY_DIALER_MAX_RETRIES", 8)),
    )
    def sweep_once() -> dict:
        result = dialer_sweep_once()
        logger.debug("dialer.sweep_once result=%s", result)
        return result

    return sweep_once
