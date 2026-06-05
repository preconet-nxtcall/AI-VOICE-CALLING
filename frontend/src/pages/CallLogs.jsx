import { useEffect, useState } from 'react';
import api from '../services/api';

const formatDuration = (seconds) => {
  const mins = Math.floor((seconds || 0) / 60);
  const secs = (seconds || 0) % 60;
  return `${mins}m ${secs}s`;
};

const formatTime = (isoString) => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusColors = {
  completed: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  failed: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  in_progress: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  missed: 'bg-slate-500/15 text-slate-500 dark:text-slate-400 ring-1 ring-slate-500/30',
};

const sentimentColors = {
  Positive: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  Angry: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  Neutral: 'bg-slate-500/15 text-slate-500 dark:text-slate-400 ring-1 ring-slate-500/30',
};

const intentColors = {
  'Highly Interested': 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30',
  Interested: 'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30',
  'Not Interested': 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30',
  Neutral: 'bg-slate-500/15 text-slate-500 dark:text-slate-400 ring-1 ring-slate-500/30',
};

function ConversationPanel({ conversation }) {
  if (!conversation || conversation.length === 0) {
    return (
      <div className="px-6 py-5 text-center text-slate-600 dark:text-slate-500 text-sm italic">
        No transcript available for this call.
      </div>
    );
  }

  return (
    <div className="px-6 py-5 flex flex-col gap-3 max-h-80 overflow-y-auto">
      {conversation.map((turn, i) => {
        const isAI = turn.role === 'ai';
        return (
          <div
            key={i}
            className={`flex flex-col gap-1 ${isAI ? 'items-end' : 'items-start'}`}
          >
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${
              isAI ? 'text-indigo-400' : 'text-slate-500 dark:text-slate-400'
            }`}>
              {isAI ? 'AI' : 'Customer'}
            </span>

            <div
              className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed max-w-[85%] shadow-sm ${
                isAI
                  ? 'bg-indigo-600/10 dark:bg-indigo-600/30 text-indigo-900 dark:text-indigo-100 rounded-tr-sm ring-1 ring-indigo-500/30'
                  : 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-slate-200 rounded-tl-sm ring-1 ring-slate-200 dark:ring-slate-600/40'
              }`}
            >
              {turn.text}
            </div>

            {turn.ts && (
              <span className="text-[10px] text-slate-600">
                {formatTime(turn.ts)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CallRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [transcript, setTranscript] = useState(null);

  const sentiment = log?.tags?.sentiment || 'Neutral';
  const leadIntent = log?.tags?.lead_intent || 'Neutral';
  const callSummary = log?.tags?.call_summary || 'No summary available.';

  const handleToggle = async () => {
    if (!expanded && !transcript) {
      try {
        setLoadingTranscript(true);
        const res = await api.get(`/call-logs/${log.id}`);
        setTranscript(res.data.call_log?.conversation || []);
      } catch (err) {
        console.error("Failed to load transcript");
        setTranscript([]);
      } finally {
        setLoadingTranscript(false);
      }
    }
    setExpanded(!expanded);
  };

  return (
    <>
      <tr
        className={`border-t border-slate-200 dark:border-slate-800 transition-colors duration-150 ${
          expanded ? 'bg-slate-100 dark:bg-slate-800/40' : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/20'
        }`}
      >
        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-sm whitespace-nowrap">
          {new Date(log.created_at).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </td>
        <td className="px-4 py-3">
          <span className="text-slate-900 dark:text-slate-100 font-mono text-sm">{log.phone_number}</span>
        </td>
        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-sm">
          {log.campaign_name || <span className="text-slate-400 dark:text-slate-600 italic">-</span>}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
              statusColors[log.status] || statusColors.missed
            }`}
          >
            {log.status}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-sm">
          {formatDuration(log.duration_seconds)}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${sentimentColors[sentiment] || sentimentColors.Neutral}`}>
            {sentiment}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${intentColors[leadIntent] || intentColors.Neutral}`}>
            {leadIntent}
          </span>
        </td>
        <td className="px-4 py-3 max-w-[320px]">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2" title={callSummary}>
              {callSummary}
            </p>
            {log?.tags?.appointment_status === 'requested' && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40 uppercase tracking-tighter">
                  📅 Appointment
                </span>
                <span className="text-[10px] text-slate-500 truncate italic">
                  {log?.tags?.appointment_info}
                </span>
              </div>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <button
            onClick={handleToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 ring-1 ring-indigo-500/30 cursor-pointer`}
          >
            {expanded ? 'Hide' : 'View'}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-t border-slate-200 dark:border-slate-800/60">
          <td colSpan="9" className="bg-slate-50/50 dark:bg-slate-900/60">
            <div className="flex items-center justify-between px-6 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Conversation Transcript
                </span>
              </div>
              {transcript && (
                <span className="text-xs text-slate-600">{transcript.length} messages</span>
              )}
            </div>
            {loadingTranscript ? (
              <div className="px-6 py-5 text-center text-slate-600 dark:text-slate-500 text-sm">
                Loading transcript...
              </div>
            ) : (
              <ConversationPanel conversation={transcript} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function CallLogs() {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState('all');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get('/call-logs');
        setLogs(res.data.call_logs || []);
        setSummary(res.data.summary || null);
      } catch (err) {
        setError(err?.response?.data?.error || 'Failed to load call logs.');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const sentiment = log?.tags?.sentiment || 'Neutral';
    const leadIntent = log?.tags?.lead_intent || 'Neutral';
    const sentimentOk = sentimentFilter === 'all' || sentiment === sentimentFilter;
    const intentOk = intentFilter === 'all' || leadIntent === intentFilter;
    return sentimentOk && intentOk;
  });

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Call Logs</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            AI analytics with transcript history from your calls.
          </p>
        </div>
        {!loading && logs.length > 0 && (
          <div className="text-xs text-slate-600 dark:text-slate-500 bg-slate-800/50 px-3 py-1.5 rounded-full ring-1 ring-slate-700/50">
            {filteredLogs.length} / {logs.length} records
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-3 rounded-lg ring-1 ring-red-500/20">
          {error}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: 'Total Calls', value: summary.total_calls, color: 'bg-sky-500', glow: 'bg-sky-500/10' },
            { label: 'Completed', value: summary.completed_calls, color: 'bg-emerald-500', glow: 'bg-emerald-500/10' },
            { label: 'Failed', value: summary.failed_calls, color: 'bg-rose-500', glow: 'bg-rose-500/10' },
            { label: 'Last 24h', value: summary.calls_last_24h, color: 'bg-amber-500', glow: 'bg-amber-500/10' },
          ].map(({ label, value, color, glow }) => (
            <div key={label} className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-indigo-500/20 dark:hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden group flex flex-col justify-center min-h-[100px]">
              {/* Accent colored line */}
              <div className={`absolute top-0 left-0 right-0 h-[4px] ${color}`}></div>
              {/* Radial soft glow */}
              <div className={`absolute -top-6 -right-6 w-24 h-24 ${glow} rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none`}></div>
              
              <div className="relative z-10 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-heading">{label}</span>
                <span className="text-3xl font-black text-slate-900 dark:text-white leading-none tracking-tight font-heading">{value}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-650 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-heading">Sentiment</label>
          <select value={sentimentFilter} onChange={(e) => setSentimentFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs text-slate-700 dark:text-slate-300">
            <option value="all">All</option>
            <option value="Positive">Positive</option>
            <option value="Angry">Angry</option>
            <option value="Neutral">Neutral</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-heading">Intent</label>
          <select value={intentFilter} onChange={(e) => setIntentFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs text-slate-700 dark:text-slate-300">
            <option value="all">All</option>
            <option value="Highly Interested">Highly Interested</option>
            <option value="Interested">Interested</option>
            <option value="Not Interested">Not Interested</option>
            <option value="Neutral">Neutral</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 shadow-sm hover:shadow-md transition-all duration-300 rounded-3xl relative overflow-hidden group p-6">
        {/* Accent colored line */}
        <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
        {/* Radial soft glow */}
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

        <div className="overflow-x-auto rounded-2xl border border-slate-150 dark:border-slate-800 relative z-10">
          <table className="w-full text-left min-w-[1200px]">
            <thead className="bg-slate-50 dark:bg-slate-900/80 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Phone</th>
                <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Campaign</th>
                <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Duration</th>
                <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Sentiment</th>
                <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Intent</th>
                <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Summary</th>
                <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Transcript</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-10 text-slate-650 dark:text-slate-400 text-center" colSpan="9">Loading call logs...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td className="px-4 py-12 text-center text-slate-650 dark:text-slate-400" colSpan="9">
                    No matching call logs found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => <CallRow key={log.id} log={log} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
