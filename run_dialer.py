"""
Bulk Dialer Worker
==================
Run this script in a separate terminal alongside your Flask app:

    python run_dialer.py

It continuously polls the database for active campaigns with pending leads
and dials them one by one using Twilio.
"""

import os
import sys
import time
import uuid
import logging
from datetime import datetime, timezone, timedelta

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [DIALER] %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("dialer.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("dialer")

# Interval between individual calls (seconds)
CALL_INTERVAL = int(os.environ.get("DIALER_CALL_INTERVAL", "10"))
# How often to poll for new work when idle (seconds)
POLL_INTERVAL = int(os.environ.get("DIALER_POLL_INTERVAL", "15"))


def create_app_context():
    """Create and push a Flask application context so we can use the DB."""
    from app.app import create_app
    app = create_app()
    ctx = app.app_context()
    ctx.push()
    return app, ctx








def main_loop():
    """Main dialer loop using unified logic from dialer_worker."""
    from app.services.dialer_worker import dialer_sweep_once, _sleep_time_for_campaigns
    from app.models.campaign import Campaign

    logger.info("=" * 60)
    logger.info("UNIFIED BULK DIALER STARTED")
    logger.info("Polling for active campaigns...")
    logger.info("=" * 60)

    while True:
        try:
            # 1) Run one sweep pass (cleanup, dial, auto-pause)
            stats = dialer_sweep_once()
            
            if stats["dialed"] > 0:
                logger.info("Sweep result: %s", stats)
            else:
                logger.debug("Sweep idle: %s", stats)

            # 2) Calculate dynamic sleep based on campaign speeds
            active_campaigns = Campaign.query.filter_by(status="active").all()
            sleep_time = _sleep_time_for_campaigns(active_campaigns)
            
            time.sleep(sleep_time)

        except KeyboardInterrupt:
            logger.info("Dialer stopped by user.")
            break
        except Exception:
            logger.exception("Unexpected error in dialer loop. Retrying in 15s...")
            time.sleep(15)


if __name__ == "__main__":
    app, ctx = create_app_context()
    try:
        main_loop()
    finally:
        ctx.pop()
