import os
from sqlalchemy import create_engine, MetaData, Table, select

db_url = "postgresql://ai_voice_calling_user:KUAWPmFAhXjggtKiEUEUnww8hIBTYs3w@dpg-d7sssk67r5hc738j8ogg-a.oregon-postgres.render.com/ai_voice_calling"
print(f"Connecting to Render DB: {db_url}")

try:
    engine = create_engine(db_url)
    metadata = MetaData()
    metadata.reflect(bind=engine)
    
    if 'call_logs' in metadata.tables:
        call_logs = metadata.tables['call_logs']
        with engine.connect() as conn:
            stmt = select(call_logs).order_by(call_logs.c.created_at.desc()).limit(10)
            results = conn.execute(stmt).fetchall()
            print(f"\nLatest {len(results)} Call Logs:")
            for row in results:
                row_dict = dict(zip(call_logs.columns.keys(), row))
                print(f"ID: {row_dict.get('id')} | Created: {row_dict.get('created_at')} | Status: {row_dict.get('status')} | Duration: {row_dict.get('duration_seconds')}s")
                print(f"  Call SID: {row_dict.get('call_sid')} | KB ID: {row_dict.get('knowledge_base_id')}")
                print(f"  Conversation: {row_dict.get('conversation')}")
                print(f"  Tags: {row_dict.get('tags')}")
                print("-" * 50)
                
    if 'leads' in metadata.tables:
        leads = metadata.tables['leads']
        with engine.connect() as conn:
            stmt = select(leads).order_by(leads.c.created_at.desc()).limit(10)
            results = conn.execute(stmt).fetchall()
            print(f"\nLatest {len(results)} Leads:")
            for row in results:
                row_dict = dict(zip(leads.columns.keys(), row))
                print(f"ID: {row_dict.get('id')} | Phone: {row_dict.get('phone_number')} | Status: {row_dict.get('status')} | SID: {row_dict.get('call_sid')}")
                print(f"  Name: {row_dict.get('first_name')} {row_dict.get('last_name')}")
                print("-" * 50)

except Exception as e:
    print(f"Error querying database: {e}")
