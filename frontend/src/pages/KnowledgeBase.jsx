import { useState, useEffect, useRef } from 'react';
import {
  Upload, Link as LinkIcon, FileText, Trash2, Database, Loader2,
  Phone, PhoneCall, CheckCircle2, AlertCircle, Mic,
  BookOpen, ChevronDown, RefreshCw, X, Clock, Sparkles, Plus, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';

// ── Phone number E.164 validation (Indian + international) ──────────────────
const E164_RE = /^\+?[1-9]\d{6,14}$/;

function normalizePhone(raw) {
  const cleaned = raw.replace(/[\s\-().]/g, '');
  return cleaned.startsWith('+') ? cleaned : '+' + cleaned;
}

// ── Status badge helper ──────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    failed:    'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    processing:'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 animate-pulse',
    queued:    'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  };
  return (
    <span className={`text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border tracking-wide ${map[status] || 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
      {status}
    </span>
  );
}

// Container animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { y: 15, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 20 } }
};

// ── Test AI Agent Panel ──────────────────────────────────────────────────────
function TestCallPanel({ knowledgeBases, selectedKbId, setSelectedKbId }) {
  const [phone, setPhone]           = useState('');
  const [scriptId, setScriptId]     = useState('');
  const [scripts, setScripts]       = useState([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [calling, setCalling]       = useState(false);
  const [callStatus, setCallStatus] = useState(null); // null | 'success' | 'error'
  const [callMsg, setCallMsg]       = useState('');
  const [callSid, setCallSid]       = useState('');
  const [countdown, setCountdown]   = useState(0);
  const timerRef = useRef(null);

  // Derive selected KB docs count
  const selectedKb = knowledgeBases.find(k => k.id === selectedKbId);
  const docCount   = selectedKb?.documents?.length || 0;

  // Load scripts for optional override
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingScripts(true);
        const res = await api.get('/scripts');
        setScripts(res.data.scripts || []);
      } catch { setScripts([]); }
      finally { setLoadingScripts(false); }
    };
    load();
  }, []);

  // Auto-clear success after countdown
  useEffect(() => {
    if (callStatus === 'success') {
      setCountdown(30);
      timerRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(timerRef.current); return 0; }
          return c - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  const normalizedPhone = phone.trim() ? normalizePhone(phone.trim()) : '';
  const phoneValid      = normalizedPhone ? E164_RE.test(normalizedPhone) : null;
  const canCall         = phoneValid && !!selectedKbId && docCount > 0 && !calling;

  const handleCall = async () => {
    if (!canCall) return;
    try {
      setCalling(true);
      setCallStatus(null);
      setCallMsg('');

      const payload = {
        phone_number: normalizedPhone,
        knowledge_base_id: selectedKbId,
      };
      if (scriptId) payload.script_id = scriptId;

      const res = await api.post('/agent/call', payload);
      const sid = res.data?.data?.call_sid || '';
      setCallSid(sid);
      setCallStatus('success');
      setCallMsg(res.data?.data?.message || 'Call initiated! Your phone will ring shortly.');
      setPhone('');
    } catch (err) {
      setCallStatus('error');
      setCallMsg(err?.response?.data?.error || 'Failed to initiate test call. Check your VoiceLink configuration.');
    } finally {
      setCalling(false);
    }
  };

  const reset = () => {
    setCallStatus(null);
    setCallMsg('');
    setCallSid('');
    clearInterval(timerRef.current);
  };

  return (
    <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 shadow-sm rounded-3xl overflow-hidden flex flex-col justify-between">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800/60 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
          <PhoneCall size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight font-heading">AI Sandbox Dialer</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Test call routing & KB document retrieval</p>
        </div>
      </div>

      <div className="p-6 space-y-5 flex-1">
        {/* Status indicator strip */}
        <div className="flex flex-wrap gap-2">
          <CompactChip done={docCount > 0} warn={docCount === 0}
            label={docCount > 0 ? `${docCount} Doc${docCount !== 1 ? 's' : ''}` : 'Empty KB'} />
          <CompactChip done={!!selectedKbId}
            label={selectedKbId ? 'KB Linked' : 'Link KB'} />
          <CompactChip done={scripts.length > 0} optional
            label={scripts.length > 0 ? `${scripts.length} Script${scripts.length !== 1 ? 's' : ''}` : 'No script override'} />
        </div>

        {/* KB selection & Script override */}
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 font-heading">
              Folder Source
            </label>
            <div className="relative">
              <select
                value={selectedKbId}
                onChange={e => setSelectedKbId(e.target.value)}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 pr-8 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all font-semibold cursor-pointer"
              >
                {knowledgeBases.length === 0
                  ? <option value="">No folders</option>
                  : knowledgeBases.map(kb => (
                    <option key={kb.id} value={kb.id}>
                      {kb.name}
                    </option>
                  ))
                }
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 font-heading">
              Behavior Script
            </label>
            <div className="relative">
              <select
                value={scriptId}
                onChange={e => setScriptId(e.target.value)}
                disabled={loadingScripts}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 pr-8 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-50 font-semibold cursor-pointer"
              >
                <option value="">Default Flow</option>
                {scripts.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Phone Input */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 font-heading">
            Dail-to Phone Number
          </label>
          <div className="relative">
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canCall && handleCall()}
              placeholder="+12345678900"
              className={`w-full bg-slate-50 dark:bg-slate-950/40 border rounded-xl py-2.5 px-3.5 text-slate-900 dark:text-slate-200 text-xs focus:outline-none transition-all focus:ring-2 pr-16 font-semibold ${
                phone.trim() === ''
                  ? 'border-slate-200 dark:border-slate-800 focus:border-amber-500 focus:ring-amber-500/25'
                  : phoneValid
                    ? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/20'
                    : 'border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/20'
              }`}
            />
            {phone.trim() && (
              <span className={`absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] font-extrabold tracking-wider ${phoneValid ? 'text-emerald-500' : 'text-rose-500'}`}>
                {phoneValid ? 'VALID' : 'INVALID'}
              </span>
            )}
          </div>
        </div>

        {/* Message Banner Alerts */}
        <AnimatePresence mode="wait">
          {callStatus === 'success' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex items-start gap-3"
            >
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Incoming Voice Call Initiated</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium leading-relaxed">{callMsg}</p>
                {countdown > 0 && (
                  <p className="text-[9px] text-indigo-600 dark:text-indigo-400 font-extrabold mt-1">
                    Auto-clearing in {countdown}s...
                  </p>
                )}
              </div>
              <button onClick={reset} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"><X size={12} /></button>
            </motion.div>
          )}

          {callStatus === 'error' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3.5 flex items-start gap-3"
            >
              <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-rose-800 dark:text-rose-300">Call Dispatch Failed</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium leading-relaxed">{callMsg}</p>
              </div>
              <button onClick={reset} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"><X size={12} /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Dial Trigger */}
      <div className="p-6 pt-0">
        <button
          onClick={handleCall}
          disabled={!canCall}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all active:scale-98 shadow-sm cursor-pointer ${
            canCall
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-orange-500/10'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
          }`}
        >
          {calling ? (
            <><Loader2 size={14} className="animate-spin" /> DISPATCHING...</>
          ) : (
            <><PhoneCall size={14} /> TRIGGER SANDBOX CALL</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Compact status chip ──────────────────────────────────────────────────────
function CompactChip({ done, label, warn = false, optional = false }) {
  const base = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wide border';
  if (done)     return <span className={`${base} bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400`}><CheckCircle2 size={10} />{label}</span>;
  if (warn)     return <span className={`${base} bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400`}><AlertCircle size={10} />{label}</span>;
  if (optional) return <span className={`${base} bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500`}><Clock size={10} />{label}</span>;
  return <span className={`${base} bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400`}><Clock size={10} />{label}</span>;
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function KnowledgeBase() {
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [documents, setDocuments]           = useState([]);
  const [jobs, setJobs]                     = useState([]);
  const [urlInput, setUrlInput]             = useState('');
  const [loading, setLoading]               = useState(true);
  const [uploading, setUploading]           = useState(false);
  const [processingUrl, setProcessingUrl]   = useState(false);
  const [error, setError]                   = useState('');
  const fileInputRef = useRef(null);

  const [selectedKbId, setSelectedKbId]   = useState('');
  const [newKbName, setNewKbName]         = useState('');
  const [creatingKb, setCreatingKb]       = useState(false);
  const [refreshingJobs, setRefreshingJobs] = useState(false);

  const selectedKb = knowledgeBases.find(k => k.id === selectedKbId);
  const selectedKbName = selectedKb?.name || '';
  const filteredDocuments = selectedKbId
    ? documents.filter(doc => doc.knowledge_base_id === selectedKbId)
    : documents;

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/knowledge/list');
      const kbs = res.data.knowledge_bases || [];
      setKnowledgeBases(kbs);
      if (kbs.length > 0) setSelectedKbId(prev => prev || kbs[0].id);
      const allDocs = kbs.reduce((acc, kb) => [...acc, ...(kb.documents || [])], []);
      setDocuments(allDocs);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch documents.');
    } finally {
      setLoading(false);
    }
  };

  const fetchJobs = async (quietly = false) => {
    try {
      if (!quietly) setRefreshingJobs(true);
      const res = await api.get('/knowledge/ingestion-jobs');
      setJobs(res.data.ingestion_jobs || []);
    } catch { /* silent */ }
    finally { setRefreshingJobs(false); }
  };

  const createKb = async () => {
    if (!newKbName.trim()) return;
    try {
      setCreatingKb(true);
      const res = await api.post('/knowledge/list', { name: newKbName });
      setNewKbName('');
      fetchDocuments();
      setSelectedKbId(res.data.knowledge_base.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create Knowledge Base');
    } finally { setCreatingKb(false); }
  };

  useEffect(() => {
    fetchDocuments();
    fetchJobs(true);
    const interval = setInterval(() => fetchJobs(true), 8000);
    return () => clearInterval(interval);
  }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    if (selectedKbId) formData.append('knowledge_base_id', selectedKbId);
    try {
      setUploading(true);
      setError('');
      await api.post('/knowledge/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      fetchJobs();
      fetchDocuments();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;
    try {
      setProcessingUrl(true);
      setError('');
      await api.post('/knowledge/url', { url: urlInput, knowledge_base_id: selectedKbId });
      setUrlInput('');
      fetchJobs();
      fetchDocuments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process URL');
    } finally { setProcessingUrl(false); }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await api.delete(`/knowledge/document/${docId}`);
      setError('');
      fetchDocuments();
      fetchJobs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete document');
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-[1600px] mx-auto pb-12 px-4 md:px-0">
      
      {/* Header Panel */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-white dark:bg-slate-900/40 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/50 backdrop-blur-xl shadow-sm"
      >
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/25">
              <Database size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 dark:from-amber-400 dark:via-orange-400 dark:to-rose-400 tracking-tight">
              Knowledge Repository
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium ml-1">
            Feed information sources (PDFs, Web links) to keep your AI agents continuously updated.
          </p>
        </div>
      </motion.div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 rounded-2xl text-rose-600 dark:text-rose-400 text-sm">
          <AlertCircle size={16} className="shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto hover:text-rose-800 dark:hover:text-rose-200 transition-colors cursor-pointer"><X size={14} /></button>
        </div>
      )}

      {/* Row 1: KB Folders + Ingestion Queue */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-12 gap-8"
      >
        
        {/* KB Folders */}
        <motion.div 
          variants={itemVariants}
          className="md:col-span-6 bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 shadow-sm rounded-3xl p-6 flex flex-col justify-between"
        >
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1.5 flex items-center gap-2 font-heading">
              <Database size={18} className="text-amber-500" /> Knowledge Directories
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-6 leading-relaxed">
              Create separate context folders for specific campaigns (e.g., FAQ, product catalogues).
            </p>
            
            <div className="flex gap-2.5 mb-6">
              <input
                type="text"
                value={newKbName}
                onChange={e => setNewKbName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createKb()}
                placeholder="Directory name (e.g., Sales FAQ)"
                className="flex-1 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-4 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 text-sm font-semibold transition-all focus:ring-2 focus:ring-indigo-500/10"
              />
              <button
                onClick={createKb}
                disabled={creatingKb || !newKbName.trim()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                {creatingKb ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
              </button>
            </div>
          </div>

          <div className="space-y-2.5 bg-slate-50 dark:bg-slate-950/40 p-4.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/50">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-heading">
              Active Directory
            </label>
            <div className="relative mt-1">
              <select
                value={selectedKbId}
                onChange={e => setSelectedKbId(e.target.value)}
                className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3.5 pr-10 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 transition-all font-semibold cursor-pointer shadow-sm"
              >
                {knowledgeBases.map(kb => (
                  <option key={kb.id} value={kb.id}>{kb.name} ({kb.documents?.length || 0} items)</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </motion.div>

        {/* Ingestion Queue */}
        <motion.div 
          variants={itemVariants}
          className="md:col-span-6 bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 shadow-sm rounded-3xl p-6 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2 font-heading">
                <RefreshCw size={18} className="text-indigo-500" /> Vector Processing Queue
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium leading-relaxed">
                Ingested resources being chunked and indexed into the FAISS vector database.
              </p>
            </div>
            <button
              onClick={() => fetchJobs()}
              disabled={refreshingJobs}
              className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all cursor-pointer shrink-0"
              title="Refresh"
            >
              <RefreshCw size={14} className={refreshingJobs ? 'animate-spin' : ''} />
            </button>
          </div>
          
          <div className="space-y-2.5 max-h-[195px] overflow-y-auto pr-1.5 custom-scrollbar flex-1 flex flex-col justify-center">
            {jobs.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-400 font-semibold m-auto py-8">No current indexing jobs in queue.</p>
            ) : (
              jobs.slice(0, 15).map(job => (
                <div key={job.id} className="border border-slate-200 dark:border-slate-800/50 rounded-xl p-3 flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/30">
                  <div className="min-w-0">
                    <p className="text-slate-800 dark:text-slate-200 text-xs font-bold truncate">{job.source_name}</p>
                    {job.error_message && <p className="text-rose-500 text-[10px] truncate mt-0.5 font-medium">{job.error_message}</p>}
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Row 2: Upload + URL + Test Call */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-3 gap-8"
      >
        
        {/* Upload File */}
        <motion.div 
          variants={itemVariants}
          className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 shadow-sm rounded-3xl p-6"
        >
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2 font-heading">
            <Upload size={18} className="text-indigo-500" /> Upload File
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-6 leading-relaxed">
            Attach document resources directly to the selected knowledge directory.
          </p>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".pdf,.docx,.txt" />
          
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`border border-dashed rounded-2xl p-6.5 flex flex-col items-center justify-center text-center transition-all ${
              uploading
                ? 'border-indigo-500/40 bg-indigo-500/5 cursor-not-allowed'
                : 'border-slate-300 dark:border-slate-800 hover:border-indigo-500/40 hover:bg-slate-50 dark:hover:bg-slate-900/20 cursor-pointer group'
            }`}
          >
            <div className="w-12 h-12 bg-indigo-500/10 dark:bg-indigo-500/25 rounded-2xl flex items-center justify-center mb-3.5 group-hover:scale-105 transition-all duration-300">
              {uploading
                ? <Loader2 size={22} className="text-indigo-500 animate-spin" />
                : <FileText size={22} className="text-indigo-600 dark:text-indigo-400" />}
            </div>
            <p className="text-slate-800 dark:text-slate-200 font-bold mb-0.5 text-xs">
              {uploading ? 'Processing File...' : 'Drag & Drop or Click'}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mb-4">PDF, DOCX, TXT up to 10MB</p>
            <button disabled={uploading} className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-extrabold uppercase tracking-wide transition-colors cursor-pointer">
              Choose File
            </button>
          </div>
        </motion.div>

        {/* Add URL */}
        <motion.div 
          variants={itemVariants}
          className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 shadow-sm rounded-3xl p-6 flex flex-col justify-between"
        >
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2 font-heading">
              <LinkIcon size={18} className="text-emerald-500" /> Scrape Web URL
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-6 leading-relaxed">
              Scrape and index public web pages, document guides, or online knowledge bases.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 font-heading">Website Link</label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !processingUrl && urlInput.trim() && handleAddUrl()}
                  placeholder="https://docs.brand.com/faq"
                  className="w-full bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3.5 text-slate-900 dark:text-slate-200 text-xs focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 font-semibold transition-all"
                />
              </div>
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={handleAddUrl}
              disabled={processingUrl || !urlInput.trim()}
              className="w-full py-3 flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-sm shadow-emerald-500/10"
            >
              {processingUrl ? <><Loader2 size={14} className="animate-spin" /> SCRAPING LINK...</> : 'SCRAPE & INDEX SOURCE'}
            </button>
          </div>
        </motion.div>

        {/* Test AI Agent Panel */}
        <motion.div variants={itemVariants}>
          <TestCallPanel
            knowledgeBases={knowledgeBases}
            selectedKbId={selectedKbId}
            setSelectedKbId={setSelectedKbId}
          />
        </motion.div>
      </motion.div>

      {/* Document List */}
      <motion.div 
        variants={itemVariants}
        initial="hidden"
        animate="show"
        className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 shadow-sm rounded-3xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/30">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 font-heading">
            <Database size={18} className="text-amber-500" /> Indexed Data Sources {selectedKbName && <span className="text-sm font-medium text-slate-500 dark:text-slate-400">({selectedKbName})</span>}
          </h2>
          <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700/80">{filteredDocuments.length} Sources</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/60">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-heading">Name / Origin</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-heading">Format</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-heading">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-heading">Index Date</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-heading text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-16 text-center text-slate-400 font-semibold">
                    <Loader2 size={22} className="animate-spin mx-auto mb-2 text-indigo-500" />
                    Loading indexing directory...
                  </td>
                </tr>
              ) : filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-20 text-center">
                    <BookOpen size={36} className="mx-auto mb-3 text-slate-300/40 dark:text-slate-700 animate-pulse" />
                    <p className="text-slate-800 dark:text-slate-400 text-sm font-bold">This directory is empty</p>
                    <p className="text-slate-400 dark:text-slate-500 text-xs mt-1 font-medium">Upload a document file or add a URL above to populate it.</p>
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc, idx) => (
                  <tr key={doc.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl border shrink-0 ${
                          doc.file_type === 'url'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                        }`}>
                          {doc.file_type === 'url' ? <LinkIcon size={14} /> : <FileText size={14} />}
                        </div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-sm text-xs" title={doc.filename}>{doc.filename}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500">{doc.file_type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-bold">Synchronized</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 font-semibold">{new Date(doc.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleDelete(doc.id)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 p-2.5 rounded-xl transition-all cursor-pointer">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

    </div>
  );
}
