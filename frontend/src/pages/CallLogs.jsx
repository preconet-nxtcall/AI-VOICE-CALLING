import { useEffect, useState } from 'react';
import api from '../services/api';

const formatDuration = (seconds) => {
  const mins = Math.floor((seconds || 0) / 60);
  const secs = (seconds || 0) % 60;
  return `${mins}m ${secs}s`;
};

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
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Call Logs</h1>
        <p className="text-slate-400">Recent voice call outcomes and durations.</p>
      </div>
      {error && <div className="text-red-400 text-sm">{error}</div>}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-3"><p className="text-slate-400 text-xs">Total Calls</p><p className="text-white text-xl">{summary.total_calls}</p></div>
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-3"><p className="text-slate-400 text-xs">Completed</p><p className="text-white text-xl">{summary.completed_calls}</p></div>
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-3"><p className="text-slate-400 text-xs">Failed</p><p className="text-white text-xl">{summary.failed_calls}</p></div>
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-3"><p className="text-slate-400 text-xs">Last 24h</p><p className="text-white text-xl">{summary.calls_last_24h}</p></div>
        </div>
      )}

      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 text-slate-400 text-xs">Time</th>
              <th className="px-4 py-3 text-slate-400 text-xs">Phone</th>
              <th className="px-4 py-3 text-slate-400 text-xs">Campaign</th>
              <th className="px-4 py-3 text-slate-400 text-xs">Status</th>
              <th className="px-4 py-3 text-slate-400 text-xs">Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-6 text-slate-400" colSpan="5">Loading call logs...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td className="px-4 py-6 text-slate-400" colSpan="5">No call logs found.</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-800">
                <td className="px-4 py-3 text-slate-300">{new Date(log.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-100">{log.phone_number}</td>
                <td className="px-4 py-3 text-slate-300">{log.campaign_name || '-'}</td>
                <td className="px-4 py-3 text-slate-300 capitalize">{log.status}</td>
                <td className="px-4 py-3 text-slate-300">{formatDuration(log.duration_seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
