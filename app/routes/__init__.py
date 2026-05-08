from app.routes.auth import SignupResource, LoginResource, RefreshResource, MeResource, ForgotPasswordResource
from app.routes.knowledge import (
    KnowledgeUploadResource,
    KnowledgeListResource,
    KnowledgeUrlResource,
    KnowledgeBaseResource,
    DocumentResource,
    IngestionJobListResource,
    IngestionJobResource,
)
from app.routes.agent import AgentAskResource, AgentVoiceResource, AgentOutboundCallResource
from app.routes.subscription import PlanListResource, SubscriptionResource
from app.routes.campaign import CampaignListResource, CampaignStatusResource, CampaignLeadUploadResource, CampaignLeadListResource
from app.routes.call_log import CallLogListResource
from app.routes.billing import BillingSummaryResource


def register_routes(api):
    api.add_resource(SignupResource, "/auth/signup")
    api.add_resource(LoginResource, "/auth/login")
    api.add_resource(RefreshResource, "/auth/refresh")
    api.add_resource(MeResource, "/auth/me")
    api.add_resource(ForgotPasswordResource, "/auth/forgot-password")
    
    # Knowledge Base routes
    api.add_resource(KnowledgeUploadResource, "/knowledge/upload")
    api.add_resource(KnowledgeListResource, "/knowledge/list")
    api.add_resource(KnowledgeUrlResource, "/knowledge/url")
    api.add_resource(KnowledgeBaseResource, "/knowledge/<string:knowledge_base_id>")
    api.add_resource(DocumentResource, "/knowledge/document/<string:document_id>")
    api.add_resource(IngestionJobListResource, "/knowledge/ingestion-jobs")
    api.add_resource(IngestionJobResource, "/knowledge/ingestion-jobs/<string:job_id>")

    # Agent routes
    api.add_resource(AgentAskResource, "/agent/ask")
    api.add_resource(AgentVoiceResource, "/agent/voice")
    api.add_resource(AgentOutboundCallResource, "/agent/call")

    # Subscription routes
    api.add_resource(PlanListResource, "/subscription/plans")
    api.add_resource(SubscriptionResource, "/subscription/me")
    api.add_resource(BillingSummaryResource, "/billing/summary")

    # Campaign routes
    api.add_resource(CampaignListResource, "/campaigns")
    api.add_resource(CampaignStatusResource, "/campaigns/<string:campaign_id>/status")
    api.add_resource(CampaignLeadUploadResource, "/campaigns/<string:campaign_id>/upload")
    api.add_resource(CampaignLeadListResource, "/campaigns/<string:campaign_id>/leads")

    # Call log routes
    api.add_resource(CallLogListResource, "/call-logs")
