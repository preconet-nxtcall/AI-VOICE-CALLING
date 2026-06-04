import logging
import re
import threading
import time
from datetime import datetime, timedelta, timezone

from app.models import db
from app.models.campaign import Campaign
from app.models.lead import Lead
from app.services.voice_service import VoiceService

logger = logging.getLogger("dialer")
_RETRY_ATTEMPTS_RE = re.compile(r"retry_attempts=(\d+)")


def _attempts_from_error(error_message: str) -> int:
    match = _RETRY_ATTEMPTS_RE.search(error_message or "")
    if not match:
        return 0
    try:
        return int(match.group(1))
    except ValueError:
        return 0


def _within_campaign_schedule(campaign: Campaign, now_utc: datetime) -> bool:
    if campaign.schedule_start_at and now_utc < campaign.schedule_start_at:
        return False
    if campaign.schedule_end_at and now_utc > campaign.schedule_end_at:
        return False

    if campaign.daily_start_time or campaign.daily_end_time:
        # Convert UTC to local timezone for daily start/end naive time comparisons
        tz_str = "Asia/Kolkata"
        try:
            from flask import current_app
            tz_str = current_app.config.get("DIALER_TIMEZONE", "Asia/Kolkata")
        except RuntimeError:
            pass

        try:
            from zoneinfo import ZoneInfo
            local_tz = ZoneInfo(tz_str)
            now_time = now_utc.astimezone(local_tz).time()
        except Exception:
            # Fallback to IST (+05:30) if zoneinfo is not available
            ist_offset = timezone(timedelta(hours=5, minutes=30))
            now_time = now_utc.astimezone(ist_offset).time()

        start = campaign.daily_start_time
        end = campaign.daily_end_time
        if start and end:
            if start <= end:
                if not (start <= now_time <= end):
                    return False
            elif not (now_time >= start or now_time <= end):
                return False
        elif start and now_time < start:
            return False
        elif end and now_time > end:
            return False
    return True


def _eligible_retry_lead(campaign: Campaign) -> Lead | None:
    retry_limit = max(int(campaign.retry_attempts or 0), 0)
    if retry_limit <= 0:
        return None

    failed_leads = (
        Lead.query.filter_by(campaign_id=campaign.id, status="failed")
        .order_by(Lead.updated_at.asc())
        .all()
    )
    if not failed_leads:
        return None

    retry_after = timedelta(seconds=max(int(campaign.retry_interval_seconds or 0), 0))
    now_utc = datetime.now(timezone.utc)
    for lead in failed_leads:
        attempts = _attempts_from_error(lead.error_message or "")
        if attempts >= retry_limit:
            continue
        if lead.updated_at and (now_utc - lead.updated_at) < retry_after:
            continue
        return lead
    return None


def _eligible_pending_lead(campaign: Campaign) -> Lead | None:
    pending_leads = (
        Lead.query.filter_by(campaign_id=campaign.id, status="pending")
        .order_by(Lead.created_at.asc())
        .all()
    )
    if not pending_leads:
        return None

    retry_limit = max(int(campaign.retry_attempts or 0), 0)
    retry_after = timedelta(seconds=max(int(campaign.retry_interval_seconds or 0), 0))
    now_utc = datetime.now(timezone.utc)
    for lead in pending_leads:
        attempts = _attempts_from_error(lead.error_message or "")
        if attempts <= 0:
            return lead
        if attempts > retry_limit:
            continue
        if lead.updated_at and (now_utc - lead.updated_at) < retry_after:
            continue
        return lead
    return None


def _mark_retry_or_failed(lead: Lead, campaign: Campaign, reason: str) -> None:
    attempts = _attempts_from_error(lead.error_message or "") + 1
    retry_limit = max(int(campaign.retry_attempts or 0), 0)
    if attempts <= retry_limit:
        lead.status = "pending"
        lead.error_message = f"retry_attempts={attempts}; last_error={reason[:160]}"
    else:
        lead.status = "failed"
        lead.error_message = f"retry_attempts={attempts}; final_error={reason[:160]}"


def dialer_sweep_once() -> dict:
    """
    Run one dialer selection + attempt pass.
    Safe to run from thread or distributed workers.
    """
    stats = {"dialed": 0, "failed": 0, "paused": 0}
    now_utc = datetime.now(timezone.utc)

    # 1) Cleanup stale in-progress calls.
    cutoff = now_utc - timedelta(minutes=10)
    stale = Lead.query.filter(Lead.status == "calling", Lead.updated_at < cutoff).all()
    for lead in stale:
        campaign = db.session.get(Campaign, lead.campaign_id)
        if campaign:
            _mark_retry_or_failed(lead, campaign, "Call timed out.")
        else:
            lead.status = "failed"
            lead.error_message = "Call timed out."
        stats["failed"] += 1
    if stale:
        db.session.commit()

    # 2) Pick next lead from active campaigns.
    active_campaigns = (
        Campaign.query.filter_by(status="active").order_by(Campaign.created_at.asc()).all()
    )
    lead_to_dial = None
    target_campaign = None

    for campaign in active_campaigns:
        if not _within_campaign_schedule(campaign, now_utc):
            continue

        today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        calls_today = Lead.query.filter(
            Lead.campaign_id == campaign.id,
            Lead.status.in_(["completed", "failed", "calling"]),
            Lead.updated_at >= today_start,
        ).count()
        if calls_today >= (campaign.daily_limit or 100):
            continue

        in_progress = Lead.query.filter_by(campaign_id=campaign.id, status="calling").count()
        if in_progress > 0:
            continue

        lead = _eligible_pending_lead(campaign) or _eligible_retry_lead(campaign)
        if lead:
            lead_to_dial = lead
            target_campaign = campaign
            break

    if lead_to_dial and target_campaign:
        kb_id = str(target_campaign.knowledge_base_id) if target_campaign.knowledge_base_id else None
        if kb_id:
            logger.info("Dialing lead=%s campaign=%s", lead_to_dial.phone_number, target_campaign.id)
            lead_to_dial.status = "calling"
            db.session.commit()
            try:
                call_sid = VoiceService.make_outbound_call(
                    lead_to_dial.phone_number,
                    kb_id,
                    from_number_override=(target_campaign.caller_id or None),
                )
                lead_to_dial.call_sid = call_sid
                stats["dialed"] += 1
            except Exception as exc:
                logger.error("Dialer call failed for lead=%s: %s", lead_to_dial.id, exc)
                _mark_retry_or_failed(lead_to_dial, target_campaign, str(exc))
                stats["failed"] += 1
            db.session.commit()
        else:
            _mark_retry_or_failed(lead_to_dial, target_campaign, "No Knowledge Base configured")
            db.session.commit()
            stats["failed"] += 1

    # 3) Auto-pause finished campaigns.
    for campaign in active_campaigns:
        remaining = Lead.query.filter(
            Lead.campaign_id == campaign.id, Lead.status.in_(["pending", "calling"])
        ).count()
        if remaining == 0:
            total = Lead.query.filter_by(campaign_id=campaign.id).count()
            if total > 0:
                campaign.status = "paused"
                stats["paused"] += 1
    if stats["paused"] > 0:
        db.session.commit()

    return stats


def _sleep_time_for_campaigns(campaigns: list[Campaign]) -> int:
    sleep_time = 20
    if campaigns:
        speeds = [c.dialing_speed for c in campaigns if c.dialing_speed]
        if "aggressive" in speeds:
            sleep_time = 5
        elif "fast" in speeds:
            sleep_time = 10
    return sleep_time


def dialer_loop(app):
    with app.app_context():
        logger.info("Background Dialer Thread Started")
        while True:
            try:
                stats = dialer_sweep_once()
                logger.debug("Dialer sweep stats: %s", stats)
                active_campaigns = Campaign.query.filter_by(status="active").all()
            except Exception as exc:
                logger.error("Error in dialer loop: %s", exc)
                active_campaigns = []
            time.sleep(_sleep_time_for_campaigns(active_campaigns))


def start_dialer(app):
    thread = threading.Thread(target=dialer_loop, args=(app,), daemon=True)
    thread.start()
