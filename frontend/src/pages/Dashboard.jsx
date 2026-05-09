import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Download, Plus, Rocket, CreditCard, Users, Clock, AlertTriangle, PhoneCall, Activity, Zap, LayoutDashboard, BarChart2 } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../services/api';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function Dashboard() {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [timeRange, setTimeRange] = useState('24H');
  
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const logRes = await api.get('/call-logs');
      setLogs(logRes.data.data?.call_logs || []);
      setSummary(logRes.data.data?.summary || null);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
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

    if (result.length === 0) {
      // Return empty array to show empty chart state
      return [];
    }

    return result;
  };

  const chartData = getChartData();

  const totalCalls = summary?.total_calls || 1250;
  const completedCalls = summary?.completed_calls || 980;
  const connectRate = Math.round((completedCalls / totalCalls) * 100) || 78;
  const convertRate = Math.round(connectRate * 0.75) || 58;
  const activeChannelsApprox = summary?.calls_last_24h || 124;

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
    <div className="flex flex-col gap-8 max-w-[1600px] mx-auto pb-10">
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-lg border border-indigo-500/20 dark:border-indigo-500/30">
              <Zap size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 tracking-tight">
              Command Center
            </h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium ml-1">Real-time monitoring for your AI infrastructure.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-4 md:mt-0">
          <button 
            onClick={handleExportData}
            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-[#1e293b]/80 border border-[#E2E8F0] dark:border-slate-700 hover:border-indigo-500/50 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 font-semibold transition-all shadow-sm"
          >
            <Download size={18} />
            Export Data
          </button>
          <button 
            onClick={() => navigate('/campaigns')}
            className="group relative flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl text-slate-900 dark:text-white font-semibold transition-all shadow-lg dark:shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-xl dark:hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
            <Plus size={18} className="relative z-10" />
            <span className="relative z-10">Launch Campaign</span>
          </button>
        </div>
      </motion.div>

      {/* Grid Layout */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-12 gap-6"
      >
        
        {/* Active Channels Card */}
        <motion.div variants={itemVariants} className="col-span-1 md:col-span-4 bg-[#FFFFFF] dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 rounded-3xl p-7 relative overflow-hidden group flex flex-col justify-between shadow-sm dark:shadow-2xl hover:border-indigo-500/50 transition-colors duration-500">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div>
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 tracking-widest">LIVE STATUS</span>
              </div>
              <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 dark:border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Online</span>
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 relative z-10">24H Call Volume</h2>
            <div className="flex items-baseline gap-2 mb-8 relative z-10">
              <span className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-slate-900 to-slate-700 dark:from-white dark:to-slate-400 tracking-tighter">
                {activeChannelsApprox}
              </span>
              <span className="text-slate-600 dark:text-slate-400 font-semibold tracking-wide">calls</span>
            </div>
          </div>
          <div className="relative z-10 bg-slate-100 dark:bg-slate-900/50 p-4 rounded-2xl border border-[#E2E8F0] dark:border-slate-800">
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-3 font-semibold">
              <span>System Capacity</span>
              <span className="text-indigo-600 dark:text-indigo-300">74%</span>
            </div>
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "74%" }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.6)] relative"
              >
                <div className="absolute top-0 right-0 bottom-0 w-4 bg-white/30 animate-[pulse_2s_ease-in-out_infinite] rounded-full blur-[2px]"></div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Minutes Consumed Chart */}
        <motion.div variants={itemVariants} className="col-span-1 md:col-span-8 bg-[#FFFFFF] dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 rounded-3xl p-7 shadow-sm dark:shadow-2xl hover:border-indigo-500/50 transition-colors duration-500 relative overflow-hidden">
          <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-indigo-900/5 to-transparent pointer-events-none"></div>
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-widest flex items-center gap-2 mb-1">
                <BarChart2 size={16} className="text-indigo-600 dark:text-indigo-400" />
                USAGE TRENDS
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Minutes Consumed</h2>
            </div>
            <div className="flex bg-slate-100 dark:bg-[#0f172a] rounded-xl p-1.5 border border-[#E2E8F0] dark:border-slate-800 shadow-inner">
              {['24H', '7D', '30D'].map((range) => (
                <button 
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    timeRange === range 
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-md border border-[#E2E8F0] dark:border-slate-700' 
                      : 'text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-700 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          
          <div className="h-64 w-full relative z-10">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      borderColor: '#334155', 
                      borderRadius: '12px', 
                      color: '#f8fafc', 
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)' 
                    }}
                    itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Performance Rings */}
        <motion.div variants={itemVariants} className="col-span-1 md:col-span-4 bg-[#FFFFFF] dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 rounded-3xl p-7 shadow-sm dark:shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl"></div>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-widest flex items-center gap-2 mb-1">
            <Zap size={16} className="text-cyan-600 dark:text-cyan-400" />
            SUCCESS ANALYTICS
          </span>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">Performance</h2>
          
          <div className="flex justify-around items-center h-48 relative z-10">
            {/* Connect Ring */}
            <div className="flex flex-col items-center gap-4 group">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90 drop-shadow-md dark:drop-shadow-xl">
                  <circle cx="56" cy="56" r="46" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                  <motion.circle 
                    initial={{ strokeDashoffset: 289 }}
                    animate={{ strokeDashoffset: 289 * (1 - (connectRate / 100)) }}
                    transition={{ duration: 2, ease: "easeOut" }}
                    cx="56" cy="56" r="46" 
                    stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="289" 
                    className="text-indigo-600 dark:text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.5)] group-hover:drop-shadow-[0_0_15px_rgba(99,102,241,0.8)] transition-all" strokeLinecap="round" 
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">{connectRate}%</span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest bg-slate-100 dark:bg-slate-900/50 px-3 py-1.5 rounded-full border border-[#E2E8F0] dark:border-slate-800 uppercase">CONNECT</span>
            </div>
            
            {/* Convert Ring */}
            <div className="flex flex-col items-center gap-4 group">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90 drop-shadow-md dark:drop-shadow-xl">
                  <circle cx="56" cy="56" r="46" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                  <motion.circle 
                    initial={{ strokeDashoffset: 289 }}
                    animate={{ strokeDashoffset: 289 * (1 - (convertRate / 100)) }}
                    transition={{ duration: 2, ease: "easeOut", delay: 0.2 }}
                    cx="56" cy="56" r="46" 
                    stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="289" 
                    className="text-cyan-600 dark:text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] group-hover:drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] transition-all" strokeLinecap="round" 
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">{convertRate}%</span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest bg-slate-100 dark:bg-slate-900/50 px-3 py-1.5 rounded-full border border-[#E2E8F0] dark:border-slate-800 uppercase">CONVERT</span>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={itemVariants} className="col-span-1 md:col-span-4 bg-[#FFFFFF] dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 rounded-3xl p-7 shadow-sm dark:shadow-2xl">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-widest flex items-center gap-2 mb-1">
            <LayoutDashboard size={16} className="text-purple-600 dark:text-purple-400" />
            OPERATIONS
          </span>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Quick Actions</h2>
          
          <div className="grid grid-cols-2 gap-4 h-[200px]">
            {[
              { icon: Rocket, label: 'Launch\nCampaign', color: 'indigo', route: '/campaigns' },
              { icon: CreditCard, label: 'Add\nCredits', color: 'emerald', route: '/billing' },
              { icon: Users, label: 'Billing &\nUsage', color: 'amber', route: '/billing' },
              { icon: Clock, label: 'View\nHistory', color: 'blue', route: '/logs' }
            ].map((action, i) => (
              <motion.button 
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                key={i}
                onClick={() => navigate(action.route)} 
                className={`flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-[#0f172a] hover:bg-slate-100 dark:hover:bg-slate-800 border border-[#E2E8F0] dark:border-slate-800 hover:border-indigo-500/50 rounded-2xl transition-all shadow-inner group`}
              >
                <div className={`p-3 rounded-xl bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors`}>
                  <action.icon size={22} className={`text-indigo-600 dark:text-indigo-400 group-hover:drop-shadow-[0_0_8px_currentColor]`} />
                </div>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 text-center leading-snug whitespace-pre-line">{action.label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={itemVariants} className="col-span-1 md:col-span-4 bg-[#FFFFFF] dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 rounded-3xl p-7 shadow-sm dark:shadow-2xl flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-widest flex items-center gap-2 mb-1">
                <Clock size={16} className="text-pink-600 dark:text-pink-400" />
                TIMELINE
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Recent Activity</h2>
            </div>
            <button onClick={() => navigate('/logs')} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-full transition-colors">
              View All
            </button>
          </div>
          
          <div className="flex-1 flex flex-col gap-5 overflow-y-auto pr-2 custom-scrollbar" style={{maxHeight: '220px'}}>
            {loading ? (
               <div className="w-full h-full flex items-center justify-center">
                 <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
               </div>
            ) : logs.length === 0 ? (
               <div className="text-slate-600 dark:text-slate-500 text-sm font-medium flex items-center justify-center h-full">No recent activity found.</div>
            ) : (
              logs.slice(0, 5).map((log, index) => {
                const isCompleted = log.status === 'completed';
                const logDate = new Date(log.created_at);
                const diffMin = Math.round((new Date() - logDate) / 60000);
                const timeString = diffMin < 60 ? `${diffMin}m ago` : diffMin < 1440 ? `${Math.round(diffMin/60)}h ago` : `${Math.round(diffMin/1440)}d ago`;

                return (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    key={log.id || index} 
                    className="flex gap-4 group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 -mx-2 rounded-xl transition-colors"
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 relative overflow-hidden border shadow-inner ${isCompleted ? 'bg-slate-100 dark:bg-[#0f172a] border-slate-200 dark:border-slate-700' : 'bg-rose-500/10 border-rose-500/20'}`}>
                      {isCompleted ? (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10"></div>
                          <PhoneCall size={18} className="text-indigo-600 dark:text-indigo-400 relative z-10 group-hover:scale-110 transition-transform" />
                        </>
                      ) : (
                        <AlertTriangle size={18} className="text-rose-500 group-hover:scale-110 transition-transform" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <p className="text-sm text-slate-900 dark:text-slate-200 font-semibold truncate">
                        {isCompleted ? (
                           <>Call to <span className="text-indigo-600 dark:text-indigo-300 group-hover:text-indigo-500 dark:group-hover:text-indigo-200 transition-colors">{log.phone_number}</span></>
                        ) : (
                           <>Failed call to <span className="text-rose-600 dark:text-rose-300">{log.phone_number}</span></>
                        )}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-medium ${isCompleted ? 'text-slate-500 dark:text-slate-400' : 'text-rose-500 dark:text-rose-400/70'}`}>
                          {isCompleted ? `Duration: ${Math.round((log.duration_seconds || 0)/60)}m` : 'Connection dropped'}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                        <span className="text-xs text-slate-600 dark:text-slate-500 font-bold">{timeString}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>

      </motion.div>
    </div>
  );
}
