import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Sparkles, Loader2, AlertTriangle,
  ChevronDown, Database, Trash2, Volume2, VolumeX,
  BookOpen, FileText, Link as LinkIcon, MessageSquare,
  Zap, Copy, Check, RotateCcw, Mic, MessageCircle, Compass
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';

// ── Typing Dots ──────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex gap-1 items-center py-1 px-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Audio Player ─────────────────────────────────────────────────────────────
function AudioPlayer({ url }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div className="mt-2.5 flex items-center gap-2">
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} className="hidden" />
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-3.5 py-1.5 rounded-full transition-all cursor-pointer active:scale-95"
      >
        {playing ? <VolumeX size={11} /> : <Volume2 size={11} />}
        {playing ? 'Pause' : 'Listen AI Speech'}
      </button>
    </div>
  );
}

// ── Copy Button ──────────────────────────────────────────────────────────────
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
      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
      title="Copy message"
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}>
      {/* Avatar */}
      <div className={`
        flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold
        ${isUser
          ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm'
          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
        }
      `}>
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`
          relative px-4.5 py-3.5 rounded-2xl text-xs font-medium leading-relaxed shadow-sm
          ${isUser
            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-sm'
            : msg.isError
              ? 'bg-rose-50 dark:bg-rose-500/5 border border-rose-250 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 rounded-tl-sm'
              : 'bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 text-slate-850 dark:text-slate-200 rounded-tl-sm'
          }
        `}>
          <p className="whitespace-pre-wrap break-words leading-relaxed font-medium">{msg.content}</p>

          {/* Sources */}
          {!isUser && msg.context && msg.context.length > 0 && (
            <div className="mt-3.5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80">
              <span className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 font-heading">
                <MessageSquare size={10} /> Ingested References
              </span>
              <div className="flex flex-wrap gap-1.5">
                {msg.context.slice(0, 3).map((ctx, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[9px] text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/10 dark:border-indigo-500/25 rounded-md px-2 py-0.5 max-w-[180px] truncate font-bold uppercase tracking-wider">
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

        {/* Action controls under bubble */}
        {!isUser && (
          <div className="flex items-center gap-1.5 px-1.5 mt-0.5">
            <CopyButton text={msg.content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Welcome Screen ───────────────────────────────────────────────────────────
function WelcomeScreen({ selectedKb, kbDocs, onSuggestionClick }) {
  const suggestions = [
    'Summarize the key points in this document',
    'What are the main topics covered?',
    'Explain the most important findings',
    'Give me a brief overview of this knowledge base',
  ];
  return (
    <div className="flex flex-col items-center justify-center h-full gap-7 px-6 py-12 text-center">
      {/* Logo */}
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/15">
          <Sparkles size={28} className="text-white" />
        </div>
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-950 flex items-center justify-center animate-pulse">
          <span className="w-1 h-1 rounded-full bg-white"></span>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1.5 tracking-tight font-heading">
          AI Agent RAG Sandbox
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold max-w-md leading-relaxed">
          {selectedKb
            ? <>Querying directory <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">"{selectedKb.name}"</span>
              {kbDocs.length > 0 && <> with {kbDocs.length} indexed document{kbDocs.length !== 1 ? 's' : ''}</>}</>
            : 'Select a knowledge folder from the toolbar to begin testing.'
          }
        </p>
      </div>

      {/* Suggestion Chips */}
      {selectedKb && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl mt-3">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s)}
              className="text-left px-4.5 py-3 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-indigo-500/40 text-slate-600 dark:text-slate-350 text-xs font-semibold leading-relaxed transition-all cursor-pointer group flex items-start gap-2.5 shadow-sm active:scale-98"
            >
              <Compass size={14} className="text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 shrink-0 mt-0.5 transition-colors" />
              <span className="group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [selectedKbId, setSelectedKbId] = useState('');
  const [kbDocs, setKbDocs] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('all');
  const [kbLoading, setKbLoading] = useState(true);
  const [kbError, setKbError] = useState('');

  const [voiceMode, setVoiceMode] = useState(false);

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
      const exists = knowledgeBases.some(k => String(k.id) === String(selectedKbId));
      if (!selectedKbId || !exists) {
        setSelectedKbId(knowledgeBases[0].id);
        return;
      }

      const kb = knowledgeBases.find(k => String(k.id) === String(selectedKbId));
      setKbDocs(kb?.documents || []);
      
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
      const history = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      const payload = { 
        knowledge_base_id: selectedKbId, 
        query: trimmed,
        history,
        mode: voiceMode ? 'voice' : 'chat',
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
      <style>{`
        .chat-fullscreen-escape {
          margin: -2rem;
          height: calc(100vh - 5rem);
        }
        @media (max-width: 768px) {
          .chat-fullscreen-escape { margin: -1rem; }
        }
        .chat-messages-scroll::-webkit-scrollbar { width: 4px; }
        .chat-messages-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-messages-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
        .dark .chat-messages-scroll::-webkit-scrollbar-thumb { background: #1e293b; }
        .chat-messages-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
        .dark .chat-messages-scroll { scrollbar-color: #1e293b transparent; }
        
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-animate { animation: fadeUp 0.2s ease-out forwards; }
        
        .gradient-text {
          background: linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>

      {/* Main Container */}
      <div className="chat-fullscreen-escape flex flex-col bg-background overflow-hidden border-t border-slate-200 dark:border-slate-800/60">

        {/* Toolbar Header Panel */}
        <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 backdrop-blur-xl z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/15">
                <Sparkles size={16} className="text-white animate-pulse" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold leading-none gradient-text font-heading">AI Agent Sandbox</h1>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Test vector similarity & RAG queries</p>
              </div>
            </div>

            {/* Config & Action controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Voice Mode Toggle Button */}
              <button
                onClick={() => setVoiceMode(v => !v)}
                title={voiceMode ? 'Use Chat Mode for full details' : 'Use Voice Mode to preview short phone actions'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                  voiceMode
                    ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {voiceMode ? <Mic size={11} className="text-indigo-500" /> : <MessageCircle size={11} />}
                {voiceMode ? 'Voice Mode' : 'Chat Mode'}
              </button>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Active</span>
              </div>
              
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-all text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                >
                  <RotateCcw size={11} />
                  Reset Chat
                </button>
              )}
            </div>
          </div>

          {/* Directory Context strip */}
          <div className="flex flex-wrap items-center gap-4 px-6 pb-3 overflow-x-auto text-xs border-t border-slate-100 dark:border-slate-800/40 pt-2.5">
            <div className="flex items-center gap-2 shrink-0">
              <Database size={12} className="text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide font-heading">Source Folder</span>
              <div className="relative">
                <select
                  value={selectedKbId}
                  onChange={e => handleKbChange(e.target.value)}
                  disabled={kbLoading || knowledgeBases.length === 0}
                  className="appearance-none bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-slate-850 dark:text-slate-200 text-xs pl-3 pr-8 py-1.5 cursor-pointer focus:outline-none focus:border-indigo-500 transition-all font-semibold min-w-[130px] max-w-[200px] truncate disabled:opacity-40"
                >
                  {kbLoading && <option>Syncing…</option>}
                  {!kbLoading && knowledgeBases.length === 0 && <option>No directories</option>}
                  {knowledgeBases.map(kb => (
                    <option key={kb.id} value={kb.id}>{kb.name}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div className="hidden sm:block w-px h-4 bg-slate-200 dark:bg-slate-850 shrink-0" />

            <div className="flex items-center gap-2 shrink-0">
              <BookOpen size={12} className="text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide font-heading">Document Filter</span>
              <div className="relative">
                <select
                  value={selectedDocId}
                  onChange={e => setSelectedDocId(e.target.value)}
                  disabled={kbDocs.length === 0}
                  className="appearance-none bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-slate-850 dark:text-slate-200 text-xs pl-3 pr-8 py-1.5 cursor-pointer focus:outline-none focus:border-indigo-500 transition-all font-semibold min-w-[130px] max-w-[220px] truncate disabled:opacity-40"
                >
                  <option value="all">Query All Files</option>
                  {kbDocs.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.filename}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {selectedDocId !== 'all' && selectedDoc && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 shrink-0">
                <FileText size={10} className="text-indigo-600 dark:text-indigo-400" />
                <span className="text-[9px] text-indigo-700 dark:text-indigo-400 font-extrabold uppercase tracking-wide max-w-[150px] truncate">
                  {selectedDoc.filename}
                </span>
              </div>
            )}
          </div>

          {kbError && (
            <div className="flex items-center gap-2 mx-6 mb-3 px-3 py-2 bg-amber-500/5 border border-amber-500/15 rounded-xl">
              <AlertTriangle size={13} className="text-amber-500 shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">{kbError}</p>
            </div>
          )}
        </div>

        {/* Conversation Board */}
        <div
          ref={chatBodyRef}
          className="flex-1 overflow-y-auto chat-messages-scroll px-6 py-6 md:px-8"
        >
          {messages.length === 0 && !loading && (
            <WelcomeScreen 
              selectedKb={selectedKb} 
              kbDocs={kbDocs} 
              onSuggestionClick={handleSuggestionClick} 
            />
          )}

          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            {messages.map(msg => (
              <div key={msg.id} className="msg-animate">
                <MessageBubble msg={msg} />
              </div>
            ))}

            {/* Loading / Typing entry */}
            {loading && (
              <div className="msg-animate flex gap-3.5 flex-row">
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm shrink-0">
                  <Loader2 size={15} className="text-indigo-600 dark:text-indigo-400 animate-spin" />
                </div>
                <div className="px-4.5 py-3.5 rounded-2xl rounded-tl-sm bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Console Area */}
        <div className="flex-shrink-0 px-6 pb-6 pt-3 md:px-8 bg-white dark:bg-slate-900/60 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800/60">
          <div className="max-w-3xl mx-auto">
            
            {voiceMode && (
              <div className="flex items-start gap-2.5 mb-3 px-4 py-3 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                <Mic size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  <strong className="text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">Voice Response Simulator ON</strong>: The AI agent uses direct, punchy, conversational replies suitable for synthesis (1–2 sentences max). Turn this mode off for standard, comprehensive RAG chat analysis.
                </p>
              </div>
            )}

            {/* Input Wrapper */}
            <div className={`flex items-end gap-3.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-250 dark:border-slate-800 rounded-2xl px-4 py-3.5 focus-within:border-indigo-500/50 focus-within:bg-white dark:focus-within:bg-slate-950 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all ${!isReady ? 'opacity-50 pointer-events-none' : ''}`}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  kbLoading ? 'Syncing knowledge resources…'
                  : !selectedKbId ? 'Please select a source folder…'
                  : selectedDocId !== 'all' && selectedDoc
                    ? `Query file: "${selectedDoc.filename?.split('.')[0]}"…`
                    : `Query directory: "${selectedKb?.name}"…`
                }
                disabled={!isReady || loading}
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none text-slate-900 dark:text-slate-250 text-xs font-semibold leading-relaxed placeholder-slate-400 dark:placeholder-slate-600 min-h-[20px] max-h-[140px] font-sans"
              />

              {/* Submit Trigger */}
              <button
                onClick={handleSend}
                disabled={!input.trim() || !isReady || loading}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-md shadow-indigo-500/10 hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin text-white" />
                ) : (
                  <Send size={14} className="text-white" />
                )}
              </button>
            </div>

            {/* Quick Helper hint */}
            <p className="text-center text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-2.5 tracking-wide uppercase">
              Press <kbd className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-md px-1.5 py-0.5 text-slate-500 font-sans">Enter</kbd> to dispatch &middot; <kbd className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-md px-1.5 py-0.5 text-slate-500 font-sans">Shift + Enter</kbd> for multi-line
            </p>
          </div>
        </div>

      </div>
    </>
  );
}
