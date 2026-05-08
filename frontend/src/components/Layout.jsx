import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Search, Bell, HelpCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export default function Layout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  
  // Persist sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Keyboard shortcut to toggle sidebar (Ctrl+B / Cmd+B)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleLogout = () => {
    localStorage.clear(); // Clear all data (token, sidebar state, etc.) for a clean logout
    setMenuOpen(false);
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 font-sans overflow-hidden">
      <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />
      
      <motion.div 
        layout
        initial={false}
        animate={{ marginLeft: isSidebarCollapsed ? 80 : 260 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="flex-1 flex flex-col min-w-0"
      >
        {/* Top Navbar */}
        <header className="h-20 border-b border-slate-800/60 bg-[#0b1120]/80 backdrop-blur-xl z-30 flex items-center justify-between px-8 sticky top-0">
          <div className="flex items-center w-full max-w-md bg-[#1e293b]/50 rounded-xl border border-slate-700/50 px-4 py-2.5 text-slate-400 focus-within:border-indigo-500/50 focus-within:bg-[#1e293b]/80 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-inner">
            <Search size={18} className="text-indigo-400" />
            <input 
              type="text" 
              placeholder="Search analytics, campaigns, or logs... (Press '/')" 
              className="bg-transparent border-none outline-none w-full ml-3 text-sm text-slate-200 placeholder-slate-500 focus:placeholder-slate-400"
            />
          </div>

          <div className="flex items-center gap-6">
            <button className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all group">
              <Bell size={20} className="group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse"></span>
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all group">
              <HelpCircle size={20} className="group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
            </button>
            <div className="w-px h-6 bg-slate-800"></div>
            
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="flex items-center gap-3 p-1 pr-3 rounded-full bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800 transition-all focus:outline-none"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-[2px]">
                  <img src="https://i.pravatar.cc/150?img=11" alt="User" className="w-full h-full object-cover rounded-full border-2 border-slate-900" />
                </div>
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-semibold text-white leading-none mb-1">Admin</span>
                  <span className="text-[10px] text-slate-400 font-medium leading-none">admin@preconet.in</span>
                </div>
              </button>
              
              {menuOpen && (
                <div className="absolute right-0 mt-3 w-48 bg-[#1e293b] rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] py-2 border border-slate-700/50 z-50">
                  <div className="px-4 py-2 border-b border-slate-700/50 mb-2">
                    <p className="text-sm font-semibold text-white">My Account</p>
                  </div>
                  <button className="block w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors">
                    Profile Settings
                  </button>
                  <button className="block w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors">
                    Billing
                  </button>
                  <div className="my-1 border-t border-slate-700/50"></div>
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-gradient-to-br from-[#0b1120] via-[#0f172a] to-[#0b1120] custom-scrollbar">
          <Outlet />
        </main>
      </motion.div>
    </div>
  );
}
