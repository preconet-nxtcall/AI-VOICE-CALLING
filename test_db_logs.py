import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, MetaData, Table, select

load_dotenv(override=True)

db_url = os.environ.get("DATABASE_URL")
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

print(f"Connecting to database: {db_url}")

try:
    engine = create_engine(db_url)
    metadata = MetaData()
    metadata.reflect(bind=engine)
    
    print("Tables found:")
    for table_name in metadata.tables.keys():
        print(f"  - {table_name}")
        
    if 'call_log' in metadata.tables:
        call_log = metadata.tables['call_log']
        with engine.connect() as conn:
            # Query latest 5 call logs
            stmt = select(call_log).order_by(call_log.c.created_at.desc()).limit(5)
            results = conn.execute(stmt).fetchall()
            print("\nLatest 5 Call Logs:")
            for row in results:
                # print keys and values
                row_dict = dict(zip(call_log.columns.keys(), row))
                print(f"--- Call Log ID: {row_dict.get('id')} ---")
                print(f"  Created At: {row_dict.get('created_at')}")
                print(f"  Call SID: {row_dict.get('call_sid')}")
                print(f"  Status: {row_dict.get('status')}")
                print(f"  Duration: {row_dict.get('duration_seconds')}s")
                print(f"  Recording URL: {row_dict.get('recording_url')}")
                print(f"  Conversation: {row_dict.get('conversation')}")
                print(f"  Tags: {row_dict.get('tags')}")
    else:
        print("\nTable 'call_log' not found in metadata.")
        
    if 'lead' in metadata.tables:
        lead = metadata.tables['lead']
        with engine.connect() as conn:
            stmt = select(lead).order_by(lead.c.created_at.desc()).limit(5)
            results = conn.execute(stmt).fetchall()
            print("\nLatest 5 Leads:")
            for row in results:
                row_dict = dict(zip(lead.columns.keys(), row))
                print(f"--- Lead ID: {row_dict.get('id')} ---")
                print(f"  Phone: {row_dict.get('phone_number')}")
                print(f"  Status: {row_dict.get('status')}")
                print(f"  Call SID: {row_dict.get('call_sid')}")
                print(f"  Name: {row_dict.get('first_name')} {row_dict.get('last_name')}")

except Exception as e:
    print(f"Error querying database: {e}")
