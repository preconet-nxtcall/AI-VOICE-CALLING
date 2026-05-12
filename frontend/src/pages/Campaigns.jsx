import { useEffect, useState } from 'react';
import { Loader2, Plus, Upload, ChevronDown, ChevronUp, Play, Pause, CalendarClock, Phone } from 'lucide-react';
import api from '../services/api';

const CALLER_ID_OPTIONS = [
  { label: 'Primary Twilio Number', value: '+14155550101' },
  { label: 'Sales Team Number', value: '+14155550102' },
  { label: 'Support Number', value: '+14155550103' },
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

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/campaigns');
      setCampaigns(res.data.campaigns || []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load campaigns.');
    } finally {
      setLoading(false);
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
    fetchCampaigns();
    fetchKnowledgeBases();
    fetchScripts();
    const interval = setInterval(fetchCampaigns, 12000);
    return () => clearInterval(interval);
  }, []);

  const createCampaign = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return setError('Campaign name is required.');
    if (!formData.knowledge_base_id) return setError('Please select a Knowledge Base.');

    const callerId = formData.caller_id === 'custom' ? formData.custom_caller_id.trim() : formData.caller_id;
    if (!callerId) return setError('Caller ID is required.');

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
      fetchCampaigns();
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
      fetchCampaigns();
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
      fetchCampaigns();
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Campaigns</h1>
          <p className="text-slate-500 dark:text-slate-400">Plan outbound campaigns with schedule windows and retry policies.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
        >
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {error && <div className="text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-2 text-sm">{error}</div>}
      {uploadMessage && <div className="text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm">{uploadMessage}</div>}

      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="text-slate-500 dark:text-slate-400 text-center py-8"><Loader2 className="animate-spin inline mr-2" size={16} /> Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400">
            No campaigns yet. Click New Campaign to create one.
          </div>
        ) : campaigns.map((c) => (
          <div key={c.id} className="bg-white dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 flex flex-col md:flex-row items-start md:items-center gap-3 justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">{c.name}</h3>
                  <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                    {c.status}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Daily limit: {c.daily_limit} | Created {new Date(c.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {c.status !== 'active' && (
                  <button onClick={() => updateStatus(c.id, 'active')} className="text-xs px-3 py-1.5 bg-emerald-600/20 text-emerald-600 dark:text-emerald-300 rounded-lg border border-emerald-500/30 flex items-center gap-1">
                    <Play size={12} /> Start
                  </button>
                )}
                {c.status === 'active' && (
                  <button onClick={() => updateStatus(c.id, 'paused')} className="text-xs px-3 py-1.5 bg-amber-600/20 text-amber-600 dark:text-amber-300 rounded-lg border border-amber-500/30 flex items-center gap-1">
                    <Pause size={12} /> Pause
                  </button>
                )}
                <label className="text-xs px-3 py-1.5 bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-500/30 flex items-center gap-1 cursor-pointer">
                  <Upload size={12} />
                  {uploadingCampaignId === c.id ? 'Uploading...' : 'Upload CSV'}
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => handleCSVUpload(c.id, e.target.files[0], e.target)} />
                </label>
                <button onClick={() => toggleExpand(c.id)} className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-300/50 dark:border-slate-600/30 flex items-center gap-1">
                  {expandedCampaign === c.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Leads
                </button>
              </div>
            </div>

            {expandedCampaign === c.id && (
              <div className="border-t border-slate-200 dark:border-slate-800">
                {leadsLoading ? (
                  <div className="p-4 text-slate-500 dark:text-slate-400 text-sm"><Loader2 className="animate-spin inline mr-2" size={14} /> Loading leads...</div>
                ) : leads.length === 0 ? (
                  <div className="p-4 text-slate-600 dark:text-slate-400 text-sm">No leads uploaded yet.</div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-900/80 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-slate-600 dark:text-slate-400 text-xs font-medium">Phone Number</th>
                          <th className="px-4 py-2 text-slate-600 dark:text-slate-400 text-xs font-medium">Status</th>
                          <th className="px-4 py-2 text-slate-600 dark:text-slate-400 text-xs font-medium">Call SID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.map((lead) => (
                          <tr key={lead.id} className="border-t border-slate-200/50 dark:border-slate-800/50">
                            <td className="px-4 py-2 text-slate-900 dark:text-slate-200 font-mono">{lead.phone_number}</td>
                            <td className="px-4 py-2 text-slate-700 dark:text-slate-300 uppercase text-xs">{lead.status}</td>
                            <td className="px-4 py-2 text-slate-600 dark:text-slate-400 text-xs font-mono truncate max-w-[200px]">{lead.call_sid || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70" onClick={() => setShowCreateModal(false)} />
          <form onSubmit={createCampaign} className="relative w-full max-w-3xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Create Campaign</h2>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white">Close</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Campaign Name</label>
                <input value={formData.name} onChange={(e) => setFormData((s) => ({ ...s, name: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Knowledge Base</label>
                <select value={formData.knowledge_base_id} onChange={(e) => setFormData((s) => ({ ...s, knowledge_base_id: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5">
                  <option value="">Select Knowledge Base</option>
                  {knowledgeBases.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Script</label>
                <select value={formData.script_id} onChange={(e) => setFormData((s) => ({ ...s, script_id: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5">
                  <option value="">No Script (optional)</option>
                  {scripts.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Daily Limit</label>
                <input type="number" min="1" value={formData.daily_limit} onChange={(e) => setFormData((s) => ({ ...s, daily_limit: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1"><Phone size={14} /> Caller ID</label>
                <select value={formData.caller_id} onChange={(e) => setFormData((s) => ({ ...s, caller_id: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5">
                  {CALLER_ID_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label} ({item.value})</option>)}
                  <option value="custom">Custom Caller ID</option>
                </select>
                {formData.caller_id === 'custom' && (
                  <input value={formData.custom_caller_id} onChange={(e) => setFormData((s) => ({ ...s, custom_caller_id: e.target.value }))} placeholder="+1 415 555 0199" className="mt-2 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5" />
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1"><CalendarClock size={14} /> Start Date/Time</label>
                <input type="datetime-local" value={formData.schedule_start_at} onChange={(e) => setFormData((s) => ({ ...s, schedule_start_at: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">End Date/Time</label>
                <input type="datetime-local" value={formData.schedule_end_at} onChange={(e) => setFormData((s) => ({ ...s, schedule_end_at: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Daily Start Time (Local)</label>
                <input type="time" value={formData.daily_start_time} onChange={(e) => setFormData((s) => ({ ...s, daily_start_time: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Daily End Time (Local)</label>
                <input type="time" value={formData.daily_end_time} onChange={(e) => setFormData((s) => ({ ...s, daily_end_time: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5" />
              </div>
              
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Dialing Speed</label>
                <select value={formData.dialing_speed} onChange={(e) => setFormData((s) => ({ ...s, dialing_speed: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5">
                  <option value="normal">Normal</option>
                  <option value="fast">Fast</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Retry Attempts</label>
                <input type="number" min="0" max="10" value={formData.retry_attempts} onChange={(e) => setFormData((s) => ({ ...s, retry_attempts: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Retry Interval (seconds)</label>
                <input type="number" min="30" value={formData.retry_interval_seconds} onChange={(e) => setFormData((s) => ({ ...s, retry_interval_seconds: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5" />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300">Cancel</button>
              <button type="submit" disabled={creating} className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium inline-flex items-center gap-2 disabled:bg-slate-500">
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
