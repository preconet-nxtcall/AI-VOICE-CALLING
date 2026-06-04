"""
test_ai_question.py
~~~~~~~~~~~~~~~~~~~~
Interactive CLI diagnostic tool to test the AI voice agent.
It allows you to enter a custom question, runs it through the actual AI pipeline
(RAG, OpenAI LLM, ElevenLabs TTS, and CRM analysis), and verifies every step.

Usage:
  python scratch/test_ai_question.py
  (or pass the question as an argument: python scratch/test_ai_question.py "your question here")
"""
import os
import sys
import json
import time
from pathlib import Path

# Force UTF-8 console output for Windows terminal support (handling Hindi/Special chars)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Add the project root to sys.path so we can import app modules
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(override=True)

from app.app import create_app
from app.models import db
from app.models.script import Script
from app.models.knowledge_base import KnowledgeBase
from app.services.ai_service import AIService
from app.services.tts_service import TTSService
from app.routes.twilio_voice import _get_context, _parse_script_config

# Default test IDs
DEFAULT_SCRIPT_ID = "7bec8dae-f6b1-4e4e-8b0d-15ad7a744985"  # NxtCall Smart Sales Agent v2
DEFAULT_KB_ID     = "e18d2e37-be7a-4fff-81a7-a3deddb114e9"
TEST_CONV_ID      = "test_interactive_conv_001"

SEP_LINE = "=" * 80
SUB_SEP  = "-" * 80

def main():
    print(SEP_LINE)
    print("                AI AGENT CUSTOM QUESTION DIAGNOSTIC TEST")
    print("                (Simulates RAG -> LLM -> TTS -> CRM Tagging)")
    print(SEP_LINE)

    # 1. Initialize flask app context
    print("\n[Step 1] Initializing Flask App context...")
    app = create_app()

    # Get question from CLI arguments or user input
    user_question = ""
    if len(sys.argv) > 1:
        user_question = " ".join(sys.argv[1:]).strip()
        print(f"✓ Question supplied via CLI argument: '{user_question}'")
    
    with app.app_context():
        # 2. Retrieve scripts & knowledge base to see what is loaded
        print("\n[Step 2] Resolving Agent Script & Knowledge Base...")
        
        # Load Script
        script = None
        # Try loading the default script ID
        try:
            script = db.session.get(Script, DEFAULT_SCRIPT_ID)
        except Exception:
            pass
            
        if not script:
            # Fallback to the first available script in the DB
            script = Script.query.first()
            
        if not script:
            print("❌ ERROR: No agent scripts found in the database.")
            print("Please create an agent first by running:")
            print("  python -X utf8 scratch/create_smart_sales_agent.py")
            return
            
        script_config = _parse_script_config(script.content)
        print(f"✓ Loaded Script: '{script.name}' (ID: {script.id})")
        print(f"  • Persona: {script_config.get('prompt', '')[:100]}...")
        print(f"  • Primary Language: {script_config.get('primary_language', 'English')}")
        print(f"  • Voice Style: {script_config.get('voice_style', 'female')}")
        print(f"  • Voice ID: {script_config.get('voice_id', 'Default')}")

        # Load Knowledge Base
        kb = None
        kb_id_str = DEFAULT_KB_ID
        try:
            import uuid
            kb = db.session.get(KnowledgeBase, uuid.UUID(DEFAULT_KB_ID))
        except Exception:
            pass
            
        if not kb:
            # Fallback to the first available knowledge base
            kb = KnowledgeBase.query.first()
            
        if kb:
            kb_id_str = str(kb.id)
            print(f"✓ Loaded Knowledge Base: '{kb.name}' (ID: {kb_id_str})")
            docs = kb.documents
            print(f"  • Associated Documents: {[d.filename for d in docs]}")
        else:
            print("⚠ Warning: No Knowledge Base found in the database. Continuing without RAG context.")
            kb_id_str = ""

        # Check local FAISS index if KB exists
        if kb:
            index_path = ROOT / "faiss_indices" / kb_id_str / "index.faiss"
            if not index_path.exists():
                print(f"⚠ FAISS index missing at {index_path}. Embedding documents...")
                from app.services.embedding_service import EmbeddingService
                for doc in kb.documents:
                    if doc.content and doc.content.strip():
                        print(f"  • Embedding {doc.filename}...")
                        EmbeddingService.embed_document(
                            knowledge_base_id=kb_id_str,
                            document_id=str(doc.id),
                            filename=doc.filename,
                            text=doc.content,
                        )
                print("✓ FAISS index generated successfully.")
            else:
                print(f"✓ FAISS index verified at: {index_path}")

        # Interactive loop or single question run
        while True:
            if not user_question:
                print(SUB_SEP)
                try:
                    user_question = input("Enter your question to the AI Agent (or press Enter to exit): ").strip()
                except (KeyboardInterrupt, EOFError):
                    print("\nExiting.")
                    break
                
            if not user_question:
                print("Exiting.")
                break

            print(SUB_SEP)
            print(f"USER QUESTION: '{user_question}'")
            print(SUB_SEP)

            # 3. Perform RAG context lookup
            print("\n[Step 3] Performing RAG Context Lookup...")
            t_rag_start = time.perf_counter()
            context = ""
            if kb_id_str:
                try:
                    context = _get_context(user_question, kb_id_str, use_reranker=False)
                    rag_time = (time.perf_counter() - t_rag_start) * 1000
                    if context:
                        print(f"✓ RAG Search completed in {rag_time:.1f}ms. Matched Context:")
                        for line in context.split("\n\n"):
                            print(f"  • {line[:120]}...")
                    else:
                        print(f"⚠ RAG search returned empty context (no matched document chunks).")
                except Exception as e:
                    print(f"❌ RAG Search failed: {e}")
            else:
                print("Skipped RAG lookup (no Knowledge Base loaded).")

            # 4. Generate LLM Reply
            print("\n[Step 4] Requesting OpenAI Chat Completion (gpt-4o)...")
            t_llm_start = time.perf_counter()
            ai_reply = ""
            try:
                ai_reply = AIService.generate_reply(
                    user_text=user_question,
                    conversation_id=TEST_CONV_ID,
                    knowledge_context=context,
                    primary_language=script_config.get("primary_language", "Hindi"),
                    secondary_language=script_config.get("secondary_language"),
                    script_prompt=script_config.get("prompt"),
                )
                llm_time = (time.perf_counter() - t_llm_start) * 1000
                print(f"✓ LLM Reply generated in {llm_time:.1f}ms.")
                print(f"🤖 AI AGENT REPLY:\n   \"{ai_reply}\"")
            except Exception as e:
                print(f"❌ LLM generation failed: {e}")
                import traceback
                traceback.print_exc()

            # 5. Generate Voice Audio (TTS)
            if ai_reply:
                print("\n[Step 5] Generating ElevenLabs Voice Audio (A-law)...")
                t_tts_start = time.perf_counter()
                try:
                    primary_lang = script_config.get("primary_language", "Hindi")
                    voice_id_cfg = str(script_config.get("voice_id") or "").strip() or None
                    gender = script_config.get("voice_style", "female")
                    
                    audio_bytes = TTSService.generate_alaw_8k(
                        ai_reply,
                        voice_id=voice_id_cfg,
                        language=primary_lang,
                        gender=gender
                    )
                    tts_time = (time.perf_counter() - t_tts_start) * 1000
                    if audio_bytes:
                        print(f"✓ TTS Audio generated successfully in {tts_time:.1f}ms.")
                        print(f"  • Audio Format: G.711 A-law 8kHz mono")
                        print(f"  • Data size: {len(audio_bytes)} bytes (~{len(audio_bytes)/8000:.2f} seconds of speech)")
                    else:
                        print("❌ TTS Audio generation returned EMPTY bytes (Cache miss & ElevenLabs request failed).")
                except Exception as e:
                    print(f"❌ TTS Voice Audio generation failed: {e}")

            # 6. CRM Tag & Handoff Analysis
            if ai_reply:
                print("\n[Step 6] Running CRM Tag & Sentiment Analytics...")
                try:
                    transcript_mock = f"Customer: {user_question}\nAI: {ai_reply}"
                    analysis = AIService.analyze_transcript_for_tags(
                        transcript=transcript_mock,
                        script_config=script_config
                    )
                    print("✓ Analysis results:")
                    print(json.dumps(analysis, indent=2, ensure_ascii=False))
                except Exception as e:
                    print(f"❌ CRM Tag Analysis failed: {e}")

            print(SEP_LINE)
            
            # If question was passed via CLI arguments, run once and exit
            if len(sys.argv) > 1:
                break
            
            # Otherwise allow running again
            user_question = ""

if __name__ == "__main__":
    main()
