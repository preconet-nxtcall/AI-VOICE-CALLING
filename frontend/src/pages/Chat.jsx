import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Sparkles, Loader2, AlertTriangle,
  ChevronDown, Database, Trash2, Volume2, VolumeX,
  RefreshCw, BookOpen, FileText, Link as LinkIcon, MessageSquare
} from 'lucide-react';
import api from '../services/api';

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex gap-1 items-center py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function AudioPlayer({ url }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} className="hidden" />
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-100 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 px-3 py-1.5 rounded-full transition-all"
      >
        {playing ? <VolumeX size={13} /> : <Volume2 size={13} />}
        {playing ? 'Pause Audio' : 'Play Response'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Main Component
// ─────────────────────────────────────────────
export default function Chat() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: 'Hello! I am your AI assistant. Select a knowledge base and optionally a specific document, then ask me anything.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Knowledge base state
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [selectedKbId, setSelectedKbId] = useState('');
  const [kbDocs, setKbDocs] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('all');

  const [kbLoading, setKbLoading] = useState(true);
  const [kbError, setKbError] = useState('');

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Fetch knowledge bases on mount
  useEffect(() => {
    const fetchKbs = async () => {
      try {
        setKbLoading(true);
        setKbError('');
        const res = await api.get('/knowledge/list');
        const kbs = res.data.knowledge_bases || [];
        setKnowledgeBases(kbs);
        if (kbs.length > 0) {
          setSelectedKbId(kbs[0].id);
          setKbDocs(kbs[0].documents || []);
        } else {
          setKbError('No knowledge base found. Please upload documents first.');
        }
      } catch (err) {
        console.error('Failed to fetch knowledge bases', err);
        setKbError('Failed to load knowledge bases. Please check your connection.');
      } finally {
        setKbLoading(false);
      }
    };
    fetchKbs();
  }, []);

  // When KB changes, update document list
  const handleKbChange = (kbId) => {
    setSelectedKbId(kbId);
    setSelectedDocId('all');
    const kb = knowledgeBases.find(k => k.id === kbId);
    setKbDocs(kb?.documents || []);
  };

  // Auto-resize textarea
  const handleInputChange = (e) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedKbId || loading) return;

    const userMsg = { id: Date.now(), role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    try {
      const payload = {
        knowledge_base_id: selectedKbId,
        query: trimmed,
      };
      // Pass document filter if a specific doc is selected
      if (selectedDocId && selectedDocId !== 'all') {
        payload.document_id = selectedDocId;
      }

      const res = await api.post('/agent/ask', payload);
      const data = res.data.data;

      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.answer,
        context: data.context_used || [],
        audioUrl: data.audio_url || null,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Failed to get answer', err);
      const errMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: err.response?.data?.error || "I'm sorry, I encountered an error while processing your request. Please try again.",
        isError: true,
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{
      id: Date.now(),
      role: 'assistant',
      content: 'Chat cleared. Ask me anything about your documents!',
    }]);
  };

  const isReady = !kbLoading && selectedKbId && !kbError;

  // ─── selected KB info ───
  const selectedKb = knowledgeBases.find(k => k.id === selectedKbId);

  return (
    <div className="chat-page">
      {/* ── Page Header ── */}
      <div className="chat-header-section">
        <div>
          <h1 className="chat-title">
            <Sparkles size={28} className="chat-title-icon" />
            AI Assistant
          </h1>
          <p className="chat-subtitle">
            Ask questions and get intelligent answers powered by your knowledge base.
          </p>
        </div>

        {/* KB + Doc Selectors */}
        <div className="chat-selectors">
          {/* Knowledge Base selector */}
          <div className="selector-group">
            <label className="selector-label">
              <Database size={12} /> Knowledge Base
            </label>
            <div className="selector-wrap">
              <select
                value={selectedKbId}
                onChange={e => handleKbChange(e.target.value)}
                disabled={kbLoading || knowledgeBases.length === 0}
                className="selector-control"
              >
                {kbLoading && <option>Loading…</option>}
                {!kbLoading && knowledgeBases.length === 0 && <option>No knowledge bases</option>}
                {knowledgeBases.map(kb => (
                  <option key={kb.id} value={kb.id}>{kb.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="selector-chevron" />
            </div>
          </div>

          {/* Document selector */}
          <div className="selector-group">
            <label className="selector-label">
              <BookOpen size={12} /> Document (optional)
            </label>
            <div className="selector-wrap">
              <select
                value={selectedDocId}
                onChange={e => setSelectedDocId(e.target.value)}
                disabled={kbDocs.length === 0}
                className="selector-control"
              >
                <option value="all">All Documents</option>
                {kbDocs.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.filename}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="selector-chevron" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {kbError && (
        <div className="chat-error-banner">
          <AlertTriangle size={16} />
          <span>{kbError}</span>
        </div>
      )}

      {/* ── Chat Window ── */}
      <div className="chat-window">
        {/* Chat Topbar */}
        <div className="chat-topbar">
          <div className="chat-agent-info">
            <div className="agent-avatar">
              <Bot size={18} />
            </div>
            <div>
              <p className="agent-name">RAG Agent</p>
              <p className="agent-status">
                <span className="status-dot" />
                {isReady ? 'Online & Ready' : kbLoading ? 'Loading…' : 'Not configured'}
              </p>
            </div>
          </div>
          <div className="chat-topbar-right">
            {selectedKb && (
              <div className="kb-badge">
                <Database size={11} />
                {selectedKb.name}
                {selectedDocId !== 'all' && (
                  <>
                    <span className="kb-badge-sep">›</span>
                    <FileText size={11} />
                    {kbDocs.find(d => d.id === selectedDocId)?.filename?.split('.')[0]}
                  </>
                )}
              </div>
            )}
            <button onClick={clearChat} className="clear-btn" title="Clear conversation">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`chat-message-row ${msg.role === 'user' ? 'user-row' : 'assistant-row'}`}
            >
              {/* Avatar */}
              <div className={`msg-avatar ${msg.role === 'user' ? 'user-avatar' : 'bot-avatar'}`}>
                {msg.role === 'user' ? <User size={15} /> : <Bot size={15} />}
              </div>

              {/* Bubble */}
              <div className={`msg-bubble ${msg.role === 'user' ? 'user-bubble' : msg.isError ? 'error-bubble' : 'bot-bubble'}`}>
                <p className="msg-text">{msg.content}</p>

                {/* Sources */}
                {msg.role === 'assistant' && msg.context && msg.context.length > 0 && (
                  <div className="msg-sources">
                    <span className="sources-label">
                      <MessageSquare size={10} /> Sources
                    </span>
                    <div className="sources-list">
                      {msg.context.slice(0, 3).map((ctx, i) => (
                        <span key={i} className="source-chip">
                          {ctx.file_type === 'url'
                            ? <LinkIcon size={10} />
                            : <FileText size={10} />}
                          {ctx.filename || 'Document'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audio player */}
                {msg.role === 'assistant' && msg.audioUrl && (
                  <AudioPlayer url={msg.audioUrl} />
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="chat-message-row assistant-row">
              <div className="msg-avatar bot-avatar">
                <Loader2 size={15} className="animate-spin" />
              </div>
              <div className="msg-bubble bot-bubble typing-bubble">
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-area">
          <div className={`input-container ${!isReady ? 'input-disabled' : ''}`}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                kbLoading
                  ? 'Loading knowledge bases…'
                  : !selectedKbId
                  ? 'No knowledge base selected'
                  : `Ask about ${selectedKb?.name || 'your documents'}… (Enter to send)`
              }
              disabled={!isReady || loading}
              rows={1}
              className="chat-textarea"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || !isReady || loading}
              className="send-btn"
              title="Send message"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <p className="input-hint">
            Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line · AI can make mistakes, verify important info.
          </p>
        </div>
      </div>

      {/* ── Styles ── */}
      <style>{`
        .chat-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 900px;
          margin: 0 auto;
          height: calc(100vh - 7rem);
        }

        /* Header */
        .chat-header-section {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .chat-title {
          font-size: 1.875rem;
          font-weight: 800;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          margin-bottom: 0.25rem;
          letter-spacing: -0.5px;
        }
        .chat-title-icon { color: #818cf8; }
        .chat-subtitle { color: #94a3b8; font-size: 0.875rem; }

        /* Selectors */
        .chat-selectors {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          align-items: flex-end;
        }
        .selector-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .selector-label {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
        }
        .selector-wrap { position: relative; }
        .selector-control {
          appearance: none;
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 10px;
          color: #e2e8f0;
          padding: 0.5rem 2.5rem 0.5rem 0.875rem;
          font-size: 0.8rem;
          min-width: 180px;
          transition: border-color 0.2s;
          cursor: pointer;
        }
        .selector-control:focus { outline: none; border-color: #6366f1; }
        .selector-control:disabled { opacity: 0.5; cursor: not-allowed; }
        .selector-chevron {
          position: absolute;
          right: 0.6rem;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
          pointer-events: none;
        }

        /* Error banner */
        .chat-error-banner {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: rgba(245,158,11,0.08);
          border: 1px solid rgba(245,158,11,0.2);
          color: #fbbf24;
          padding: 0.875rem 1rem;
          border-radius: 12px;
          font-size: 0.875rem;
        }

        /* Chat Window */
        .chat-window {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #0d1117;
          border: 1px solid #1e293b;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 25px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.05);
          min-height: 0;
        }

        /* Topbar */
        .chat-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.875rem 1.25rem;
          background: linear-gradient(135deg, #0b1120 0%, #0f172a 100%);
          border-bottom: 1px solid #1e293b;
        }
        .chat-agent-info { display: flex; align-items: center; gap: 0.75rem; }
        .agent-avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          box-shadow: 0 0 12px rgba(99,102,241,0.3);
        }
        .agent-name { font-size: 0.9rem; font-weight: 600; color: #fff; }
        .agent-status {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.7rem;
          color: #34d399;
          margin-top: 1px;
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #34d399;
          animation: pulse-green 2s infinite;
        }
        @keyframes pulse-green {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .chat-topbar-right { display: flex; align-items: center; gap: 0.6rem; }
        .kb-badge {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.7rem;
          font-weight: 600;
          color: #6366f1;
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.2);
          border-radius: 20px;
          padding: 0.3rem 0.75rem;
          max-width: 240px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .kb-badge-sep { color: #475569; }
        .clear-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid #1e293b;
          background: transparent;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .clear-btn:hover { background: rgba(239,68,68,0.1); color: #f87171; border-color: rgba(239,68,68,0.2); }

        /* Messages area */
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          background: linear-gradient(180deg, #0d1117 0%, #0a0f1a 100%);
          scrollbar-width: thin;
          scrollbar-color: #1e293b transparent;
        }
        .chat-messages::-webkit-scrollbar { width: 5px; }
        .chat-messages::-webkit-scrollbar-track { background: transparent; }
        .chat-messages::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 99px; }

        .chat-message-row {
          display: flex;
          gap: 0.75rem;
          align-items: flex-start;
          animation: fadeSlideIn 0.25s ease;
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .user-row { flex-direction: row-reverse; }
        .assistant-row { flex-direction: row; }

        /* Avatars */
        .msg-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .user-avatar { background: #334155; color: #cbd5e1; }
        .bot-avatar { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; }

        /* Bubbles */
        .msg-bubble {
          max-width: 75%;
          border-radius: 18px;
          padding: 0.875rem 1.1rem;
          font-size: 0.875rem;
          line-height: 1.6;
        }
        .user-bubble {
          background: linear-gradient(135deg, #4f46e5, #6d28d9);
          color: #fff;
          border-bottom-right-radius: 4px;
          box-shadow: 0 4px 12px rgba(79,70,229,0.25);
        }
        .bot-bubble {
          background: #131c2e;
          border: 1px solid #1e293b;
          color: #cbd5e1;
          border-bottom-left-radius: 4px;
        }
        .error-bubble {
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          color: #fca5a5;
          border-bottom-left-radius: 4px;
        }
        .typing-bubble {
          padding: 0.75rem 1rem;
        }
        .msg-text { white-space: pre-wrap; word-break: break-word; }

        /* Sources */
        .msg-sources {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .sources-label {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: #475569;
          margin-bottom: 0.4rem;
        }
        .sources-list { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .source-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.68rem;
          color: #6366f1;
          background: rgba(99,102,241,0.08);
          border: 1px solid rgba(99,102,241,0.15);
          border-radius: 20px;
          padding: 0.2rem 0.6rem;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Input area */
        .chat-input-area {
          padding: 1rem 1.25rem;
          background: linear-gradient(135deg, #0b1120 0%, #0f172a 100%);
          border-top: 1px solid #1e293b;
        }
        .input-container {
          display: flex;
          align-items: flex-end;
          gap: 0.75rem;
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 16px;
          padding: 0.75rem 0.75rem 0.75rem 1rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input-container:focus-within {
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79,70,229,0.12);
        }
        .input-disabled { opacity: 0.5; pointer-events: none; }
        .chat-textarea {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #e2e8f0;
          font-size: 0.9rem;
          line-height: 1.5;
          resize: none;
          min-height: 24px;
          max-height: 160px;
          font-family: inherit;
        }
        .chat-textarea::placeholder { color: #334155; }
        .chat-textarea:disabled { cursor: not-allowed; }
        .send-btn {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          border: none;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(79,70,229,0.3);
        }
        .send-btn:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(79,70,229,0.4);
        }
        .send-btn:disabled {
          background: #1e293b;
          color: #475569;
          box-shadow: none;
          cursor: not-allowed;
        }
        .input-hint {
          text-align: center;
          font-size: 0.7rem;
          color: #334155;
          margin-top: 0.6rem;
        }
        .input-hint kbd {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 4px;
          padding: 0.1rem 0.35rem;
          font-size: 0.65rem;
          color: #64748b;
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}
