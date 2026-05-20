import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

db_url = os.environ.get("DATABASE_URL")
print(f"Connecting to: {db_url}")

try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id, status, error_message, created_at FROM ingestion_jobs ORDER BY created_at DESC LIMIT 5"))
        jobs = result.fetchall()
        print(f"Last 5 ingestion jobs:")
        for job in jobs:
            print(f"ID: {job[0]}, Status: {job[1]}, Error: {job[2]}, Created: {job[3]}")
except Exception as e:
    print(f"Error: {e}")
