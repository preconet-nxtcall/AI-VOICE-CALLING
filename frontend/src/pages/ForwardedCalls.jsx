import { useEffect, useState } from 'react';
import api from '../services/api';
import { PhoneForwarded } from 'lucide-react';

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
        <td className="px-4 py-3 max-w-[320px]">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2" title={callSummary}>
              {callSummary}
            </p>
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
          <td colSpan="7" className="bg-slate-50/50 dark:bg-slate-900/60">
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

export default function ForwardedCalls() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get('/call-logs');
        const allLogs = res.data.call_logs || [];
        // Filter only forwarded calls
        const forwarded = allLogs.filter(log => log.is_forwarded);
        setLogs(forwarded);
      } catch (err) {
        setError(err?.response?.data?.error || 'Failed to load forwarded calls.');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Forwarded Calls</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Calls escalated from AI to human agents will appear here.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-12 text-center shadow-sm relative overflow-hidden group">
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
          <p className="text-slate-500 dark:text-slate-400 font-semibold relative z-10">Loading forwarded calls...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-12 text-center shadow-sm relative overflow-hidden group">
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

          <div className="relative z-10">
            <PhoneForwarded className="mx-auto mb-4 text-indigo-500" size={36} />
            <p className="text-slate-900 dark:text-white font-bold text-lg font-heading">No forwarded calls yet.</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto font-medium">Start campaigns with handoff enabled to populate this feed.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 shadow-sm hover:shadow-md transition-all duration-300 rounded-3xl relative overflow-hidden group p-6">
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 relative z-10">
            <table className="w-full text-left min-w-[900px]">
              <thead className="bg-slate-50 dark:bg-slate-900/80 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Campaign</th>
                  <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Duration</th>
                  <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Summary</th>
                  <th className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Transcript</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => <CallRow key={log.id} log={log} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
