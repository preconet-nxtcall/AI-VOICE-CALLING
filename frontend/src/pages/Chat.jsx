import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Sparkles, Loader2, AlertTriangle,
  ChevronDown, Database, Trash2, Volume2, VolumeX,
  BookOpen, FileText, Link as LinkIcon, MessageSquare,
  Zap, Copy, Check, RotateCcw
} from 'lucide-react';
import api from '../services/api';

// ─────────────────────────────────────────────────────────────
//  Typing Dots
// ─────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex gap-1 items-center py-1 px-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Audio Player
// ─────────────────────────────────────────────────────────────
function AudioPlayer({ url }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} className="hidden" />
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-100 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 px-3 py-1.5 rounded-full transition-all"
      >
        {playing ? <VolumeX size={12} /> : <Volume2 size={12} />}
        {playing ? 'Pause' : 'Play Response'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Copy Button
// ─────────────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };
  return (
    <button
      onClick={copy}
      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-all"
      title="Copy"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
//  Message Bubble
// ─────────────────────────────────────────────────────────────
function MessageBubble({ msg, kbDocs }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}>
      {/* Avatar */}
      <div className={`
        flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
        ${isUser
          ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-slate-900 dark:text-white shadow-lg shadow-violet-500/20'
          : 'bg-gradient-to-br from-indigo-600 to-violet-600 text-slate-900 dark:text-white shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-500/30'
        }
      `}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`
          relative px-4 py-3 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white rounded-tr-sm shadow-lg shadow-violet-500/20'
            : msg.isError
              ? 'bg-red-50 dark:bg-red-500/8 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-300 rounded-tl-sm'
              : 'bg-white dark:bg-[#141e33] border border-[#E2E8F0] dark:border-[#1e2d4a] text-slate-800 dark:text-slate-200 rounded-tl-sm shadow-sm'
          }
        `}>
          <p className="whitespace-pre-wrap break-words leading-7">{msg.content}</p>

          {/* Sources */}
          {!isUser && msg.context && msg.context.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-500 mb-2">
                <MessageSquare size={9} /> Sources used
              </span>
              <div className="flex flex-wrap gap-1.5">
                {msg.context.slice(0, 3).map((ctx, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/8 border border-violet-500/15 rounded-full px-2 py-0.5 max-w-[160px] truncate">
                    {ctx.file_type === 'url' ? <LinkIcon size={9} /> : <FileText size={9} />}
                    {ctx.filename || 'Document'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Audio */}
          {!isUser && msg.audioUrl && <AudioPlayer url={msg.audioUrl} />}
        </div>

        {/* Copy action row */}
        {!isUser && (
          <div className="flex items-center gap-1 px-1">
            <CopyButton text={msg.content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Welcome Screen
// ─────────────────────────────────────────────────────────────
function WelcomeScreen({ selectedKb, kbDocs, onSuggestionClick }) {
  const suggestions = [
    'Summarize the key points in this document',
    'What are the main topics covered?',
    'Explain the most important findings',
    'Give me a brief overview of this knowledge base',
  ];
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-4 py-12 text-center">
      {/* Logo */}
      <div className="relative">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-fuchsia-600 flex items-center justify-center shadow-2xl shadow-violet-500/30 ring-1 ring-violet-400/20">
          <Sparkles size={36} className="text-slate-900 dark:text-white" />
        </div>
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-[#0d1117] flex items-center justify-center">
          <Zap size={10} className="text-slate-900 dark:text-white" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
          How can I help you today?
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
          {selectedKb
            ? <>Searching through <span className="text-violet-400 font-medium">{selectedKb.name}</span>
              {kbDocs.length > 0 && <> · {kbDocs.length} document{kbDocs.length !== 1 ? 's' : ''}</>}</>
            : 'Select a knowledge base and start asking questions'
          }
        </p>
      </div>

      {/* Suggestion chips */}
      {selectedKb && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s)}
              className="text-left px-4 py-3 rounded-xl border border-[#E2E8F0] dark:border-[#1e2d4a] bg-white/60 dark:bg-[#0d1624]/60 hover:bg-slate-50 dark:hover:bg-[#141e33] hover:border-violet-500/40 text-slate-600 dark:text-slate-300 text-xs leading-relaxed transition-all group"
            >
              <span className="group-hover:text-violet-300 transition-colors">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Main Component
// ─────────────────────────────────────────────────────────────
export default function Chat() {
  const [messages, setMessages] = useState([]);
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
  const chatBodyRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Fetch knowledge bases
  useEffect(() => {
    const fetchKbs = async () => {
      try {
        setKbLoading(true);
        setKbError('');
        const res = await api.get('/knowledge/list');
        const kbs = res.data.knowledge_bases || [];
        setKnowledgeBases(kbs);
        if (kbs.length > 0) {
          // If no KB is selected yet, pick the first one
          if (!selectedKbId) {
            setSelectedKbId(kbs[0].id);
          }
        } else {
          setKbError('No knowledge base found. Upload documents first.');
        }
      } catch (err) {
        console.error('Failed to fetch knowledge bases', err);
        setKbError('Failed to load knowledge bases.');
      } finally {
        setKbLoading(false);
      }
    };
    fetchKbs();
  }, []);

  // Sync documents when selected KB changes
  useEffect(() => {
    if (knowledgeBases.length > 0) {
      // If no KB selected, or the current selected KB is not in the list, default to the first one
      const exists = knowledgeBases.some(k => String(k.id) === String(selectedKbId));
      if (!selectedKbId || !exists) {
        setSelectedKbId(knowledgeBases[0].id);
        return;
      }

      const kb = knowledgeBases.find(k => String(k.id) === String(selectedKbId));
      setKbDocs(kb?.documents || []);
      
      // If the current selected doc is not in the new KB, reset to 'all'
      if (selectedDocId !== 'all') {
        const docExists = kb?.documents?.some(d => String(d.id) === String(selectedDocId));
        if (!docExists) setSelectedDocId('all');
      }
    } else {
      setKbDocs([]);
      setSelectedKbId('');
    }
  }, [selectedKbId, knowledgeBases]);

  const handleKbChange = (kbId) => {
    setSelectedKbId(kbId);
    setSelectedDocId('all');
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    }
  };

  const handleKeyDown = (e) => {
    if (e.nativeEvent?.isComposing) return;
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
      // Map existing messages to history format for backend
      const history = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      const payload = { 
        knowledge_base_id: selectedKbId, 
        query: trimmed,
        history: history
      };
      if (selectedDocId && selectedDocId !== 'all') payload.document_id = selectedDocId;

      const res = await api.post('/agent/ask', payload);
      const data = res.data?.data || res.data || {};
      const answer = data.answer || '';
      if (!answer.trim()) {
        throw new Error('Empty answer from assistant');
      }

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: answer,
        context: data.context_used || [],
        audioUrl: data.audio_url || null,
      }]);
    } catch (err) {
      console.error('Failed to get answer', err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: err.response?.data?.error || "I encountered an error. Please try again.",
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => setMessages([]);
  
  const handleSuggestionClick = (suggestion) => {
    setInput(suggestion);
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Adjust height
      setTimeout(() => {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
      }, 0);
    }
  };

  const isReady = !kbLoading && !!selectedKbId && !kbError;
  const selectedKb = knowledgeBases.find(k => String(k.id) === String(selectedKbId));
  const selectedDoc = kbDocs.find(d => String(d.id) === String(selectedDocId));

  return (
    <>
      {/* ── Escape layout padding for full-height ── */}
      <style>{`
        /* Override parent <main> padding only on chat route */
        .chat-fullscreen-escape {
          margin: -2rem;
          height: calc(100vh - 5rem); /* 5rem = header h-20 */
        }
        @media (max-width: 768px) {
          .chat-fullscreen-escape { margin: -1rem; }
        }
        .chat-messages-scroll::-webkit-scrollbar { width: 4px; }
        .chat-messages-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-messages-scroll::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 99px; }
        .chat-messages-scroll { scrollbar-width: thin; scrollbar-color: #1e293b transparent; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-animate { animation: fadeUp 0.2s ease forwards; }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .gradient-text {
          background: linear-gradient(135deg, #a78bfa, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .glass-input {
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .glow-violet {
          box-shadow: 0 0 0 1px rgba(139,92,246,0.3), 0 8px 32px rgba(139,92,246,0.15);
        }
        .glow-violet:focus-within {
          box-shadow: 0 0 0 2px rgba(139,92,246,0.5), 0 12px 40px rgba(139,92,246,0.2);
        }
      `}</style>

      <div className="chat-fullscreen-escape flex flex-col bg-[#F8FAFC] dark:bg-[#080e1a] overflow-hidden">

        {/* ══════════════════════════════════════════
            TOP BAR — compact identity + controls
        ══════════════════════════════════════════ */}
        <div className="flex-shrink-0 border-b border-[#E2E8F0] dark:border-[#1a2540] bg-[#FFFFFF] dark:bg-[#0a1020]/95 glass-input">
          {/* Title row */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/20">
                <Sparkles size={13} className="text-slate-900 dark:text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold gradient-text leading-none">AI Assistant</h1>
                <p className="text-[10px] text-slate-600 dark:text-slate-500 leading-none mt-0.5">RAG-powered knowledge search</p>
              </div>
            </div>

            {/* Status + clear */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/8 border border-emerald-500/15">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-400">Online</span>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-[#E2E8F0] dark:border-[#1e2d4a] text-slate-600 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/5 transition-all text-[10px] font-medium"
                  title="Clear chat"
                >
                  <RotateCcw size={11} />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Controls row — KB + Document selectors */}
          <div className="flex items-center gap-2 px-4 pb-2.5 overflow-x-auto">
            {/* KB selector */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Database size={11} className="text-slate-600 dark:text-slate-500 flex-shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-500 flex-shrink-0">KB</span>
              <div className="relative">
                <select
                  value={selectedKbId}
                  onChange={e => handleKbChange(e.target.value)}
                  disabled={kbLoading || knowledgeBases.length === 0}
                  className="appearance-none bg-white dark:bg-[#0f1929] border border-[#E2E8F0] dark:border-[#1e2d4a] hover:border-violet-500/40 rounded-lg text-slate-800 dark:text-slate-200 text-xs pl-3 pr-7 py-1.5 cursor-pointer focus:outline-none focus:border-violet-500/60 transition-all min-w-[130px] max-w-[180px] truncate disabled:opacity-40"
                >
                  {kbLoading && <option>Loading…</option>}
                  {!kbLoading && knowledgeBases.length === 0 && <option>No knowledge bases</option>}
                  {knowledgeBases.map(kb => (
                    <option key={kb.id} value={kb.id}>{kb.name}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-500 pointer-events-none" />
              </div>
            </div>

            <div className="w-px h-4 bg-slate-200 dark:bg-[#1e2d4a] flex-shrink-0" />

            {/* Document selector */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <BookOpen size={11} className="text-slate-600 dark:text-slate-500 flex-shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-500 flex-shrink-0">Doc</span>
              <div className="relative">
                <select
                  value={selectedDocId}
                  onChange={e => setSelectedDocId(e.target.value)}
                  disabled={kbDocs.length === 0}
                  className="appearance-none bg-white dark:bg-[#0f1929] border border-[#E2E8F0] dark:border-[#1e2d4a] hover:border-violet-500/40 rounded-lg text-slate-800 dark:text-slate-200 text-xs pl-3 pr-7 py-1.5 cursor-pointer focus:outline-none focus:border-violet-500/60 transition-all min-w-[130px] max-w-[220px] truncate disabled:opacity-40"
                >
                  <option value="all">All Documents</option>
                  {kbDocs.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.filename}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Active filter badge */}
            {selectedDocId !== 'all' && selectedDoc && (
              <>
                <div className="w-px h-4 bg-slate-200 dark:bg-[#1e2d4a] flex-shrink-0" />
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 flex-shrink-0">
                  <FileText size={9} className="text-violet-400" />
                  <span className="text-[10px] text-violet-300 max-w-[120px] truncate font-medium">
                    {selectedDoc.filename?.split('.')[0]}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Error banner */}
          {kbError && (
            <div className="flex items-center gap-2 mx-4 mb-2 px-3 py-2 bg-amber-500/5 border border-amber-500/15 rounded-lg">
              <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-300">{kbError}</p>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════
            MESSAGES AREA — fills remaining height
        ══════════════════════════════════════════ */}
        <div
          ref={chatBodyRef}
          className="flex-1 overflow-y-auto chat-messages-scroll px-4 py-6 md:px-8"
        >
          {/* Welcome / empty state */}
          {messages.length === 0 && !loading && (
            <WelcomeScreen 
              selectedKb={selectedKb} 
              kbDocs={kbDocs} 
              onSuggestionClick={handleSuggestionClick} 
            />
          )}

          {/* Message list */}
          <div className="max-w-3xl mx-auto flex flex-col gap-5">
            {messages.map(msg => (
              <div key={msg.id} className="msg-animate">
                <MessageBubble msg={msg} kbDocs={kbDocs} />
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="msg-animate flex gap-3 flex-row">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-500/30 mt-0.5">
                  <Loader2 size={14} className="text-white animate-spin" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white dark:bg-[#141e33] border border-[#E2E8F0] dark:border-[#1e2d4a]">
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ══════════════════════════════════════════
            INPUT BAR — sticky bottom
        ══════════════════════════════════════════ */}
        <div className="flex-shrink-0 px-4 pb-4 pt-2 md:px-8 bg-[#FFFFFF] dark:bg-[#080e1a]/95 border-t border-[#E2E8F0] dark:border-[#1a2540] glass-input">
          <div className="max-w-3xl mx-auto">
            {/* Input container */}
            <div className={`glow-violet flex items-end gap-3 bg-white dark:bg-[#0d1624] border border-[#E2E8F0] dark:border-[#1e2d4a] rounded-2xl px-4 py-3 transition-all ${!isReady ? 'opacity-50 pointer-events-none' : ''}`}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  kbLoading ? 'Loading knowledge bases…'
                  : !selectedKbId ? 'Select a knowledge base to start…'
                  : selectedDocId !== 'all' && selectedDoc
                    ? `Ask about "${selectedDoc.filename?.split('.')[0]}"…`
                    : `Ask about ${selectedKb?.name || 'your documents'}…`
                }
                disabled={!isReady || loading}
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none text-slate-900 dark:text-slate-200 text-sm leading-relaxed placeholder-slate-400 dark:placeholder-slate-600 min-h-[24px] max-h-[140px] font-sans"
              />

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!input.trim() || !isReady || loading}
                className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed enabled:bg-gradient-to-br enabled:from-violet-600 enabled:to-indigo-600 enabled:hover:from-violet-500 enabled:hover:to-indigo-500 enabled:shadow-lg enabled:shadow-violet-500/25 enabled:hover:scale-105 enabled:active:scale-95"
              >
                {loading
                  ? <Loader2 size={16} className="text-slate-900 dark:text-white animate-spin" />
                  : <Send size={15} className="text-slate-900 dark:text-white" />
                }
              </button>
            </div>

            {/* Hint */}
            <p className="text-center text-[10px] text-slate-500 dark:text-slate-400 mt-2">
              <kbd className="bg-slate-100 dark:bg-[#141e33] border border-[#E2E8F0] dark:border-[#1e2d4a] rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-500 font-sans">Enter</kbd>
              {' '}to send &middot;{' '}
              <kbd className="bg-slate-100 dark:bg-[#141e33] border border-[#E2E8F0] dark:border-[#1e2d4a] rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-500 font-sans">Shift+Enter</kbd>
              {' '}for new line &middot; AI may make mistakes
            </p>
          </div>
        </div>

      </div>
    </>
  );
}
