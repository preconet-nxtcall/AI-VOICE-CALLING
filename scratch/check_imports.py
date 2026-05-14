import sys
try:
    import re
    import json
    import base64
    import audioop
    import logging
    import functools
    import tempfile
    import wave
    import threading
    import time
    from datetime import datetime, timezone
    from pathlib import Path
    from typing import Any, Optional
    from urllib.parse import urlparse

    from flask import Blueprint, request, Response, current_app, send_file
    import requests as http_client
    from twilio.twiml.voice_response import VoiceResponse
    from twilio.request_validator import RequestValidator
    # from app.extensions import sock # This might fail if app isn't in path
    print("Core imports OK")
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
