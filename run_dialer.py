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


def get_next_lead():
    """
    Find the next pending lead from any active campaign,
    respecting daily limits.
    """
    from app.models.campaign import Campaign
    from app.models.lead import Lead

    active_campaigns = (
        Campaign.query
        .filter_by(status="active")
        .order_by(Campaign.created_at.asc())
        .all()
    )

    if not active_campaigns:
        return None, None

    for campaign in active_campaigns:
        # Check if there's already a call in progress for this campaign
        in_progress = Lead.query.filter_by(
            campaign_id=campaign.id, status="calling"
        ).count()
        if in_progress > 0:
            logger.debug("Campaign %s has %d calls in progress, skipping.", campaign.name, in_progress)
            continue

        # Check daily limit: count completed + failed + calling today
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        calls_today = Lead.query.filter(
            Lead.campaign_id == campaign.id,
            Lead.status.in_(["completed", "failed", "calling"]),
            Lead.updated_at >= today_start,
        ).count()

        if calls_today >= campaign.daily_limit:
            logger.info(
                "Campaign '%s' hit daily limit (%d/%d). Skipping.",
                campaign.name, calls_today, campaign.daily_limit
            )
            continue

        # Get the next pending lead
        lead = (
            Lead.query
            .filter_by(campaign_id=campaign.id, status="pending")
            .order_by(Lead.created_at.asc())
            .first()
        )

        if lead:
            return campaign, lead

    return None, None


def dial_lead(campaign, lead):
    """Initiate a Twilio call for a single lead."""
    from app.models import db
    from app.services.voice_service import VoiceService

    kb_id = str(campaign.knowledge_base_id) if campaign.knowledge_base_id else None
    if not kb_id:
        logger.error(
            "Campaign '%s' has no knowledge_base_id. Cannot dial. Pausing campaign.",
            campaign.name,
        )
        campaign.status = "paused"
        db.session.commit()
        return

    phone = lead.phone_number
    logger.info(
        "DIALING: Campaign='%s' | Lead=%s | Phone=%s | KB=%s",
        campaign.name, lead.id, phone, kb_id,
    )

    # Mark lead as calling
    lead.status = "calling"
    db.session.commit()

    try:
        call_sid = VoiceService.make_outbound_call(phone, kb_id)
        lead.call_sid = call_sid
        db.session.commit()
        logger.info("Call initiated. SID=%s for phone=%s", call_sid, phone)
    except ValueError as ve:
        logger.error("Config error dialing %s: %s", phone, ve)
        lead.status = "failed"
        lead.error_message = str(ve)
        db.session.commit()
    except Exception as e:
        logger.exception("Unexpected error dialing %s", phone)
        lead.status = "failed"
        lead.error_message = str(e)[:500]
        db.session.commit()


def mark_stale_calling_leads():
    """
    Safety net: if a lead has been 'calling' for more than 10 minutes,
    mark it as 'completed' (the call probably ended and the webhook didn't fire).
    """
    from app.models import db
    from app.models.lead import Lead

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    stale = Lead.query.filter(
        Lead.status == "calling",
        Lead.updated_at < cutoff,
    ).all()

    for lead in stale:
        logger.warning("Marking stale lead %s as completed (timeout).", lead.id)
        lead.status = "completed"

    if stale:
        db.session.commit()


def auto_pause_finished_campaigns():
    """
    If all leads in an active campaign are completed/failed,
    automatically pause the campaign.
    """
    from app.models import db
    from app.models.campaign import Campaign
    from app.models.lead import Lead

    active_campaigns = Campaign.query.filter_by(status="active").all()
    for campaign in active_campaigns:
        total = Lead.query.filter_by(campaign_id=campaign.id).count()
        if total == 0:
            continue  # No leads uploaded yet

        remaining = Lead.query.filter(
            Lead.campaign_id == campaign.id,
            Lead.status.in_(["pending", "calling"]),
        ).count()

        if remaining == 0:
            logger.info(
                "Campaign '%s' has no remaining leads. Auto-pausing.",
                campaign.name,
            )
            campaign.status = "paused"
            db.session.commit()


def main_loop():
    """Main dialer loop."""
    logger.info("=" * 60)
    logger.info("BULK DIALER STARTED")
    logger.info("Call interval: %ds | Poll interval: %ds", CALL_INTERVAL, POLL_INTERVAL)
    logger.info("=" * 60)

    while True:
        try:
            # Housekeeping
            mark_stale_calling_leads()
            auto_pause_finished_campaigns()

            campaign, lead = get_next_lead()

            if lead is None:
                logger.debug("No pending leads. Sleeping %ds...", POLL_INTERVAL)
                time.sleep(POLL_INTERVAL)
                continue

            dial_lead(campaign, lead)
            time.sleep(CALL_INTERVAL)

        except KeyboardInterrupt:
            logger.info("Dialer stopped by user.")
            break
        except Exception:
            logger.exception("Unexpected error in dialer loop. Retrying in %ds...", POLL_INTERVAL)
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    app, ctx = create_app_context()
    try:
        main_loop()
    finally:
        ctx.pop()
