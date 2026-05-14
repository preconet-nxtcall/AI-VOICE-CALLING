from app.app import create_app
from app.models.knowledge_base import KnowledgeBase

app = create_app()
with app.app_context():
    kbs = KnowledgeBase.query.all()
    for kb in kbs:
        print(f"ID: {kb.id}, Name: {kb.name}")
