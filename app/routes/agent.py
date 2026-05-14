from flask import request
from flask_restful import Resource
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models.knowledge_base import KnowledgeBase
from app.services.agent_service import AgentService
from app.services.voice_service import VoiceService
from app.services.tts_service import TTSService

class AgentAskResource(Resource):
    @jwt_required()
    def post(self):
        """
        Ask a question over a specific knowledge base using RAG.
        Expects JSON: { "knowledge_base_id": "...", "query": "..." }
        """
        data = request.get_json(silent=True)
        if not data:
            return {"success": False, "error": "Invalid JSON payload."}, 400
            
        knowledge_base_id = data.get("knowledge_base_id")
        query = data.get("query", "")
        document_id = data.get("document_id")  # optional: restrict to a specific document
        
        if not isinstance(query, str) or not query.strip():
            return {"success": False, "error": "'query' must be a non-empty string."}, 400
            
        if not knowledge_base_id:
            return {"success": False, "error": "'knowledge_base_id' is required."}, 400
            
        try:
            import uuid
            kb_uuid = uuid.UUID(str(knowledge_base_id))
        except ValueError:
            return {"success": False, "error": "Invalid knowledge base ID format."}, 400

        # Validate optional document_id
        doc_uuid_str = None
        if document_id:
            try:
                doc_uuid_str = str(uuid.UUID(str(document_id)))
            except ValueError:
                return {"success": False, "error": "Invalid document_id format."}, 400
            
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return {"success": False, "error": "Invalid user identity format."}, 401
            
        # Validate that the knowledge base belongs to the user
        kb = KnowledgeBase.query.filter_by(id=kb_uuid, user_id=user_uuid).first()
        if not kb:
            return {"success": False, "error": "Knowledge base not found or you do not have permission to access it."}, 404
            
        try:
            result = AgentService.ask(
                knowledge_base_id,
                query,
                document_id=doc_uuid_str,
                mode="chat"
            )
            answer_text = result.get("answer", "")
            audio_url = None
            if isinstance(answer_text, str) and answer_text.strip():
                detected_lang = result.get("language_code", "en")
                audio_file_path = TTSService.generate_audio(answer_text, language=detected_lang)
                from pathlib import Path
                filename = Path(audio_file_path).name
                base_url = request.host_url.rstrip("/")
                audio_url = f"{base_url}/voice/audio/{filename}"

            result["audio_url"] = audio_url
            # Remove audio_file_path if it exists
            result.pop("audio_file_path", None)
            return {
                "success": True,
                "data": result
            }, 200
        except ValueError as ve:
            return {"success": False, "error": str(ve)}, 400
        except Exception as e:
            return {"success": False, "error": "An error occurred while generating the answer."}, 500

class AgentVoiceResource(Resource):
    @jwt_required()
    def post(self):
        """
        Voice-to-Voice RAG pipeline.
        Expects multipart/form-data:
        - audio: audio file
        - knowledge_base_id: UUID
        """
        if 'audio' not in request.files:
            return {"success": False, "error": "No audio file provided."}, 400
            
        audio_file = request.files['audio']
        knowledge_base_id = request.form.get("knowledge_base_id")
        
        if not knowledge_base_id:
            return {"success": False, "error": "'knowledge_base_id' is required."}, 400
            
        try:
            import uuid
            kb_uuid = uuid.UUID(str(knowledge_base_id))
        except ValueError:
            return {"success": False, "error": "Invalid knowledge base ID format."}, 400
            
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return {"success": False, "error": "Invalid user identity format."}, 401

        kb = KnowledgeBase.query.filter_by(id=kb_uuid, user_id=user_uuid).first()
        if not kb:
            return {"success": False, "error": "Knowledge base not found or access denied."}, 404
            
        try:
            # 1. Audio -> Text (STT)
            transcription = VoiceService.transcribe(audio_file)
            
            if not transcription or not transcription.strip():
                return {"success": False, "error": "Could not transcribe audio."}, 400

            # 2. Text -> RAG Response
            rag_result = AgentService.ask(str(kb_uuid), transcription, mode="voice")
            answer_text = rag_result['answer']
            
            # 3. Response text -> local MP3 (TTS)
            detected_lang = rag_result.get("language_code", "en")
            audio_file_path = TTSService.generate_audio(answer_text, language=detected_lang)
            from pathlib import Path
            filename = Path(audio_file_path).name
            base_url = request.host_url.rstrip("/")
            audio_url = f"{base_url}/voice/audio/{filename}"
            
            return {
                "success": True,
                "data": {
                    "transcription": transcription,
                    "answer": answer_text,
                    "audio_url": audio_url,
                    "context_used": rag_result.get("context_used", [])
                }
            }, 200
            
        except Exception as e:
            return {"success": False, "error": str(e)}, 500

class AgentOutboundCallResource(Resource):
    @jwt_required()
    def post(self):
        """
        Trigger an outbound Twilio call to a specific phone number.
        Expects JSON: { "phone_number": "+1234567890", "knowledge_base_id": "..." }
        """
        data = request.get_json(silent=True)
        if not data:
            return {"success": False, "error": "Invalid JSON payload."}, 400
            
        phone_number = data.get("phone_number")
        knowledge_base_id = data.get("knowledge_base_id")
        
        if not phone_number or not str(phone_number).strip():
            return {"success": False, "error": "'phone_number' is required."}, 400
            
        if not knowledge_base_id:
            return {"success": False, "error": "'knowledge_base_id' is required."}, 400
            
        try:
            import uuid
            kb_uuid = uuid.UUID(str(knowledge_base_id))
        except ValueError:
            return {"success": False, "error": "Invalid knowledge base ID format."}, 400
            
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return {"success": False, "error": "Invalid user identity format."}, 401

        kb = KnowledgeBase.query.filter_by(id=kb_uuid, user_id=user_uuid).first()
        if not kb:
            return {"success": False, "error": "Knowledge base not found or access denied."}, 404
            
        from app.routes.twilio_voice import _is_kb_available_for_voice
        if not _is_kb_available_for_voice(str(kb_uuid)):
            return {"success": False, "error": "Active subscription required to make voice calls."}, 403
            
        try:
            call_sid = VoiceService.make_outbound_call(str(phone_number), str(knowledge_base_id))
            return {
                "success": True,
                "data": {
                    "call_sid": call_sid,
                    "message": f"Call initiated to {phone_number}"
                }
            }, 200
        except ValueError as ve:
            return {"success": False, "error": str(ve)}, 400
        except Exception as e:
            return {"success": False, "error": "Failed to initiate call."}, 500

