with open("render_debug.log", "r", encoding="utf-8") as f:
    content = f.read()

import re
tracebacks = re.findall(r'Traceback.*?(?=(?:Traceback|Connecting to Render DB|$))', content, re.DOTALL)
print(f"Total tracebacks found: {len(tracebacks)}")

for i, tb in enumerate(tracebacks[-5:]): # print last 5 tracebacks
    print(f"\n=== Traceback {i+1} ===")
    print(tb[:2000]) # print first 2000 chars of each traceback
