import { useState, useEffect, useRef } from 'react';
import {
  Upload, Link as LinkIcon, FileText, Trash2, Database, Loader2,
  Phone, PhoneCall, CheckCircle2, AlertCircle, Mic,
  BookOpen, ChevronDown, RefreshCw, X, Clock
} from 'lucide-react';
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
    completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    failed:    'bg-red-500/10 text-red-400 border-red-500/20',
    processing:'bg-amber-500/10 text-amber-400 border-amber-500/20',
    queued:    'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  };
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
      {status}
    </span>
  );
}

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
      // If user picked a script, include it (agent/call supports script_id)
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
    <div className="bg-white dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0">
          <PhoneCall size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">Personal AI Agent</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">AI will call your number — answer to test</p>
        </div>
      </div>

      <div className="p-5 space-y-4">

        {/* Compact Readiness Strip */}
        <div className="flex flex-wrap gap-2">
          <CompactChip done={docCount > 0} warn={docCount === 0}
            label={docCount > 0 ? `${docCount} doc${docCount !== 1 ? 's' : ''}` : 'No docs'} />
          <CompactChip done={!!selectedKbId}
            label={selectedKbId ? 'KB selected' : 'Select KB'} />
          <CompactChip done={scripts.length > 0} optional
            label={scripts.length > 0 ? `${scripts.length} script${scripts.length !== 1 ? 's' : ''}` : 'No script'} />
        </div>

        {/* Knowledge Base + Script in one row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Database size={10} className="text-indigo-500" /> KB
            </label>
            <div className="relative">
              <select
                value={selectedKbId}
                onChange={e => setSelectedKbId(e.target.value)}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 pr-6 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              >
                {knowledgeBases.length === 0
                  ? <option value="">No KBs</option>
                  : knowledgeBases.map(kb => (
                    <option key={kb.id} value={kb.id}>
                      {kb.name} ({kb.documents?.length || 0})
                    </option>
                  ))
                }
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Mic size={10} className="text-violet-500" /> Script <span className="text-slate-500 font-normal">(opt)</span>
            </label>
            <div className="relative">
              <select
                value={scriptId}
                onChange={e => setScriptId(e.target.value)}
                disabled={loadingScripts}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 pr-6 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all disabled:opacity-50"
              >
                <option value="">Default (no script)</option>
                {scripts.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Phone number input */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1.5">
            <Phone size={10} className="text-amber-500" /> Your Phone Number
            <span className="text-slate-500 font-normal text-[10px]">— AI will call you</span>
          </label>
          <div className="relative">
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canCall && handleCall()}
              placeholder="+1 234 567 8900 or 12345678900"
              className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-200 text-sm focus:outline-none transition-all focus:ring-1 pr-24 ${
                phone.trim() === ''
                  ? 'border-slate-200 dark:border-slate-700 focus:border-amber-500 focus:ring-amber-500'
                  : phoneValid
                    ? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500'
                    : 'border-red-500/50 focus:border-red-500 focus:ring-red-500'
              }`}
            />
            {phone.trim() && (
              <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono font-semibold ${phoneValid ? 'text-emerald-400' : 'text-red-400'}`}>
                {phoneValid ? normalizedPhone : 'Invalid'}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Numbers are auto-prefixed with + if missing.</p>
        </div>

        {/* Call Status */}
        {callStatus === 'success' && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-2.5">
            <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-300">📞 Your phone is ringing! Answer it.</p>
              {countdown > 0 && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Ringing within <span className="text-amber-400 font-bold">{countdown}s</span> · Don't put it on silent
                </p>
              )}
              {callSid && <p className="text-[9px] text-slate-600 mt-1 font-mono">SID: {callSid}</p>}
            </div>
            <button onClick={reset} className="text-slate-500 hover:text-slate-300 flex-shrink-0"><X size={13} /></button>
          </div>
        )}

        {callStatus === 'error' && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex items-start gap-2.5">
            <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-300">Call Failed</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{callMsg}</p>
            </div>
            <button onClick={reset} className="text-slate-500 hover:text-slate-300 flex-shrink-0"><X size={13} /></button>
          </div>
        )}

        {/* Call Button */}
        <button
          onClick={handleCall}
          disabled={!canCall}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg ${
            canCall
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-amber-500/25 hover:shadow-amber-500/40'
              : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
          }`}
        >
          {calling ? (
            <><Loader2 size={15} className="animate-spin" /> Dialing...</>
          ) : (
            <><PhoneCall size={15} /> Call Me Now</>
          )}
        </button>

        {/* Why disabled hint */}
        {!canCall && !calling && (
          <p className="text-[10px] text-slate-500 text-center">
            {docCount === 0
              ? '⚠ Upload docs to KB first'
              : !phone.trim()
                ? 'Enter your number → AI will call you'
                : !phoneValid
                  ? '⚠ Invalid phone number'
                  : 'Complete setup above'}
          </p>
        )}

        {/* How it works — compact */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/40 px-3.5 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">How it works</p>
          <div className="space-y-1.5">
            {[
              ['📲', 'AI dials your number — you receive the call'],
              ['🗣', 'Speak naturally — AI listens & replies'],
              ['🔍', 'AI searches your Knowledge Base for answers'],
              ['📊', 'Call ends → transcript on Live Dashboard'],
            ].map(([icon, text], i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="text-sm leading-none">{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Compact status chip ──────────────────────────────────────────────────────
function CompactChip({ done, label, warn = false, optional = false }) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border';
  if (done)     return <span className={`${base} bg-emerald-500/10 border-emerald-500/20 text-emerald-400`}><CheckCircle2 size={9} />{label}</span>;
  if (warn)     return <span className={`${base} bg-red-500/10 border-red-500/20 text-red-400`}><AlertCircle size={9} />{label}</span>;
  if (optional) return <span className={`${base} bg-slate-500/10 border-slate-500/20 text-slate-500`}><Clock size={9} />{label}</span>;
  return <span className={`${base} bg-amber-500/10 border-amber-500/20 text-amber-400`}><Clock size={9} />{label}</span>;
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
    // Poll jobs every 8s while any are processing
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
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">Knowledge Base</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage the data sources your AI agent uses to answer questions on live calls.</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Row 1: KB Folders + Ingestion Queue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* KB Folders */}
        <div className="bg-white dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-2xl p-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Database className="text-amber-500 dark:text-amber-400" /> Knowledge Folders
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">Organize docs into folders. Each folder can be linked to different campaigns.</p>
          <div className="flex gap-2 mb-5">
            <input
              type="text"
              value={newKbName}
              onChange={e => setNewKbName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createKb()}
              placeholder="Folder name (e.g. Real Estate FAQ)"
              className="flex-1 bg-slate-50 dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
            />
            <button
              onClick={createKb}
              disabled={creatingKb || !newKbName.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {creatingKb ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-wider">Active Folder for Uploads</label>
            <select
              value={selectedKbId}
              onChange={e => setSelectedKbId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {knowledgeBases.map(kb => (
                <option key={kb.id} value={kb.id}>{kb.name} ({kb.documents?.length || 0} docs)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Ingestion Queue */}
        <div className="bg-white dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Ingestion Queue</h2>
            <button
              onClick={() => fetchJobs()}
              disabled={refreshingJobs}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={refreshingJobs ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
            {jobs.length === 0 ? (
              <p className="text-slate-500 text-sm">No ingestion jobs yet.</p>
            ) : jobs.slice(0, 15).map(job => (
              <div key={job.id} className="border border-[#E2E8F0] dark:border-slate-700/50 rounded-lg p-2.5 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/30">
                <div className="min-w-0">
                  <p className="text-slate-700 dark:text-slate-300 text-xs font-medium truncate">{job.source_name}</p>
                  {job.error_message && <p className="text-red-400 text-[10px] truncate">{job.error_message}</p>}
                </div>
                <StatusBadge status={job.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Upload + URL + Test Call */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Upload File */}
        <div className="bg-white dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-2xl p-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Upload className="text-indigo-500 dark:text-indigo-400" /> Upload File
          </h2>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".pdf,.docx,.txt" />
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all ${
              uploading
                ? 'border-indigo-500/40 bg-indigo-500/5 cursor-not-allowed'
                : 'border-slate-300 dark:border-slate-700 hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer group'
            }`}
          >
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              {uploading
                ? <Loader2 size={28} className="text-indigo-500 animate-spin" />
                : <FileText size={28} className="text-slate-500 dark:text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400" />}
            </div>
            <p className="text-slate-700 dark:text-slate-300 font-medium mb-1 text-sm">
              {uploading ? 'Uploading...' : 'Click to upload'}
            </p>
            <p className="text-xs text-slate-500 mb-4">PDF, DOCX, TXT · Max 10MB</p>
            <button disabled={uploading} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-lg text-xs font-medium transition-colors">
              Select File
            </button>
          </div>
        </div>

        {/* Add URL */}
        <div className="bg-white dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-2xl p-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
            <LinkIcon className="text-emerald-500 dark:text-emerald-400" /> Add Website URL
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">Scrape and index content from any public webpage — docs, FAQs, landing pages.</p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Website URL</label>
              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !processingUrl && urlInput.trim() && handleAddUrl()}
                placeholder="https://example.com/faq"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 rounded-lg px-4 py-3 text-slate-900 dark:text-slate-200 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={handleAddUrl}
              disabled={processingUrl || !urlInput.trim()}
              className="px-4 py-3 flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {processingUrl ? <><Loader2 size={15} className="animate-spin" /> Scraping...</> : 'Scrape & Index URL'}
            </button>
          </div>
        </div>

        {/* ── Test AI Agent (improved) ── */}
        <TestCallPanel
          knowledgeBases={knowledgeBases}
          selectedKbId={selectedKbId}
          setSelectedKbId={setSelectedKbId}
        />
      </div>

      {/* Document List */}
      <div className="bg-white dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-[#0b1120]/50">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="text-amber-500 dark:text-amber-400" /> Indexed Data Sources
          </h2>
          <span className="text-sm text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-[#E2E8F0] dark:border-slate-700/50">{documents.length} Items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name / URL</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date Added</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading documents...
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-16 text-center">
                    <BookOpen size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-700" />
                    <p className="text-slate-500 dark:text-slate-500 text-sm">No documents yet.</p>
                    <p className="text-slate-400 dark:text-slate-600 text-xs mt-1">Upload a file or add a URL above to get started.</p>
                  </td>
                </tr>
              ) : documents.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {doc.file_type === 'url'
                        ? <LinkIcon size={15} className="text-emerald-400 flex-shrink-0" />
                        : <FileText size={15} className="text-indigo-400 flex-shrink-0" />}
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs text-sm" title={doc.filename}>{doc.filename}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">{doc.file_type}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">Active</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{new Date(doc.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleDelete(doc.id)} className="text-slate-400 hover:text-red-400 transition-colors p-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
