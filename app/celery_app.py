from celery import Celery
from celery.schedules import schedule


def create_celery(flask_app):
    celery = Celery(
        flask_app.import_name,
        broker=flask_app.config["CELERY_BROKER_URL"],
        backend=flask_app.config["CELERY_RESULT_BACKEND"],
    )
    celery.conf.update(flask_app.config)
    dialer_queue = flask_app.config.get("CELERY_TASK_DIALER_QUEUE", "dialer")
    default_queue = flask_app.config.get("CELERY_TASK_DEFAULT_QUEUE", "default")
    sweep_interval = max(int(flask_app.config.get("DIALER_SWEEP_TASK_INTERVAL_SECONDS", 15)), 5)

    celery.conf.task_default_queue = default_queue
    celery.conf.task_routes = {
        "dialer.sweep_once": {"queue": dialer_queue},
    }
    celery.conf.task_acks_late = bool(flask_app.config.get("CELERY_TASK_ACKS_LATE", True))
    celery.conf.worker_prefetch_multiplier = max(
        int(flask_app.config.get("CELERY_WORKER_PREFETCH_MULTIPLIER", 1)), 1
    )
    celery.conf.task_time_limit = max(int(flask_app.config.get("CELERY_TASK_TIME_LIMIT", 90)), 30)
    celery.conf.task_soft_time_limit = max(
        int(flask_app.config.get("CELERY_TASK_SOFT_TIME_LIMIT", 60)), 15
    )
    celery.conf.broker_connection_retry_on_startup = bool(
        flask_app.config.get("CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP", True)
    )
    celery.conf.beat_schedule = {
        "dialer-sweep-every-n-seconds": {
            "task": "dialer.sweep_once",
            "schedule": schedule(run_every=sweep_interval),
        }
    }

    class FlaskTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with flask_app.app_context():
                return self.run(*args, **kwargs)

    celery.Task = FlaskTask
    return celery
