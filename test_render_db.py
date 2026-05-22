import os
from sqlalchemy import create_engine, MetaData, Table, select

regions = ["oregon-postgres.render.com", "singapore-postgres.render.com", "frankfurt-postgres.render.com", "ohio-postgres.render.com"]

for region in regions:
    db_url = f"postgresql://ai_voice_calling_db_user:6G9yRTmaPXXEOLguD7ZJnl03B1DWt3nW@dpg-d885kh99rddc73b6cntg-a.{region}/ai_voice_calling_db"
    print(f"\nTrying to connect to Render DB in region: {region}...")
    try:
        engine = create_engine(db_url, connect_args={"connect_timeout": 5})
        metadata = MetaData()
        metadata.reflect(bind=engine)
        print(f"SUCCESS! Connected to {region}.")
        
        if 'call_log' in metadata.tables:
            call_log = metadata.tables['call_log']
            with engine.connect() as conn:
                stmt = select(call_log).order_by(call_log.c.created_at.desc()).limit(5)
                results = conn.execute(stmt).fetchall()
                print("\nLatest 5 Call Logs from Render:")
                for row in results:
                    row_dict = dict(zip(call_log.columns.keys(), row))
                    print(f"--- Call Log ID: {row_dict.get('id')} ---")
                    print(f"  Created At: {row_dict.get('created_at')}")
                    print(f"  Call SID: {row_dict.get('call_sid')}")
                    print(f"  Status: {row_dict.get('status')}")
                    print(f"  Duration: {row_dict.get('duration_seconds')}s")
                    print(f"  Recording URL: {row_dict.get('recording_url')}")
                    print(f"  Conversation: {row_dict.get('conversation')}")
                    print(f"  Tags: {row_dict.get('tags')}")
        break
    except Exception as e:
        print(f"Failed connection: {e}")
