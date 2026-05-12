import threading
import time
import logging
import re
from datetime import datetime, timezone, timedelta
from app.models import db
from app.models.campaign import Campaign
from app.models.lead import Lead
from app.services.voice_service import VoiceService

logger = logging.getLogger("dialer-thread")
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
    
    # Check daily time boundaries if configured
    if campaign.daily_start_time or campaign.daily_end_time:
        # Assuming the daily_start_time/end_time are in UTC for simplicity, or we convert local time.
        # But generally, .time() is naive. Let's compare just the time portion of now_utc.
        now_time = now_utc.time()
        
        start = campaign.daily_start_time
        end = campaign.daily_end_time
        
        if start and end:
            if start <= end:
                if not (start <= now_time <= end):
                    return False
            else:
                # wraps around midnight
                if not (now_time >= start or now_time <= end):
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

    retry_after = timedelta(seconds=max(int(campaign.retry_interval_seconds or 0), 0))
    now_utc = datetime.now(timezone.utc)
    for lead in pending_leads:
        attempts = _attempts_from_error(lead.error_message or "")
        # Fresh pending leads (never attempted) should dial immediately.
        if attempts <= 0:
            return lead
        # Retry-marked pending leads must respect retry cooldown.
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

def dialer_loop(app):
    """Background loop to process campaign leads."""
    with app.app_context():
        logger.info("Background Dialer Thread Started")
        
        while True:
            try:
                # 1. Cleanup stale calls
                cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
                stale = Lead.query.filter(Lead.status == "calling", Lead.updated_at < cutoff).all()
                for s in stale:
                    campaign = db.session.get(Campaign, s.campaign_id)
                    if campaign:
                        _mark_retry_or_failed(s, campaign, "Call timed out.")
                    else:
                        s.status = "failed"
                        s.error_message = "Call timed out."
                
                # 2. Find next lead from active campaigns
                active_campaigns = Campaign.query.filter_by(status="active").order_by(Campaign.created_at.asc()).all()
                
                lead_to_dial = None
                target_campaign = None
                
                for campaign in active_campaigns:
                    now_utc = datetime.now(timezone.utc)
                    if not _within_campaign_schedule(campaign, now_utc):
                        continue

                    # Daily limit check
                    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
                    calls_today = Lead.query.filter(
                        Lead.campaign_id == campaign.id,
                        Lead.status.in_(["completed", "failed", "calling"]),
                        Lead.updated_at >= today_start,
                    ).count()
                    
                    if calls_today >= (campaign.daily_limit or 100):
                        continue
                        
                    # Check if already calling for this campaign (limit 1 at a time)
                    in_progress = Lead.query.filter_by(campaign_id=campaign.id, status="calling").count()
                    if in_progress > 0:
                        continue
                        
                    lead = _eligible_pending_lead(campaign)
                    if not lead:
                        lead = _eligible_retry_lead(campaign)
                    if lead:
                        lead_to_dial = lead
                        target_campaign = campaign
                        break
                
                if lead_to_dial:
                    # Dial the lead
                    kb_id = str(target_campaign.knowledge_base_id) if target_campaign.knowledge_base_id else None
                    if kb_id:
                        logger.info(f"Thread Dialing: {lead_to_dial.phone_number}")
                        lead_to_dial.status = "calling"
                        db.session.commit()
                        
                        try:
                            call_sid = VoiceService.make_outbound_call(
                                lead_to_dial.phone_number,
                                kb_id,
                                from_number_override=(target_campaign.caller_id or None),
                            )
                            lead_to_dial.call_sid = call_sid
                        except Exception as e:
                            logger.error(f"Dialer thread error: {e}")
                            _mark_retry_or_failed(lead_to_dial, target_campaign, str(e))
                        
                        db.session.commit()
                    else:
                        logger.error(f"No KB ID for campaign {target_campaign.id}")
                        _mark_retry_or_failed(lead_to_dial, target_campaign, "No Knowledge Base configured")
                        db.session.commit()
                
                # Auto-pause finished campaigns
                for campaign in active_campaigns:
                    remaining = Lead.query.filter(Lead.campaign_id == campaign.id, Lead.status.in_(["pending", "calling"])).count()
                    if remaining == 0:
                        total = Lead.query.filter_by(campaign_id=campaign.id).count()
                        if total > 0:
                            campaign.status = "paused"
                            db.session.commit()

            except Exception as e:
                logger.error(f"Error in dialer loop: {e}")
            
            # Sleep based on dialing speed (we could optimize this per campaign, but a global min sleep is safer)
            # Default is 20s. We'll sleep less if there's an active aggressive campaign.
            sleep_time = 20
            if active_campaigns:
                speeds = [c.dialing_speed for c in active_campaigns if c.dialing_speed]
                if "aggressive" in speeds:
                    sleep_time = 5
                elif "fast" in speeds:
                    sleep_time = 10
                    
            time.sleep(sleep_time)

def start_dialer(app):
    """Launch the dialer in a daemon thread."""
    thread = threading.Thread(target=dialer_loop, args=(app,), daemon=True)
    thread.start()
