import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';
import { Download, Plus, Rocket, CreditCard, Users, Clock, AlertTriangle, Megaphone } from 'lucide-react';

const usageData = [
  { time: '08:00 AM', value: 400 },
  { time: '10:00 AM', value: 600 },
  { time: '12:00 PM', value: 500 },
  { time: '02:00 PM', value: 900 },
  { time: '04:00 PM', value: 800 },
  { time: '06:00 PM', value: 1200 }, // Peak
  { time: '08:00 PM', value: 950 },
  { time: '10:00 PM', value: 650 },
  { time: 'NOW', value: 600 },
];

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">System Overview</h1>
          <p className="text-slate-400">Monitoring 1,248 active AI instances across 4 global regions.</p>
        </div>
        <div className="flex gap-4">
          <button className="flex items-center gap-2 px-4 py-2 bg-transparent border border-slate-700 hover:border-slate-500 rounded-lg text-slate-300 font-medium transition-colors">
            <Download size={18} />
            Export Data
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition-colors shadow-lg shadow-indigo-500/20">
            <Plus size={18} />
            Launch New Campaign
          </button>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Active Channels Card */}
        <div className="col-span-1 md:col-span-4 bg-[#111827] border border-slate-800 rounded-2xl p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-6 relative z-10">
            <span className="text-xs font-bold text-indigo-400 tracking-wider">LIVE STATUS</span>
            <div className="flex items-center gap-2 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-semibold text-emerald-400">LIVE</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 relative z-10">Active Channels</h2>
          <div className="flex items-baseline gap-2 mb-8 relative z-10">
            <span className="text-6xl font-black text-white">482</span>
            <span className="text-slate-400 font-medium">concurrent calls</span>
          </div>
          <div className="relative z-10">
            <div className="flex justify-between text-xs text-slate-400 mb-2 font-medium">
              <span>System Capacity</span>
              <span className="text-white">74%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 w-[74%] rounded-full shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>
            </div>
          </div>
          {/* Decorative background element */}
          <div className="absolute -bottom-10 -right-10 opacity-10 group-hover:opacity-20 transition-opacity duration-500">
            <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
              <path d="M18 8V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2"></path><path d="M11 22v-4"></path><path d="M5 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-1"></path><circle cx="12" cy="14" r="4"></circle><path d="M12 10v2"></path>
            </svg>
          </div>
        </div>

        {/* Minutes Consumed Chart */}
        <div className="col-span-1 md:col-span-8 bg-[#111827] border border-slate-800 rounded-2xl p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="text-xs font-bold text-indigo-400 tracking-wider">USAGE TRENDS</span>
              <h2 className="text-2xl font-bold text-white">Minutes Consumed</h2>
            </div>
            <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
              <button className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-md">24H</button>
              <button className="px-3 py-1 text-xs font-semibold text-slate-400 hover:text-white">7D</button>
              <button className="px-3 py-1 text-xs font-semibold text-slate-400 hover:text-white">30D</button>
            </div>
          </div>
          <div className="h-48 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usageData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {usageData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.time === '06:00 PM' ? '#6366f1' : '#1e293b'} 
                      style={{
                        filter: entry.time === '06:00 PM' ? 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.4))' : 'none'
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between mt-4 px-2 text-[10px] font-bold text-slate-500 tracking-wider">
            <span>08:00 AM</span>
            <span>12:00 PM</span>
            <span>04:00 PM</span>
            <span>08:00 PM</span>
            <span>NOW</span>
          </div>
        </div>

        {/* Performance Rings */}
        <div className="col-span-1 md:col-span-4 bg-[#111827] border border-slate-800 rounded-2xl p-6">
          <span className="text-xs font-bold text-indigo-400 tracking-wider">SUCCESS ANALYTICS</span>
          <h2 className="text-2xl font-bold text-white mb-8">Performance</h2>
          <div className="flex justify-around items-center h-40">
            {/* Connect Ring */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                  <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="251.2" strokeDashoffset={251.2 * (1 - 0.90)} className="text-indigo-500 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" strokeLinecap="round" />
                </svg>
                <div className="absolute text-xl font-bold text-white">90%</div>
              </div>
              <span className="text-xs font-bold text-slate-400 tracking-wider">CONNECT</span>
            </div>
            {/* Convert Ring */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                  <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="251.2" strokeDashoffset={251.2 * (1 - 0.68)} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" strokeLinecap="round" />
                </svg>
                <div className="absolute text-xl font-bold text-white">68%</div>
              </div>
              <span className="text-xs font-bold text-slate-400 tracking-wider">CONVERT</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="col-span-1 md:col-span-4 bg-[#111827] border border-slate-800 rounded-2xl p-6">
          <span className="text-xs font-bold text-indigo-400 tracking-wider">OPERATIONS</span>
          <h2 className="text-2xl font-bold text-white mb-6">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4 h-48">
            <button className="flex flex-col items-center justify-center gap-3 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition-all group">
              <Rocket size={24} className="text-indigo-400 group-hover:text-indigo-300" />
              <span className="text-sm font-semibold text-slate-300 text-center leading-tight">Launch<br/>Campaign</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-3 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 rounded-xl transition-all group">
              <CreditCard size={24} className="text-emerald-400 group-hover:text-emerald-300" />
              <span className="text-sm font-semibold text-slate-300 text-center leading-tight">Add Credits</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-3 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 rounded-xl transition-all group">
              <Users size={24} className="text-amber-400 group-hover:text-amber-300" />
              <span className="text-sm font-semibold text-slate-300 text-center leading-tight">Team Access</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-3 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-blue-500/50 rounded-xl transition-all group">
              <Clock size={24} className="text-slate-400 group-hover:text-slate-300" />
              <span className="text-sm font-semibold text-slate-300 text-center leading-tight">View History</span>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="col-span-1 md:col-span-4 bg-[#111827] border border-slate-800 rounded-2xl p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">Recent Activity</h2>
            <button className="text-xs font-bold text-indigo-400 hover:text-indigo-300">View All</button>
          </div>
          <div className="flex-1 flex flex-col gap-6">
            {/* Activity Item 1 */}
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 relative overflow-hidden border border-slate-700">
                <div className="absolute inset-0 bg-blue-500/20"></div>
                <div className="w-full h-1 bg-blue-500 absolute top-1/2 -translate-y-1/2"></div>
              </div>
              <div>
                <p className="text-sm text-slate-300 font-medium">
                  <span className="text-indigo-400">AI Instance #42</span> completed a 12m call with Client A.
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span className="text-xs text-slate-500 font-semibold tracking-wider">2 MINUTES AGO</span>
                </div>
              </div>
            </div>
            
            {/* Activity Item 2 */}
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={16} className="text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-slate-300 font-medium">Low balance alert: Credits are below $50.00.</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500 font-semibold tracking-wider">45 MINUTES AGO</span>
                </div>
              </div>
            </div>

            {/* Activity Item 3 */}
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                <Megaphone size={16} className="text-slate-400" />
              </div>
              <div>
                <p className="text-sm text-slate-300 font-medium">Campaign <span className="text-indigo-400">'Summer Outreach'</span> paused by system.</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500 font-semibold tracking-wider">3 HOURS AGO</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
