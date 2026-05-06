import threading
import time
import logging
from datetime import datetime, timezone, timedelta
from app.models import db
from app.models.campaign import Campaign
from app.models.lead import Lead
from app.services.voice_service import VoiceService

logger = logging.getLogger("dialer-thread")

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
                    s.status = "completed"
                
                # 2. Find next lead from active campaigns
                active_campaigns = Campaign.query.filter_by(status="active").order_by(Campaign.created_at.asc()).all()
                
                lead_to_dial = None
                target_campaign = None
                
                for campaign in active_campaigns:
                    # Daily limit check
                    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
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
                        
                    lead = Lead.query.filter_by(campaign_id=campaign.id, status="pending").order_by(Lead.created_at.asc()).first()
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
                            call_sid = VoiceService.make_outbound_call(lead_to_dial.phone_number, kb_id)
                            lead_to_dial.call_sid = call_sid
                        except Exception as e:
                            logger.error(f"Dialer thread error: {e}")
                            lead_to_dial.status = "failed"
                            lead_to_dial.error_message = str(e)[:200]
                        
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
            
            # Sleep for 20 seconds before next check
            time.sleep(20)

def start_dialer(app):
    """Launch the dialer in a daemon thread."""
    thread = threading.Thread(target=dialer_loop, args=(app,), daemon=True)
    thread.start()
