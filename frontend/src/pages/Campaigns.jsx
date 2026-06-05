import { useEffect, useState } from 'react';
import { Loader2, Plus, Upload, ChevronDown, ChevronUp, Play, Pause, CalendarClock, Phone, X, Settings, Zap, Calendar } from 'lucide-react';
import api from '../services/api';

const CALLER_ID_OPTIONS = [
  { label: 'VoiceLink DID (from .env)', value: 'voicelink_default' },
  { label: 'Custom Number', value: 'custom' },
];

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [expandedCampaign, setExpandedCampaign] = useState(null);
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [uploadingCampaignId, setUploadingCampaignId] = useState(null);
  const [uploadMessage, setUploadMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    knowledge_base_id: '',
    daily_limit: 100,
    caller_id: CALLER_ID_OPTIONS[0].value,
    custom_caller_id: '',
    script_id: '',
    schedule_start_at: '',
    schedule_end_at: '',
    daily_start_time: '',
    daily_end_time: '',
    dialing_speed: 'normal',
    retry_attempts: 0,
    retry_interval_seconds: 300,
  });

  const fetchCampaigns = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      setError('');
      const res = await api.get('/campaigns');
      setCampaigns(res.data.campaigns || []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load campaigns.');
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  const fetchKnowledgeBases = async () => {
    try {
      const res = await api.get('/knowledge/list');
      setKnowledgeBases(res.data.knowledge_bases || []);
    } catch {
      setKnowledgeBases([]);
    }
  };

  const fetchScripts = async () => {
    try {
      const res = await api.get('/scripts');
      setScripts(res.data.scripts || []);
    } catch {
      setScripts([]);
    }
  };

  useEffect(() => {
    fetchCampaigns(true);
    fetchKnowledgeBases();
    fetchScripts();
    const interval = setInterval(() => fetchCampaigns(false), 12000);
    return () => clearInterval(interval);
  }, []);

  const createCampaign = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return setError('Campaign name is required.');
    if (!formData.knowledge_base_id) return setError('Please select a Knowledge Base.');

    // 'voicelink_default' → let backend use VOICELINK_DID_NUMBER from env (send null)
    // 'custom' → use the custom number entered by user
    const callerId =
      formData.caller_id === 'custom'
        ? formData.custom_caller_id.trim() || null
        : formData.caller_id === 'voicelink_default'
        ? null
        : formData.caller_id;

    const payload = {
      name: formData.name.trim(),
      daily_limit: Number(formData.daily_limit),
      status: 'draft',
      knowledge_base_id: formData.knowledge_base_id,
      script_id: formData.script_id || null,
      caller_id: callerId,
      schedule_start_at: formData.schedule_start_at ? new Date(formData.schedule_start_at).toISOString() : null,
      schedule_end_at: formData.schedule_end_at ? new Date(formData.schedule_end_at).toISOString() : null,
      daily_start_time: formData.daily_start_time || null,
      daily_end_time: formData.daily_end_time || null,
      dialing_speed: formData.dialing_speed,
      retry_attempts: Number(formData.retry_attempts),
      retry_interval_seconds: Number(formData.retry_interval_seconds),
    };

    try {
      setCreating(true);
      setError('');
      await api.post('/campaigns', payload);
      setFormData({
        name: '',
        knowledge_base_id: '',
        daily_limit: 100,
        caller_id: CALLER_ID_OPTIONS[0].value,
        custom_caller_id: '',
        script_id: '',
        schedule_start_at: '',
        schedule_end_at: '',
        daily_start_time: '',
        daily_end_time: '',
        dialing_speed: 'normal',
        retry_attempts: 0,
        retry_interval_seconds: 300,
      });
      setShowCreateModal(false);
      fetchCampaigns(false);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create campaign.');
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      setError('');
      await api.patch(`/campaigns/${id}/status`, { status });
      fetchCampaigns(false);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update campaign status.');
    }
  };

  const toggleExpand = async (campaignId) => {
    if (expandedCampaign === campaignId) {
      setExpandedCampaign(null);
      setLeads([]);
      return;
    }
    setExpandedCampaign(campaignId);
    setLeadsLoading(true);
    try {
      const res = await api.get(`/campaigns/${campaignId}/leads`);
      setLeads(res.data.leads || []);
    } catch {
      setLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  };

  const handleCSVUpload = async (campaignId, file, inputEl) => {
    if (!file) return;
    setUploadingCampaignId(campaignId);
    setUploadMessage('');
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      const res = await api.post(`/campaigns/${campaignId}/upload`, formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadMessage(`Success: ${res.data.message}`);
      fetchCampaigns(false);
      if (expandedCampaign === campaignId) {
        const leadsRes = await api.get(`/campaigns/${campaignId}/leads`);
        setLeads(leadsRes.data.leads || []);
      }
    } catch (err) {
      setUploadMessage(`Error: ${err?.response?.data?.error || 'Upload failed.'}`);
    } finally {
      setUploadingCampaignId(null);
      if (inputEl) inputEl.value = '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      
      {/* Header Panel */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 bg-white dark:bg-slate-900/40 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/50 backdrop-blur-xl shadow-sm relative overflow-hidden group">
        {/* Accent colored line */}
        <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
        {/* Radial soft glow */}
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

        <div className="relative z-10">
          <h1 className="text-3xl font-black text-slate-950 dark:text-white tracking-tight mb-1 font-heading">Campaigns</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Plan outbound campaigns with schedule windows and retry policies.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold transition-all shadow-md shadow-indigo-500/20 active:scale-95 cursor-pointer shrink-0 relative z-10"
        >
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {error && <div className="text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>}
      {uploadMessage && <div className="text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium">{uploadMessage}</div>}

      <div className="flex flex-col gap-5">
        {loading ? (
          <div className="text-slate-500 dark:text-slate-400 text-center py-12"><Loader2 className="animate-spin inline mr-2 text-indigo-500" size={24} /> Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-10 text-center text-slate-500 dark:text-slate-400 shadow-sm relative overflow-hidden group">
            {/* Accent colored line */}
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
            {/* Radial soft glow */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

            <p className="font-semibold text-slate-600 dark:text-slate-300 relative z-10">No campaigns yet. Click New Campaign to create one.</p>
          </div>
        ) : campaigns.map((c) => (
          <div 
            key={c.id} 
            className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl shadow-sm hover:shadow-md hover:border-indigo-500/20 dark:hover:border-indigo-500/30 transition-all duration-350 relative overflow-hidden group flex flex-col p-6 gap-4"
          >
            {/* Accent colored line */}
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
            {/* Radial soft glow */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 justify-between relative z-10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <h3 className="text-xl font-bold text-slate-950 dark:text-white truncate font-heading">{c.name}</h3>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                    c.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}>
                    {c.status}
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
                  Daily limit: <span className="text-slate-900 dark:text-white font-bold">{c.daily_limit}</span> | Created {new Date(c.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {c.status !== 'active' && (
                  <button onClick={() => updateStatus(c.id, 'active')} className="text-xs px-3.5 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20 dark:border-emerald-500/30 flex items-center gap-1.5 transition-all cursor-pointer font-semibold">
                    <Play size={13} /> Start
                  </button>
                )}
                {c.status === 'active' && (
                  <button onClick={() => updateStatus(c.id, 'paused')} className="text-xs px-3.5 py-2 bg-amber-600/10 hover:bg-amber-600/20 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/20 dark:border-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer font-semibold">
                    <Pause size={13} /> Pause
                  </button>
                )}
                <label className="text-xs px-3.5 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20 dark:border-indigo-500/30 flex items-center gap-1.5 transition-all cursor-pointer font-semibold">
                  <Upload size={13} />
                  {uploadingCampaignId === c.id ? 'Uploading...' : 'Upload CSV'}
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => handleCSVUpload(c.id, e.target.files[0], e.target)} />
                </label>
                <button onClick={() => toggleExpand(c.id)} className="text-xs px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer font-semibold text-slate-700 dark:text-slate-400">
                  {expandedCampaign === c.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  Leads
                </button>
              </div>
            </div>

            {expandedCampaign === c.id && (
              <div className="border-t border-slate-100 dark:border-slate-800/60 pt-4 relative z-10">
                {leadsLoading ? (
                  <div className="p-4 text-slate-500 dark:text-slate-400 text-sm"><Loader2 className="animate-spin inline mr-2" size={14} /> Loading leads...</div>
                ) : leads.length === 0 ? (
                  <div className="p-4 text-slate-600 dark:text-slate-400 text-sm italic">No leads uploaded yet.</div>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
                        <tr>
                          <th className="px-4 py-2">Name</th>
                          <th className="px-4 py-2">Phone Number</th>
                          <th className="px-4 py-2">Status</th>
                          <th className="px-4 py-2">Call SID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.map((lead) => {
                          const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
                          return (
                            <tr key={lead.id} className="border-t border-slate-100 dark:border-slate-800/40">
                              <td className="px-4 py-2.5 text-slate-900 dark:text-slate-200 font-medium">{fullName || '-'}</td>
                              <td className="px-4 py-2.5 text-slate-900 dark:text-slate-200 font-mono">{lead.phone_number}</td>
                              <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 uppercase text-xs font-semibold">{lead.status}</td>
                              <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs font-mono truncate max-w-[200px]">{lead.call_sid || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <form 
            onSubmit={createCampaign} 
            className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col gap-6"
          >
            {/* Accent colored line */}
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
            {/* Radial soft glow */}
            <div className="absolute -top-6 -right-6 w-32 h-32 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-2xl pointer-events-none"></div>

            <div className="flex items-center justify-between relative z-10 border-b border-slate-100 dark:border-slate-800/60 pb-5">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-heading">Create Campaign</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Configure dialing policy, schedule bounds, and intelligence assets.</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowCreateModal(false)} 
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/40 rounded-xl transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Content Grouped into Sections */}
            <div className="flex flex-col gap-6 relative z-10">
              
              {/* Section 1: General Settings Card */}
              <div className="bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/50 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 pb-2 border-b border-slate-100 dark:border-slate-800/40">
                  <div className="p-1.5 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-lg">
                    <Settings size={15} />
                  </div>
                  <h3 className="text-[11px] font-extrabold uppercase tracking-widest font-heading">General Settings</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">Campaign Name</label>
                    <input 
                      value={formData.name} 
                      onChange={(e) => setFormData((s) => ({ ...s, name: e.target.value }))} 
                      placeholder="e.g. Q3 Sales Outreach" 
                      className="w-full" 
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Give your outbound campaign a recognizable name for call tracking.</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">Knowledge Base</label>
                    <div className="relative">
                      <select 
                        value={formData.knowledge_base_id} 
                        onChange={(e) => setFormData((s) => ({ ...s, knowledge_base_id: e.target.value }))} 
                        className="w-full appearance-none pr-10"
                      >
                        <option value="">Select Knowledge Base</option>
                        {knowledgeBases.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Select the folder source containing document context for the AI.</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">Script Override</label>
                    <div className="relative">
                      <select 
                        value={formData.script_id} 
                        onChange={(e) => setFormData((s) => ({ ...s, script_id: e.target.value }))} 
                        className="w-full appearance-none pr-10"
                      >
                        <option value="">No Script (uses default model behavior)</option>
                        {scripts.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Select a script to dictate the dialogue structure and welcome message.</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Dialing & Retry Settings Card */}
              <div className="bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/50 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 pb-2 border-b border-slate-100 dark:border-slate-800/40">
                  <div className="p-1.5 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-lg">
                    <Zap size={15} />
                  </div>
                  <h3 className="text-[11px] font-extrabold uppercase tracking-widest font-heading">Dialing & Retry Policy</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading flex items-center gap-1">
                      <Phone size={11} className="text-slate-400" /> Caller ID
                    </label>
                    <div className="relative">
                      <select 
                        value={formData.caller_id} 
                        onChange={(e) => setFormData((s) => ({ ...s, caller_id: e.target.value }))} 
                        className="w-full appearance-none pr-10"
                      >
                        {CALLER_ID_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        <option value="custom">Custom Caller ID</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                    </div>
                    {formData.caller_id === 'custom' && (
                      <input 
                        value={formData.custom_caller_id} 
                        onChange={(e) => setFormData((s) => ({ ...s, custom_caller_id: e.target.value }))} 
                        placeholder="+1 415 555 0199" 
                        className="mt-1.5 w-full animate-fade-in" 
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">Daily Call Limit</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={formData.daily_limit} 
                      onChange={(e) => setFormData((s) => ({ ...s, daily_limit: e.target.value }))} 
                      className="w-full" 
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">Dialing Speed</label>
                    <div className="relative">
                      <select 
                        value={formData.dialing_speed} 
                        onChange={(e) => setFormData((s) => ({ ...s, dialing_speed: e.target.value }))} 
                        className="w-full appearance-none pr-10"
                      >
                        <option value="normal">Normal (Standard throughput)</option>
                        <option value="fast">Fast (Higher concurrent calls)</option>
                        <option value="aggressive">Aggressive (Maximum concurrency)</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">Retry Attempts</label>
                    <input 
                      type="number" 
                      min="0" 
                      max="10" 
                      value={formData.retry_attempts} 
                      onChange={(e) => setFormData((s) => ({ ...s, retry_attempts: e.target.value }))} 
                      className="w-full" 
                    />
                  </div>

                  <div className="md:col-span-2 flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">Retry Interval (seconds)</label>
                    <input 
                      type="number" 
                      min="30" 
                      value={formData.retry_interval_seconds} 
                      onChange={(e) => setFormData((s) => ({ ...s, retry_interval_seconds: e.target.value }))} 
                      className="w-full" 
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Schedule Windows Card */}
              <div className="bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/50 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 pb-2 border-b border-slate-100 dark:border-slate-800/40">
                  <div className="p-1.5 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-lg">
                    <Calendar size={15} />
                  </div>
                  <h3 className="text-[11px] font-extrabold uppercase tracking-widest font-heading">Schedule Settings</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading flex items-center gap-1">
                      <CalendarClock size={11} className="text-slate-400" /> Start Date/Time
                    </label>
                    <input 
                      type="datetime-local" 
                      value={formData.schedule_start_at} 
                      onChange={(e) => setFormData((s) => ({ ...s, schedule_start_at: e.target.value }))} 
                      className="w-full" 
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">End Date/Time</label>
                    <input 
                      type="datetime-local" 
                      value={formData.schedule_end_at} 
                      onChange={(e) => setFormData((s) => ({ ...s, schedule_end_at: e.target.value }))} 
                      className="w-full" 
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">Daily Start Time (Local)</label>
                    <input 
                      type="time" 
                      value={formData.daily_start_time} 
                      onChange={(e) => setFormData((s) => ({ ...s, daily_start_time: e.target.value }))} 
                      className="w-full" 
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">Daily End Time (Local)</label>
                    <input 
                      type="time" 
                      value={formData.daily_end_time} 
                      onChange={(e) => setFormData((s) => ({ ...s, daily_end_time: e.target.value }))} 
                      className="w-full" 
                    />
                  </div>
                </div>
              </div>

            </div>

            <div className="mt-2 flex items-center justify-end gap-3 relative z-10 border-t border-slate-100 dark:border-slate-800/60 pt-5">
              <button 
                type="button" 
                onClick={() => setShowCreateModal(false)} 
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-350 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={creating} 
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold inline-flex items-center gap-2 shadow-md shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer text-xs disabled:opacity-50"
              >
                {creating && <Loader2 className="animate-spin" size={14} />}
                Create Campaign
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
