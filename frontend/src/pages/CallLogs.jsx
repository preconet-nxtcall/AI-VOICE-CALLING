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
  const hasConversation = log.conversation && log.conversation.length > 0;
  const turnCount = Math.floor((log.conversation || []).length / 2);

  const sentiment = log?.tags?.sentiment || 'Neutral';
  const leadIntent = log?.tags?.lead_intent || 'Neutral';
  const callSummary = log?.tags?.call_summary || 'No summary available.';

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
          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2" title={callSummary}>
            {callSummary}
          </p>
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            disabled={!hasConversation}
            title={hasConversation ? 'View transcript' : 'No transcript available'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              hasConversation
                ? 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 ring-1 ring-indigo-500/30 cursor-pointer'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed ring-1 ring-slate-700/50'
            }`}
          >
            {hasConversation ? (turnCount > 0 ? `${turnCount} turns` : 'View') : 'No transcript'}
          </button>
        </td>
      </tr>

      {expanded && hasConversation && (
        <tr className="border-t border-slate-200 dark:border-slate-800/60">
          <td colSpan="9" className="bg-slate-50/50 dark:bg-slate-900/60">
            <div className="flex items-center justify-between px-6 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Conversation Transcript
                </span>
              </div>
              <span className="text-xs text-slate-600">{log.conversation.length} messages</span>
            </div>
            <ConversationPanel conversation={log.conversation} />
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Calls', value: summary.total_calls },
            { label: 'Completed', value: summary.completed_calls },
            { label: 'Failed', value: summary.failed_calls },
            { label: 'Last 24h', value: summary.calls_last_24h },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[#FFFFFF] dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-xl p-4">
              <p className="text-slate-600 dark:text-slate-500 text-xs">{label}</p>
              <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-500">
        <div className="flex items-center gap-2">
          <label className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Sentiment</label>
          <select value={sentimentFilter} onChange={(e) => setSentimentFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs text-slate-700 dark:text-slate-300">
            <option value="all">All</option>
            <option value="Positive">Positive</option>
            <option value="Angry">Angry</option>
            <option value="Neutral">Neutral</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Intent</label>
          <select value={intentFilter} onChange={(e) => setIntentFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs text-slate-700 dark:text-slate-300">
            <option value="all">All</option>
            <option value="Highly Interested">Highly Interested</option>
            <option value="Interested">Interested</option>
            <option value="Not Interested">Not Interested</option>
            <option value="Neutral">Neutral</option>
          </select>
        </div>
      </div>

      <div className="bg-[#FFFFFF] dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-xl overflow-x-auto">
        <table className="w-full text-left min-w-[1200px]">
          <thead className="bg-slate-50/60 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
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
                <td className="px-4 py-10 text-slate-600 dark:text-slate-500 text-center" colSpan="9">Loading call logs...</td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td className="px-4 py-12 text-center text-slate-600 dark:text-slate-500" colSpan="9">
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
  );
}
