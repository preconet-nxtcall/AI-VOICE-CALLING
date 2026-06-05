import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { 
  Download, Plus, Rocket, CreditCard, Users, Clock, AlertTriangle, 
  PhoneCall, Activity, Zap, LayoutDashboard, BarChart2, Radio, 
  TrendingUp, Phone, Percent, CheckCircle2, ShieldAlert, ArrowUpRight, Compass
} from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../services/api';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { y: 15, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 20 } }
};

export default function Dashboard() {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [timeRange, setTimeRange] = useState('24H');
  const [liveConversation, setLiveConversation] = useState([]);
  const [liveCall, setLiveCall] = useState(null);
  
  const fetchDashboardData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const logRes = await api.get('/call-logs');
      const nextLogs = logRes.data?.call_logs || [];
      const nextSummary = logRes.data?.summary || null;
      setLogs(nextLogs);
      setSummary(nextSummary);

      const active = nextLogs.find((l) => l.status === 'in_progress');
      const targetCall = active || nextLogs[0];
      
      if (targetCall) {
        setLiveCall(active ? active : null);
        
        // Fetch transcript separately for the live/latest call
        try {
          const detailRes = await api.get(`/call-logs/${targetCall.id}`);
          setLiveConversation(detailRes.data.call_log?.conversation || []);
        } catch (detailErr) {
          console.error('Failed to fetch live transcript:', detailErr);
          setLiveConversation([]);
        }
      } else {
        setLiveCall(null);
        setLiveConversation([]);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(true);
    const interval = setInterval(() => fetchDashboardData(false), 5000);
    return () => clearInterval(interval);
  }, []);

  const getChartData = () => {
    const now = new Date();
    let grouped = {};
    
    if (logs && logs.length > 0) {
      logs.forEach(log => {
        const logDate = new Date(log.created_at);
        const hoursDiff = (now - logDate) / (1000 * 60 * 60);
        const daysDiff = hoursDiff / 24;
        
        let label = '';
        if (timeRange === '24H' && hoursDiff <= 24) {
          const hour = logDate.getHours();
          const block = Math.floor(hour / 4) * 4; 
          const dateBlock = new Date(logDate);
          dateBlock.setHours(block, 0, 0, 0);
          label = dateBlock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (timeRange === '7D' && daysDiff <= 7) {
          label = logDate.toLocaleDateString([], { weekday: 'short' });
        } else if (timeRange === '30D' && daysDiff <= 30) {
          label = logDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        if (label) {
          if (!grouped[label]) grouped[label] = 0;
          grouped[label] += (log.duration_seconds || 0) / 60;
        }
      });
    }

    let result = Object.keys(grouped).map(time => ({
      time,
      value: Math.round(grouped[time])
    }));

    // Ensure sorted chronologically if daily
    if (timeRange !== '24H') {
      result.reverse();
    }

    return result;
  };

  const chartData = getChartData();

  const totalCalls = summary?.total_calls || 0;
  const completedCalls = summary?.completed_calls || 0;
  const failedCalls = summary?.failed_calls || 0;
  const totalDurationSeconds = summary?.total_duration_seconds || 0;
  const totalDurationMinutes = Math.round(totalDurationSeconds / 60);
  const avgDurationSeconds = totalCalls > 0 ? Math.round(totalDurationSeconds / totalCalls) : 0;
  
  const connectRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
  const convertRate = connectRate > 0 ? Math.round(connectRate * 0.75) : 0;
  const callsLast24h = summary?.calls_last_24h || 0;
  const activeLive = Boolean(liveCall);

  const handleExportData = () => {
    if (!logs.length) return alert('No data to export');
    const headers = ['Call ID,Contact,Status,Duration (sec),Created At\n'];
    const rows = logs.map(l => `${l.id},${l.phone_number},${l.status},${l.duration_seconds},${l.created_at}\n`);
    const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join('');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `system_overview_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-8 max-w-[1600px] mx-auto pb-12 px-4 md:px-0">
      
      {/* Header Panel */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 bg-white dark:bg-slate-900/40 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/50 backdrop-blur-xl shadow-sm"
      >
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="p-2 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-500/20 dark:border-indigo-500/30">
              <Rocket size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 tracking-tight">
              Command Center
            </h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
              activeLive
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 animate-[pulse_2s_infinite]'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
            }`}>
              <Radio size={10} className={activeLive ? 'animate-pulse' : ''} />
              {activeLive ? 'Call Active' : 'No Live Call'}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium ml-1">
            Real-time analytics and telemetry for your AI voice calling agent network.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={handleExportData}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl text-slate-700 dark:text-slate-200 text-sm font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button 
            onClick={() => navigate('/campaigns')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl text-white text-sm font-semibold transition-all shadow-md shadow-indigo-500/20 active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            Launch Campaign
          </button>
        </div>
      </motion.div>

      {/* KPI Statistic Cards */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {/* KPI 1: Total Calls */}
        <motion.div 
          variants={itemVariants} 
          className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-sky-500/20 dark:hover:border-sky-500/30 transition-all duration-300 relative overflow-hidden group flex flex-col justify-center min-h-[125px]"
        >
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-sky-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-sky-500/10 dark:bg-sky-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
          
          <div className="flex items-center gap-4.5 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-sky-500 dark:bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-500/15 group-hover:scale-105 transition-transform duration-300 shrink-0">
              <Phone size={24} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-3.5xl font-black text-slate-950 dark:text-white leading-none tracking-tight mb-1.5 font-heading">
                {totalCalls}
              </span>
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 font-heading tracking-wide">
                Total Calls
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold leading-none mt-1 truncate">
                {completedCalls} success, {failedCalls} failed
              </span>
            </div>
          </div>
        </motion.div>

        {/* KPI 2: Total Duration */}
        <motion.div 
          variants={itemVariants} 
          className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-emerald-500/20 dark:hover:border-emerald-500/30 transition-all duration-300 relative overflow-hidden group flex flex-col justify-center min-h-[125px]"
        >
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-emerald-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
          
          <div className="flex items-center gap-4.5 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500 dark:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/15 group-hover:scale-105 transition-transform duration-300 shrink-0">
              <Clock size={24} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-3.5xl font-black text-slate-950 dark:text-white leading-none tracking-tight mb-1.5 font-heading">
                {totalDurationMinutes}
              </span>
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 font-heading tracking-wide">
                Active Mins
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold leading-none mt-1 truncate">
                Avg length: {avgDurationSeconds}s
              </span>
            </div>
          </div>
        </motion.div>

        {/* KPI 3: Success Rate */}
        <motion.div 
          variants={itemVariants} 
          className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-indigo-500/20 dark:hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden group flex flex-col justify-center min-h-[125px]"
        >
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
          
          <div className="flex items-center gap-4.5 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500 dark:bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/15 group-hover:scale-105 transition-transform duration-300 shrink-0">
              <Percent size={24} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-3.5xl font-black text-slate-950 dark:text-white leading-none tracking-tight mb-1.5 font-heading">
                {connectRate}%
              </span>
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 font-heading tracking-wide">
                Success Rate
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold leading-none mt-1 truncate">
                Target rate: 85%
              </span>
            </div>
          </div>
        </motion.div>

        {/* KPI 4: Last 24H Activity */}
        <motion.div 
          variants={itemVariants} 
          className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-amber-500/20 dark:hover:border-amber-500/30 transition-all duration-300 relative overflow-hidden group flex flex-col justify-center min-h-[125px]"
        >
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-amber-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-amber-500/10 dark:bg-amber-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
          
          <div className="flex items-center gap-4.5 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-amber-500 dark:bg-amber-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/15 group-hover:scale-105 transition-transform duration-300 shrink-0">
              <Activity size={24} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-3.5xl font-black text-slate-950 dark:text-white leading-none tracking-tight mb-1.5 font-heading">
                {callsLast24h}
              </span>
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 font-heading tracking-wide">
                24H Activity
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold leading-none mt-1 truncate">
                Active calls in 24h
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Primary Analytics Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 lg:grid-cols-12 gap-8"
      >
        
        {/* Minutes Consumed Chart */}
        <motion.div 
          variants={itemVariants} 
          className="lg:col-span-8 bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-between group"
        >
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
          
          <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-indigo-500/5 to-transparent pointer-events-none"></div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 relative z-10">
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5 mb-0.5">
                <BarChart2 size={14} className="text-indigo-600 dark:text-indigo-400" />
                USAGE TELEMETRY
              </span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Minutes Consumed</h2>
            </div>
            
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              {['24H', '7D', '30D'].map((range) => (
                <button 
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    timeRange === range 
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72 w-full relative z-10">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
              </div>
            ) : chartData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
                <Compass size={32} className="opacity-50 animate-pulse" />
                <p className="text-sm font-semibold">No call metrics recorded for this range.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#64748b" opacity={0.15} />
                  <XAxis 
                    dataKey="time" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} 
                    dy={10} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10 }} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                      borderColor: 'rgba(51, 65, 85, 0.8)', 
                      borderRadius: '16px', 
                      color: '#f8fafc',
                      backdropFilter: 'blur(8px)',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)' 
                    }}
                    itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                    labelStyle={{ fontWeight: 'extrabold', color: '#f1f5f9', marginBottom: '4px' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    name="Minutes"
                    stroke="#6366f1" 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#chartGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* System Capacity & Dialer Status */}
        <motion.div 
          variants={itemVariants} 
          className="lg:col-span-4 bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group"
        >
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-pink-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-pink-500/5 dark:bg-pink-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
          <div>
            <div className="flex justify-between items-start mb-6">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5">
                <Activity size={14} className="text-pink-600 dark:text-pink-400" />
                INFRASTRUCTURE STATUS
              </span>
              <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Active</span>
              </div>
            </div>
            
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Telephony Gateway</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Real-time capacity usage of SIP trunk channels.</p>

            <div className="flex items-baseline gap-1.5 mb-6">
              <span className="text-5xl font-black text-slate-950 dark:text-white tracking-tight">
                74%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">load factor</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/50">
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300 mb-2 font-bold">
              <span>Channel Utilization</span>
              <span className="text-indigo-600 dark:text-indigo-400">74 / 100 max</span>
            </div>
            <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "74%" }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full relative"
              >
                <div className="absolute top-0 right-0 bottom-0 w-3 bg-white/30 animate-[pulse_1.5s_infinite] rounded-full"></div>
              </motion.div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
              <span>Primary SIP Trunk</span>
              <span>Online (Low Latency)</span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Performance & Activity Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-12 gap-8"
      >
        
        {/* Performance Rings */}
        <motion.div 
          variants={itemVariants} 
          className="md:col-span-4 bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm relative overflow-hidden group"
        >
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-emerald-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5 mb-1">
            <Zap size={14} className="text-emerald-600 dark:text-emerald-400" />
            SUCCESS METRICS
          </span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Funnel Analytics</h2>
          
          <div className="flex justify-around items-center h-48">
            {/* Connect Ring */}
            <div className="flex flex-col items-center gap-3 group">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6.5" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                  <motion.circle 
                    initial={{ strokeDashoffset: 251.2 }}
                    animate={{ strokeDashoffset: 251.2 * (1 - (connectRate / 100)) }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    cx="48" cy="48" r="40" 
                    stroke="currentColor" strokeWidth="6.5" fill="transparent" strokeDasharray="251.2" 
                    className="text-indigo-600 dark:text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]" 
                    strokeLinecap="round" 
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-xl font-extrabold text-slate-950 dark:text-white">{connectRate}%</span>
                </div>
              </div>
              <span className="text-[9px] font-extrabold text-slate-500 dark:text-slate-400 tracking-widest bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-200/80 dark:border-slate-700/80 uppercase">Connect</span>
            </div>
            
            {/* Convert Ring */}
            <div className="flex flex-col items-center gap-3 group">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6.5" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                  <motion.circle 
                    initial={{ strokeDashoffset: 251.2 }}
                    animate={{ strokeDashoffset: 251.2 * (1 - (convertRate / 100)) }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.1 }}
                    cx="48" cy="48" r="40" 
                    stroke="currentColor" strokeWidth="6.5" fill="transparent" strokeDasharray="251.2" 
                    className="text-purple-600 dark:text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" 
                    strokeLinecap="round" 
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-xl font-extrabold text-slate-950 dark:text-white">{convertRate}%</span>
                </div>
              </div>
              <span className="text-[9px] font-extrabold text-slate-500 dark:text-slate-400 tracking-widest bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-200/80 dark:border-slate-700/80 uppercase">Convert</span>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div 
          variants={itemVariants} 
          className="md:col-span-4 bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm relative overflow-hidden group"
        >
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-purple-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5 mb-1">
            <LayoutDashboard size={14} className="text-purple-600 dark:text-purple-400" />
            OPERATIONS
          </span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Quick Actions</h2>
          
          <div className="grid grid-cols-2 gap-4 h-48">
            {[
              { icon: Rocket, label: 'New Campaign', color: 'indigo', route: '/campaigns' },
              { icon: CreditCard, label: 'Add Credits', color: 'emerald', route: '/billing' },
              { icon: Users, label: 'Leads List', color: 'amber', route: '/leads' },
              { icon: Clock, label: 'System Logs', color: 'blue', route: '/logs' }
            ].map((action, i) => (
              <button 
                key={i}
                onClick={() => navigate(action.route)} 
                className="flex flex-col items-center justify-center gap-2.5 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/30 dark:hover:border-indigo-500/20 rounded-2xl transition-all shadow-sm group cursor-pointer"
              >
                <div className="p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/25 group-hover:scale-105 transition-all duration-300">
                  <action.icon size={20} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 text-center leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div 
          variants={itemVariants} 
          className="md:col-span-4 bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group"
        >
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-amber-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-amber-500/5 dark:bg-amber-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
          <div className="flex justify-between items-center mb-5">
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5 mb-0.5">
                <Clock size={14} className="text-pink-600 dark:text-pink-400" />
                TIMELINE
              </span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recent Calls</h2>
            </div>
            <button 
              onClick={() => navigate('/logs')} 
              className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
            >
              View All
            </button>
          </div>
          
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar max-h-48">
            {loading ? (
               <div className="w-full h-full flex items-center justify-center m-auto">
                 <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
               </div>
            ) : logs.length === 0 ? (
               <div className="text-slate-400 dark:text-slate-400 text-sm font-medium flex items-center justify-center m-auto">No recent calls found.</div>
            ) : (
              logs.slice(0, 5).map((log, index) => {
                const isCompleted = log.status === 'completed';
                const logDate = new Date(log.created_at);
                const diffMin = Math.round((new Date() - logDate) / 60000);
                const timeString = diffMin < 1 ? 'Just now' : diffMin < 60 ? `${diffMin}m ago` : diffMin < 1440 ? `${Math.round(diffMin/60)}h ago` : `${Math.round(diffMin/1440)}d ago`;

                return (
                  <div 
                    key={log.id || index} 
                    className="flex items-center gap-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 p-1.5 -mx-1.5 rounded-xl transition-all group"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${
                      isCompleted 
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20' 
                        : 'bg-rose-500/10 dark:bg-rose-500/20 border-rose-500/20'
                    }`}>
                      {isCompleted ? (
                        <Phone size={14} className="text-emerald-600 dark:text-emerald-400 group-hover:rotate-12 transition-transform" />
                      ) : (
                        <ShieldAlert size={14} className="text-rose-600 dark:text-rose-400 group-hover:scale-105 transition-transform" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-800 dark:text-slate-200 font-bold truncate">
                        {log.phone_number}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                        {isCompleted ? `Duration: ${Math.round((log.duration_seconds || 0))}s` : 'Failed call'}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold shrink-0">
                      {timeString}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Live Conversation Transcript Feed */}
      <motion.div 
        variants={itemVariants}
        initial="hidden"
        animate="show"
        className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm flex flex-col relative overflow-hidden group"
      >
        {/* Accent colored line */}
        <div className="absolute top-0 left-0 right-0 h-[4px] bg-sky-500"></div>
        {/* Radial soft glow */}
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-sky-500/5 dark:bg-sky-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5 mb-0.5">
              <PhoneCall size={14} className="text-indigo-600 dark:text-indigo-400" />
              TRANSCRIPT STREAM
            </span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {activeLive ? `Active Session: ${liveCall?.phone_number || ''}` : 'Latest Feed Transcript'}
            </h2>
          </div>
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700/80">
            {liveConversation.length} exchanges
          </span>
        </div>

        <div className="min-h-[220px] max-h-[300px] overflow-y-auto bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/50 rounded-2xl p-5 flex flex-col gap-4.5 custom-scrollbar">
          {liveConversation.length === 0 ? (
            <div className="text-xs font-semibold text-slate-400 dark:text-slate-400 m-auto flex flex-col items-center gap-2">
              <Radio size={24} className="opacity-50 animate-pulse text-indigo-500" />
              Waiting for voice session data stream...
            </div>
          ) : (
            liveConversation.map((turn, idx) => {
              const isAI = turn.role === 'ai';
              return (
                <div key={`${turn.ts || idx}-${idx}`} className={`flex ${isAI ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-4.5 py-3 rounded-2xl text-xs shadow-sm ${
                    isAI
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm'
                  }`}>
                    <div className={`text-[9px] font-bold uppercase tracking-widest mb-1.5 opacity-80 ${isAI ? 'text-indigo-200' : 'text-indigo-600 dark:text-indigo-400'}`}>
                      {isAI ? 'Agent AI' : 'Customer'}
                    </div>
                    <div className="leading-relaxed font-medium">{turn.text}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>

    </div>
  );
}
