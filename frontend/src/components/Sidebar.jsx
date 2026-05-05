import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Rocket, BookOpen, BarChart2, CreditCard, PhoneCall } from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Knowledge Base', icon: BookOpen, path: '/knowledge' },
    { name: 'AI Chat', icon: Rocket, path: '/chat' },
    { name: 'Campaigns', icon: BarChart2, path: '/campaigns' },
    { name: 'Call Logs', icon: PhoneCall, path: '/logs' },
    { name: 'Billing', icon: CreditCard, path: '/billing' },
  ];

  const NavLink = ({ item }) => {
    const isActive = location.pathname === item.path || (location.pathname === '/' && item.path === '/dashboard');
    return (
      <Link
        to={item.path}
        className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md transition-colors ${
          isActive 
            ? 'bg-indigo-900/40 text-indigo-400 border-l-2 border-indigo-500' 
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
        }`}
      >
        <item.icon size={18} />
        <span className="text-sm font-medium">{item.name}</span>
      </Link>
    );
  };

  return (
    <div className="w-64 h-screen bg-[#0b1120] border-r border-slate-800 flex flex-col fixed left-0 top-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
          <BarChart2 className="text-white" size={18} />
        </div>
        <div>
          <h1 className="text-white font-bold text-lg tracking-tight">AINxt.call</h1>
          <p className="text-xs text-slate-500 font-semibold tracking-wider">ENTERPRISE TIER</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink key={item.name} item={item} />
        ))}
      </div>
    </div>
  );
}
