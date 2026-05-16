import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Phone, 
  MessageSquare, 
  Clock, 
  User, 
  Hash, 
  AlertCircle, 
  ChevronRight, 
  Search,
  Filter,
  RefreshCw,
  Eye,
  Rocket
} from 'lucide-react';
import { format } from 'date-fns';

export default function LiveDashboard() {
  const [activeCalls, setActiveCalls] = useState([]);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const wsRef = useRef(null);
  const scrollRefs = useRef({});

  // Connect to live events WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/live-events`;

    const connect = () => {
      console.log('Connecting to Live Events:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setReconnectCount(0);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleLiveEvent(data);
        } catch (err) {
          console.error('Failed to parse live event:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Exponential backoff reconnect
        const timeout = Math.min(1000 * Math.pow(2, reconnectCount), 30000);
        setTimeout(() => {
          setReconnectCount(prev => prev + 1);
          connect();
        }, timeout);
      };

      ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
      };
    };

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [reconnectCount]);

  const handleLiveEvent = (data) => {
    const { event, call_sid, kb_id, customer_text, ai_text, timestamp } = data;

    setActiveCalls(prev => {
      const existing = prev.find(c => c.call_sid === call_sid);
      
      if (event === 'call_start') {
        if (existing) return prev;
        return [{
          call_sid,
          kb_id,
          startTime: timestamp,
          transcripts: [],
          status: 'active',
          lastUpdate: timestamp
        }, ...prev];
      }

      if (event === 'transcript') {
        if (!existing) {
          // If we missed the start event, create it now
          return [{
            call_sid,
            kb_id,
            startTime: timestamp,
            transcripts: [{ customer: customer_text, ai: ai_text, ts: timestamp }],
            status: 'active',
            lastUpdate: timestamp
          }, ...prev];
        }

        return prev.map(c => {
          if (c.call_sid === call_sid) {
            return {
              ...c,
              transcripts: [...c.transcripts, { customer: customer_text, ai: ai_text, ts: timestamp }],
              lastUpdate: timestamp
            };
          }
          return c;
        });
      }

      if (event === 'call_end') {
        return prev.map(c => {
          if (c.call_sid === call_sid) {
            return { ...c, status: 'completed' };
          }
          return c;
        });
      }

      return prev;
    });
  };

  // Auto-scroll transcripts
  useEffect(() => {
    activeCalls.forEach(call => {
      const ref = scrollRefs.current[call.call_sid];
      if (ref) {
        ref.scrollTop = ref.scrollHeight;
      }
    });
  }, [activeCalls]);

  const selectedCall = activeCalls.find(c => c.call_sid === selectedCallId);

  return (
    <div className="flex flex-col h-full bg-[#0b1120] text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-slate-800 bg-slate-900/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500 animate-pulse'} transition-colors duration-500`}></div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Live Call Monitoring
              <Activity size={20} className="text-indigo-400" />
            </h1>
            <p className="text-sm text-slate-400 font-medium">
              {isConnected ? 'Connected to live stream' : 'Reconnecting...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-slate-800/50 rounded-xl border border-slate-700/50 flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Active Calls:</span>
            <span className="text-lg font-mono font-bold text-white">
              {activeCalls.filter(c => c.status === 'active').length}
            </span>
          </div>
          <button 
            onClick={() => setActiveCalls([])}
            className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            title="Clear list"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Active Calls List */}
        <div className="w-1/3 border-r border-slate-800 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {activeCalls.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-3xl">
              <Phone size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-medium">Waiting for incoming calls...</p>
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
                        <p className="text-sm font-mono text-white">...{call.call_sid?.slice(-8)}</p>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      call.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/20 text-slate-400'
                    }`}>
                      {call.status}
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Clock size={12} className="text-indigo-400" />
                      <span>Started: {format(new Date(call.startTime), 'HH:mm:ss')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <MessageSquare size={12} className="text-indigo-400" />
                      <span>{call.transcripts.length} turns exchanged</span>
                    </div>
                  </div>

                  {/* Tiny Transcript Preview */}
                  {call.transcripts.length > 0 && (
                    <div className="text-[11px] bg-black/20 p-2 rounded-lg border border-white/5 text-slate-400 italic line-clamp-1">
                      {call.transcripts[call.transcripts.length - 1].customer}
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

        {/* Detailed Transcript View */}
        <div className="flex-1 bg-slate-950/20 flex flex-col overflow-hidden">
          {selectedCall ? (
            <div className="flex flex-col h-full">
              {/* Call Detail Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-900/20 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] mb-1">Active Connection</span>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      {selectedCall.call_sid}
                    </h2>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="px-4 py-2 bg-slate-800/50 rounded-xl border border-slate-700/50 flex flex-col items-center">
                    <span className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Duration</span>
                    <span className="text-sm font-mono text-white font-bold">Live</span>
                  </div>
                </div>
              </div>

              {/* Scrollable Transcript Area */}
              <div 
                ref={el => scrollRefs.current[selectedCall.call_sid] = el}
                className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar"
              >
                {selectedCall.transcripts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 italic">
                    <Eye size={32} className="mb-4 opacity-20" />
                    <p>Silence... listening for conversation</p>
                  </div>
                ) : (
                  selectedCall.transcripts.map((turn, idx) => (
                    <motion.div 
                      key={idx} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      {/* Customer Side */}
                      <div className="flex gap-4 items-start">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-1">
                          <User size={14} className="text-slate-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Customer</span>
                            <span className="text-[10px] text-slate-600">{format(new Date(turn.ts), 'HH:mm:ss')}</span>
                          </div>
                          <div className="bg-slate-800/40 border border-slate-700/50 px-5 py-3.5 rounded-2xl rounded-tl-sm text-sm text-slate-200 leading-relaxed shadow-sm">
                            {turn.customer}
                          </div>
                        </div>
                      </div>

                      {/* AI Side */}
                      <div className="flex gap-4 items-start flex-row-reverse">
                        <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-1 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                          <Rocket size={14} className="text-indigo-400" />
                        </div>
                        <div className="flex-1 flex flex-col items-end">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] text-slate-600">{format(new Date(turn.ts), 'HH:mm:ss')}</span>
                            <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">AI Assistant</span>
                          </div>
                          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-3.5 rounded-2xl rounded-tr-sm text-sm text-white leading-relaxed shadow-lg shadow-indigo-500/20">
                            {turn.ai}
                          </div>
                        </div>
                      </div>
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
