from app.app import create_app
from app.celery_app import create_celery
from app.tasks.dialer_tasks import register_dialer_tasks

flask_app = create_app()
celery = create_celery(flask_app)
register_dialer_tasks(celery)
