import websocket
import json

ws = websocket.WebSocket()
try:
    ws.connect('ws://localhost:5000/voice/voicelink-stream')
    print('Connected')
    
    ws.send(json.dumps({'event': 'connected', 'protocol': 'voicelink', 'version': '1.0'}))
    print('Sent connected')
    
    start_event = {
        'event': 'start',
        'streamSid': 'test_stream_sid',
        'start': {
            'callSid': 'test_call_sid',
            'customParameters': json.dumps({'kb_id': '00000000-0000-0000-0000-000000000000', 'temp_call_sid': 'vl_test'})
        }
    }
    ws.send(json.dumps(start_event))
    print('Sent start')
    
    for _ in range(5):
        ws.settimeout(10)
        try:
            msg = ws.recv()
            print('Received:', msg[:200])
        except websocket.WebSocketTimeoutException:
            print('Timeout waiting for message')
        except Exception as e:
            print('Error receiving:', type(e), e)
            break
except Exception as e:
    print('Connection error:', e)
