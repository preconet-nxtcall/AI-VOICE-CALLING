import { useEffect, useState, useRef } from 'react';
import { Loader2, Plus, Upload, Phone, ChevronDown, ChevronUp, Play, Pause } from 'lucide-react';
import api from '../services/api';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [name, setName] = useState('');
  const [dailyLimit, setDailyLimit] = useState(100);
  const [selectedKb, setSelectedKb] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [expandedCampaign, setExpandedCampaign] = useState(null);
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [uploadingCampaignId, setUploadingCampaignId] = useState(null);
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef(null);

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
    } catch (err) {
      console.error('Failed to load KBs', err);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchKnowledgeBases();
  }, []);

  const createCampaign = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!selectedKb) {
      setError('Please select a Knowledge Base for the campaign.');
      return;
    }
    try {
      setCreating(true);
      setError('');
      await api.post('/campaigns', {
        name,
        daily_limit: Number(dailyLimit),
        status: 'draft',
        knowledge_base_id: selectedKb,
      });
      setName('');
      setDailyLimit(100);
      setSelectedKb('');
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
    } catch (err) {
      console.error('Failed to load leads', err);
      setLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  };

  const handleCSVUpload = async (campaignId, file) => {
    if (!file) return;
    setUploadingCampaignId(campaignId);
    setUploadMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/campaigns/${campaignId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadMessage(`✅ ${res.data.message}`);
      fetchCampaigns();
      if (expandedCampaign === campaignId) {
        const leadsRes = await api.get(`/campaigns/${campaignId}/leads`);
        setLeads(leadsRes.data.leads || []);
      }
    } catch (err) {
      setUploadMessage(`❌ ${err?.response?.data?.error || 'Upload failed.'}`);
    } finally {
      setUploadingCampaignId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'paused': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'draft': return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
    }
  };

  const getLeadStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-emerald-400';
      case 'failed': return 'text-red-400';
      case 'calling': return 'text-amber-400';
      case 'pending': return 'text-slate-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Campaigns</h1>
        <p className="text-slate-400">Create bulk outbound voice campaigns with CSV lead uploads.</p>
      </div>
      {error && <div className="text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm">{error}</div>}

      {/* Create Campaign Form */}
      <form onSubmit={createCampaign} className="bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Plus size={18} className="text-indigo-400" /> New Campaign
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Campaign name"
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
          />
          <select
            value={selectedKb}
            onChange={(e) => setSelectedKb(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Select Knowledge Base</option>
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>{kb.name}</option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            placeholder="Daily limit"
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 font-medium transition-colors"
          >
            {creating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            Create Campaign
          </button>
        </div>
      </form>

      {uploadMessage && (
        <div className={`text-sm px-4 py-2 rounded-lg border ${uploadMessage.startsWith('✅') ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {uploadMessage}
        </div>
      )}

      {/* Campaign List */}
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="text-slate-400 text-center py-8"><Loader2 className="animate-spin inline mr-2" size={16} /> Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-8 text-center text-slate-400">
            No campaigns yet. Create your first campaign above.
          </div>
        ) : campaigns.map((c) => (
          <div key={c.id} className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
            {/* Campaign Header */}
            <div className="p-4 flex flex-col md:flex-row items-start md:items-center gap-3 justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-semibold text-white truncate">{c.name}</h3>
                  <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded-full border ${getStatusColor(c.status)}`}>
                    {c.status}
                  </span>
                </div>
                <p className="text-slate-500 text-xs">
                  Daily limit: {c.daily_limit} • Created {new Date(c.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Lead Stats */}
              {c.lead_stats && c.lead_stats.total > 0 && (
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <p className="text-slate-500">Total</p>
                    <p className="text-white font-bold text-lg">{c.lead_stats.total}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-emerald-500">Done</p>
                    <p className="text-emerald-400 font-bold text-lg">{c.lead_stats.completed}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-amber-500">Calling</p>
                    <p className="text-amber-400 font-bold text-lg">{c.lead_stats.calling}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-red-500">Failed</p>
                    <p className="text-red-400 font-bold text-lg">{c.lead_stats.failed}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500">Pending</p>
                    <p className="text-slate-300 font-bold text-lg">{c.lead_stats.pending}</p>
                  </div>
                  {/* Progress bar */}
                  <div className="w-32">
                    <div className="w-full bg-slate-800 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(((c.lead_stats.completed + c.lead_stats.failed) / c.lead_stats.total) * 100)}%` }}
                      />
                    </div>
                    <p className="text-slate-500 text-[10px] mt-1 text-center">
                      {Math.round(((c.lead_stats.completed + c.lead_stats.failed) / c.lead_stats.total) * 100)}% done
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                {c.status !== 'active' && (
                  <button
                    onClick={() => updateStatus(c.id, 'active')}
                    className="text-xs px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-lg border border-emerald-500/30 flex items-center gap-1 transition-colors"
                  >
                    <Play size={12} /> Start
                  </button>
                )}
                {c.status === 'active' && (
                  <button
                    onClick={() => updateStatus(c.id, 'paused')}
                    className="text-xs px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded-lg border border-amber-500/30 flex items-center gap-1 transition-colors"
                  >
                    <Pause size={12} /> Pause
                  </button>
                )}
                <label className="text-xs px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg border border-indigo-500/30 flex items-center gap-1 cursor-pointer transition-colors">
                  <Upload size={12} />
                  {uploadingCampaignId === c.id ? 'Uploading...' : 'Upload CSV'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => handleCSVUpload(c.id, e.target.files[0])}
                    disabled={uploadingCampaignId === c.id}
                  />
                </label>
                <button
                  onClick={() => toggleExpand(c.id)}
                  className="text-xs px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-600/30 flex items-center gap-1 transition-colors"
                >
                  {expandedCampaign === c.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Leads
                </button>
              </div>
            </div>

            {/* Expanded Leads Section */}
            {expandedCampaign === c.id && (
              <div className="border-t border-slate-800">
                {leadsLoading ? (
                  <div className="p-4 text-slate-400 text-sm"><Loader2 className="animate-spin inline mr-2" size={14} /> Loading leads...</div>
                ) : leads.length === 0 ? (
                  <div className="p-4 text-slate-500 text-sm">No leads uploaded yet. Upload a CSV to get started.</div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/80 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-slate-500 text-xs font-medium">#</th>
                          <th className="px-4 py-2 text-slate-500 text-xs font-medium">Phone Number</th>
                          <th className="px-4 py-2 text-slate-500 text-xs font-medium">Status</th>
                          <th className="px-4 py-2 text-slate-500 text-xs font-medium">Call SID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.map((lead, idx) => (
                          <tr key={lead.id} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                            <td className="px-4 py-2 text-slate-500">{idx + 1}</td>
                            <td className="px-4 py-2 text-slate-200 font-mono">{lead.phone_number}</td>
                            <td className={`px-4 py-2 font-semibold uppercase text-xs ${getLeadStatusColor(lead.status)}`}>{lead.status}</td>
                            <td className="px-4 py-2 text-slate-500 text-xs font-mono truncate max-w-[200px]">{lead.call_sid || '—'}</td>
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
    </div>
  );
}
