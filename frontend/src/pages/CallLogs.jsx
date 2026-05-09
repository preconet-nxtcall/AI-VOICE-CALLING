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
            {/* Label */}
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${
              isAI ? 'text-indigo-400' : 'text-slate-500 dark:text-slate-400'
            }`}>
              {isAI ? '🤖 AI' : '📞 Customer'}
            </span>

            {/* Bubble */}
            <div
              className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed max-w-[85%] shadow-sm ${
                isAI
                  ? 'bg-indigo-600/10 dark:bg-indigo-600/30 text-indigo-900 dark:text-indigo-100 rounded-tr-sm ring-1 ring-indigo-500/30'
                  : 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-slate-200 rounded-tl-sm ring-1 ring-slate-200 dark:ring-slate-600/40'
              }`}
            >
              {turn.text}
            </div>

            {/* Timestamp */}
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
          {log.campaign_name || <span className="text-slate-400 dark:text-slate-600 italic">—</span>}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
              statusColors[log.status] || statusColors.missed
            }`}
          >
            {log.status === 'completed' && '✓ '}
            {log.status === 'failed' && '✗ '}
            {log.status === 'in_progress' && '⟳ '}
            {log.status}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-sm">
          {formatDuration(log.duration_seconds)}
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
            {hasConversation ? (
              <>
                <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
                {turnCount > 0 ? `${turnCount} turn${turnCount !== 1 ? 's' : ''}` : 'View'}
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                No transcript
              </>
            )}
          </button>
        </td>
      </tr>

      {/* Transcript expansion row */}
      {expanded && hasConversation && (
        <tr className="border-t border-slate-200 dark:border-slate-800/60">
          <td colSpan="6" className="bg-slate-50/50 dark:bg-slate-900/60">
            {/* Header bar */}
            <div className="flex items-center justify-between px-6 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Conversation Transcript
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-500">·</span>
                <span className="text-xs text-slate-600 dark:text-slate-500">{log.phone_number}</span>
              </div>
              <span className="text-xs text-slate-600">
                {log.conversation.length} message{log.conversation.length !== 1 ? 's' : ''}
              </span>
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

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Call Logs</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            AI vs Customer conversation history from your Twilio calls.
          </p>
        </div>
        {!loading && logs.length > 0 && (
          <div className="text-xs text-slate-600 dark:text-slate-500 bg-slate-800/50 px-3 py-1.5 rounded-full ring-1 ring-slate-700/50">
            {logs.length} record{logs.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-3 rounded-lg ring-1 ring-red-500/20">
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Calls', value: summary.total_calls, icon: '📞', color: 'text-slate-700 dark:text-slate-300' },
            { label: 'Completed', value: summary.completed_calls, icon: '✅', color: 'text-emerald-400' },
            { label: 'Failed', value: summary.failed_calls, icon: '❌', color: 'text-red-400' },
            { label: 'Last 24h', value: summary.calls_last_24h, icon: '🕐', color: 'text-indigo-400' },
          ].map(({ label, value, icon, color }) => (
            <div
              key={label}
              className="bg-[#FFFFFF] dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-xl p-4 flex items-center gap-3"
            >
              <span className="text-2xl">{icon}</span>
              <div>
                <p className="text-slate-600 dark:text-slate-500 text-xs">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transcript legend */}
      <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-indigo-600/40 ring-1 ring-indigo-500/30" />
          AI reply
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-slate-700/60 ring-1 ring-slate-600/40" />
          Customer speech
        </div>
        <span className="text-slate-700">·</span>
        <span>Click "View Transcript" to expand conversation turns</span>
      </div>

      {/* Table */}
      <div className="bg-[#FFFFFF] dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50/60 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Time</th>
              <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Phone</th>
              <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Campaign</th>
              <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Duration</th>
              <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Transcript</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-10 text-slate-600 dark:text-slate-500 text-center" colSpan="6">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading call logs…
                  </div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td className="px-4 py-12 text-center" colSpan="6">
                  <div className="flex flex-col items-center gap-2 text-slate-600 dark:text-slate-500">
                    <svg className="w-10 h-10 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    <span className="text-sm">No call logs found.</span>
                    <span className="text-xs text-slate-600">Calls will appear here once your Twilio campaigns run.</span>
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((log) => <CallRow key={log.id} log={log} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
