import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Phone, 
  MessageSquare, 
  Clock, 
  User, 
  AlertCircle, 
  ChevronRight, 
  RefreshCw,
  Eye,
  Rocket
} from 'lucide-react';
import { format, isValid } from 'date-fns';

// Max completed calls to keep in memory (high-volume safety)
const MAX_COMPLETED_CALLS = 50;
// Heartbeat ping interval (ms) — keeps WS alive past 30s server timeout
const PING_INTERVAL_MS = 20_000;

/** Safe date formatter — prevents crash on null/undefined/invalid timestamps */
function safeFormat(ts, fmt) {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  return isValid(d) ? format(d, fmt) : '--:--:--';
}

export default function LiveDashboard() {
  const [activeCalls, setActiveCalls] = useState([]);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Refs so closures always see latest values without triggering re-effects
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pingTimerRef = useRef(null);
  const reconnectCountRef = useRef(0);
  const isUnmountedRef = useRef(false);

  // One scrollRef per selected call — only scroll the visible panel
  const transcriptScrollRef = useRef(null);

  // ─── Heartbeat ──────────────────────────────────────────────────────────────
  const startPing = useCallback((ws) => {
    clearInterval(pingTimerRef.current);
    pingTimerRef.current = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch (_) {}
      }
    }, PING_INTERVAL_MS);
  }, []);

  // ─── WebSocket connect (stable ref, no re-mounts on reconnect) ──────────────
  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;

    // Attach JWT as query-param so backend can authenticate the WS upgrade
    const token = localStorage.getItem('token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const wsUrl = `${protocol}//${host}/api/v1/live-events${tokenParam}`;

    console.log('[LiveDashboard] Connecting to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isUnmountedRef.current) { ws.close(); return; }
      reconnectCountRef.current = 0;
      setIsConnected(true);
      startPing(ws);
      console.log('[LiveDashboard] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Ignore server pong / heartbeat responses
        if (data.type === 'pong') return;
        handleLiveEvent(data);
      } catch (err) {
        console.error('[LiveDashboard] Failed to parse live event:', err);
      }
    };

    ws.onclose = (e) => {
      clearInterval(pingTimerRef.current);
      setIsConnected(false);
      if (isUnmountedRef.current) return;

      // Exponential backoff: 1 s, 2 s, 4 s … cap at 30 s
      const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current), 30_000);
      reconnectCountRef.current += 1;
      console.log(`[LiveDashboard] WS closed (code=${e.code}). Reconnecting in ${delay}ms…`);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error('[LiveDashboard] WebSocket error:', err);
      // onclose fires after onerror, so reconnect is handled there
    };
  }, [startPing]); // stable — no state deps

  // ─── Mount / unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    isUnmountedRef.current = false;
    connect();
    return () => {
      isUnmountedRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      clearInterval(pingTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]); // `connect` is stable — only runs once on mount

  // ─── Live event handler ─────────────────────────────────────────────────────
  const handleLiveEvent = useCallback((data) => {
    const { event, call_sid, kb_id, customer_text, ai_text, timestamp } = data;

    setActiveCalls(prev => {
      const existing = prev.find(c => c.call_sid === call_sid);

      if (event === 'call_start') {
        if (existing) return prev; // deduplicate
        return [{
          call_sid,
          kb_id,
          startTime: timestamp,
          transcripts: [],
          status: 'active',
          lastUpdate: timestamp,
        }, ...prev];
      }

      if (event === 'transcript') {
        if (!existing) {
          // Missed call_start — create the entry on first transcript
          return [{
            call_sid,
            kb_id,
            startTime: timestamp,
            transcripts: [{ customer: customer_text, ai: ai_text, ts: timestamp }],
            status: 'active',
            lastUpdate: timestamp,
          }, ...prev];
        }
        return prev.map(c => {
          if (c.call_sid !== call_sid) return c;
          return {
            ...c,
            transcripts: [...c.transcripts, { customer: customer_text, ai: ai_text, ts: timestamp }],
            lastUpdate: timestamp,
            analysis: data.analysis || c.analysis,
          };
        });
      }

      if (event === 'call_end') {
        const updated = prev.map(c =>
          c.call_sid === call_sid ? { ...c, status: 'completed', lastUpdate: timestamp } : c
        );
        // Prune old completed calls to avoid memory bloat under high volume
        const completed = updated.filter(c => c.status === 'completed');
        if (completed.length > MAX_COMPLETED_CALLS) {
          const keep = new Set(
            updated
              .filter(c => c.status === 'active')
              .concat(completed.slice(0, MAX_COMPLETED_CALLS))
              .map(c => c.call_sid)
          );
          return updated.filter(c => keep.has(c.call_sid));
        }
        return updated;
      }

      return prev;
    });
  }, []);

  // ─── Auto-scroll: only the selected call's transcript panel ─────────────────
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [activeCalls, selectedCallId]);

  // Auto-deselect if a selected call is removed from state
  useEffect(() => {
    if (selectedCallId && !activeCalls.find(c => c.call_sid === selectedCallId)) {
      setSelectedCallId(null);
    }
  }, [activeCalls, selectedCallId]);

  const selectedCall = activeCalls.find(c => c.call_sid === selectedCallId);
  const activeCount = activeCalls.filter(c => c.status === 'active').length;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#0b1120] text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-slate-800 bg-slate-900/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full transition-colors duration-500 ${
            isConnected
              ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
              : 'bg-red-500 animate-pulse'
          }`} />
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Live Call Monitoring
              <Activity size={20} className="text-indigo-400" />
            </h1>
            <p className="text-sm text-slate-400 font-medium">
              {isConnected ? 'Connected to live stream' : 'Reconnecting…'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-slate-800/50 rounded-xl border border-slate-700/50 flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Active Calls:</span>
            <span className="text-lg font-mono font-bold text-white">{activeCount}</span>
          </div>
          <button
            onClick={() => {
              if (window.confirm('Clear all call entries from the list?')) {
                setActiveCalls([]);
                setSelectedCallId(null);
              }
            }}
            className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            title="Clear list"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Active Calls Sidebar */}
        <div className="w-1/3 border-r border-slate-800 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {activeCalls.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-3xl">
              <Phone size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-medium">Waiting for incoming calls…</p>
            </div>
          ) : (
            <AnimatePresence>
              {activeCalls.map((call) => (
                <motion.div
                  key={call.call_sid}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => setSelectedCallId(call.call_sid)}
                  className={`relative p-5 rounded-2xl cursor-pointer transition-all border group ${
                    selectedCallId === call.call_sid
                      ? 'bg-indigo-600/10 border-indigo-500/40 shadow-lg shadow-indigo-500/5'
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${call.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
                        <Phone size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Call SID</p>
                        <p className="text-sm font-mono text-white">…{call.call_sid?.slice(-8)}</p>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      call.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-500/20 text-slate-400'
                    }`}>
                      {call.status}
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Clock size={12} className="text-indigo-400" />
                      <span>Started: {safeFormat(call.startTime, 'HH:mm:ss')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <MessageSquare size={12} className="text-indigo-400" />
                      <span>{call.transcripts.length} turns exchanged</span>
                    </div>
                  </div>

                  {call.transcripts.length > 0 && (
                    <div className="text-[11px] bg-black/20 p-2 rounded-lg border border-white/5 text-slate-400 italic line-clamp-1">
                      {call.transcripts[call.transcripts.length - 1].customer || '…'}
                    </div>
                  )}

                  <div className={`absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity ${selectedCallId === call.call_sid ? 'opacity-100 text-indigo-400' : ''}`}>
                    <ChevronRight size={20} />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Transcript Detail Panel */}
        <div className="flex-1 bg-slate-950/20 flex flex-col overflow-hidden">
          {selectedCall ? (
            <div className="flex flex-col h-full">
              {/* Call Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-900/20 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] mb-1">
                      {selectedCall.status === 'active' ? 'Active Connection' : 'Completed Call'}
                    </span>
                    <h2 className="text-xl font-bold text-white">{selectedCall.call_sid}</h2>
                  </div>

                  {selectedCall.analysis?.appointment_detected && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.1)]"
                    >
                      <Rocket size={16} className="animate-bounce" />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider leading-none mb-1">Appointment Detected</span>
                        <span className="text-xs font-medium text-white">{selectedCall.analysis.appointment_details}</span>
                      </div>
                    </motion.div>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="px-4 py-2 bg-slate-800/50 rounded-xl border border-slate-700/50 flex flex-col items-center">
                    <span className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Duration</span>
                    <span className="text-sm font-mono text-white font-bold">
                      {selectedCall.status === 'active' ? 'Live' : 'Ended'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scrollable Transcript */}
              <div
                ref={transcriptScrollRef}
                className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar"
              >
                {selectedCall.transcripts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 italic">
                    <Eye size={32} className="mb-4 opacity-20" />
                    <p>Silence… listening for conversation</p>
                  </div>
                ) : (
                  selectedCall.transcripts.map((turn, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      {/* Customer */}
                      {turn.customer && (
                        <div className="flex gap-4 items-start">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-1">
                            <User size={14} className="text-slate-400" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Customer</span>
                              <span className="text-[10px] text-slate-600">{safeFormat(turn.ts, 'HH:mm:ss')}</span>
                            </div>
                            <div className="bg-slate-800/40 border border-slate-700/50 px-5 py-3.5 rounded-2xl rounded-tl-sm text-sm text-slate-200 leading-relaxed shadow-sm">
                              {turn.customer}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* AI */}
                      {turn.ai && (
                        <div className="flex gap-4 items-start flex-row-reverse">
                          <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-1 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                            <Rocket size={14} className="text-indigo-400" />
                          </div>
                          <div className="flex-1 flex flex-col items-end">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] text-slate-600">{safeFormat(turn.ts, 'HH:mm:ss')}</span>
                              <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">AI Assistant</span>
                            </div>
                            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-3.5 rounded-2xl rounded-tr-sm text-sm text-white leading-relaxed shadow-lg shadow-indigo-500/20">
                              {turn.ai}
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-slate-800 shadow-inner">
                <Activity size={40} className="text-slate-700" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No Call Selected</h3>
              <p className="text-slate-500 max-w-sm">
                Select an active call from the left sidebar to monitor the live transcription and interaction.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
