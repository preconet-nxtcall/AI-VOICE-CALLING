import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Search, Bell, HelpCircle, AlertTriangle, Sun, Moon, Menu } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Routes where the main content should be flush (no padding, no outer scroll)
const FLUSH_ROUTES = ['/chat'];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const menuRef = useRef(null);
  
  // Persist sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

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
    localStorage.clear();
    setMenuOpen(false);
    setShowLogoutConfirm(false);
    navigate('/login');
  };

  const isProfilePage = location.pathname === '/profile';
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden transition-colors duration-300">
      {!isProfilePage && <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />}
      
      <motion.div 
        layout
        initial={false}
        animate={{ 
          marginLeft: isProfilePage || isMobile ? 0 : (isSidebarCollapsed ? 80 : 260),
          paddingLeft: isMobile && !isProfilePage ? 0 : 0
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="flex-1 flex flex-col min-w-0"
      >
        {/* Top Navbar */}
        <header className="h-20 border-b border-slate-200 dark:border-slate-800/60 bg-white/80 dark:bg-[#0b1120]/80 backdrop-blur-xl z-30 flex items-center justify-between px-4 md:px-8 sticky top-0 transition-colors duration-300">
          <div className="flex items-center gap-3 w-full max-w-xs md:max-w-md">
            {isMobile && !isProfilePage && (
              <button 
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
              >
                <Menu size={20} />
              </button>
            )}
            <div className="flex items-center w-full bg-slate-100 dark:bg-[#1e293b]/50 rounded-xl border border-slate-200 dark:border-slate-700/50 px-3 md:px-4 py-2 md:py-2.5 text-slate-500 dark:text-slate-400 focus-within:border-indigo-500/50 focus-within:bg-white dark:focus-within:bg-[#1e293b]/80 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-inner">
              <Search size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <input 
                type="text" 
                placeholder={isMobile ? "Search..." : "Search analytics, campaigns, or logs... (Press '/Layer')"} 
                className="bg-transparent border-none outline-none w-full ml-2 md:ml-3 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:placeholder-slate-500 dark:focus:placeholder-slate-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all group">
              <Bell size={20} className="group-hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse"></span>
            </button>
            <button className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all group">
              <HelpCircle size={20} className="group-hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
            </button>
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all group"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800"></div>
            
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="flex items-center gap-3 p-1 pr-3 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all focus:outline-none"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-[2px]">
                  <img src="https://i.pravatar.cc/150?img=11" alt="User" className="w-full h-full object-cover rounded-full border-2 border-white dark:border-slate-900" />
                </div>
                <div className="hidden md:flex flex-col items-start text-left">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white leading-none mb-1">Admin</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-none">admin@preconet.in</span>
                </div>
              </button>
              
              {menuOpen && (
                <div className="absolute right-0 mt-3 w-48 bg-white dark:bg-[#1e293b] rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] py-2 border border-slate-200 dark:border-slate-700/50 z-50">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 mb-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">My Account</p>
                  </div>
                  <button 
                    onClick={() => {
                      setMenuOpen(false);
                      navigate('/profile');
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    Profile Settings
                  </button>
                  <div className="my-1 border-t border-slate-100 dark:border-slate-700/50"></div>
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowLogoutConfirm(true);
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        {/* Flush layout for routes that manage their own height (e.g. Chat) */}
        <main className={`flex-1 min-h-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-50 via-white to-slate-50 dark:bg-none dark:bg-gradient-to-br dark:from-[#0b1120] dark:via-[#0f172a] dark:to-[#0b1120] transition-colors duration-300 ${
          FLUSH_ROUTES.includes(location.pathname)
            ? 'overflow-hidden flex flex-col p-0'
            : 'overflow-y-auto p-8 custom-scrollbar'
        }`}>
          <Outlet />
        </main>
      </motion.div>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogoutConfirm(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-[#1e293b] border border-slate-700 rounded-3xl p-8 shadow-2xl z-10"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                  <AlertTriangle className="text-red-400" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Confirm Logout</h3>
                <p className="text-slate-400 mb-8 font-medium">Are you sure you want to log out of your account? You will need to sign in again to access your dashboard.</p>
                
                <div className="flex gap-4 w-full">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-white font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 rounded-2xl text-white font-semibold shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all"
                  >
                    Yes, Logout
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
