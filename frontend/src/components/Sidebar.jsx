import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Rocket, BookOpen, BarChart2, CreditCard, PhoneCall, User, ChevronLeft } from 'lucide-react';

export default function Sidebar({ isCollapsed, setIsCollapsed }) {
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Knowledge Base', icon: BookOpen, path: '/knowledge' },
    { name: 'AI Chat', icon: Rocket, path: '/chat' },
    { name: 'Campaigns', icon: BarChart2, path: '/campaigns' },
    { name: 'Call Logs', icon: PhoneCall, path: '/logs' },
    { name: 'Billing', icon: CreditCard, path: '/billing' },
  ];

  // Auto collapse on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [setIsCollapsed]);

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  const NavLink = ({ item }) => {
    const isActive = location.pathname === item.path || (location.pathname === '/' && item.path === '/dashboard');
    const [isHovered, setIsHovered] = useState(false);

    return (
      <Link
        to={item.path}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          if (window.innerWidth < 768) {
            setIsCollapsed(true);
          }
        }}
        className={`relative flex items-center gap-3 px-4 py-3 mx-3 my-1 rounded-xl transition-all duration-300 group ${
          isActive 
            ? 'bg-indigo-600/10 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 neon-glow border border-indigo-500/30' 
            : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
        }`}
      >
        {/* Active Indicator Glow */}
        {isActive && (
          <motion.div
            layoutId="active-indicator"
            className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.8)]"
            initial={false}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
        
        <div className={`relative flex items-center justify-center transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'} ${isCollapsed ? 'mx-auto' : ''}`}>
          <item.icon size={20} className={isActive ? 'drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]' : ''} />
        </div>

        <AnimatePresence>
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="text-sm font-medium whitespace-nowrap overflow-hidden"
            >
              {item.name}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Floating Tooltip for collapsed state */}
        <AnimatePresence>
          {isCollapsed && isHovered && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 20 }}
              exit={{ opacity: 0, x: 10 }}
              className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-semibold text-slate-900 dark:text-slate-200 shadow-xl z-50 whitespace-nowrap"
            >
              {item.name}
            </motion.div>
          )}
        </AnimatePresence>
      </Link>
    );
  };

  return (
    <motion.div 
      initial={false}
      animate={{ 
        width: isCollapsed ? (window.innerWidth < 768 ? 0 : 80) : 260,
        x: isCollapsed && window.innerWidth < 768 ? -80 : 0
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-screen dark:bg-[#0b1120] dark:border-slate-800 flex flex-col fixed left-0 top-0 z-40 shadow-sm dark:shadow-2xl overflow-hidden border-r" style={{backgroundColor: '#FFFFFF', borderColor: '#E2E8F0'}}
    >
      <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center px-4' : 'justify-between'} transition-all duration-300 h-20`}>
        <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'justify-center w-full' : ''}`}>
          <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.5)] shrink-0">
            <BarChart2 className="text-white" size={18} />
          </div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="whitespace-nowrap"
              >
                <h1 className="text-slate-900 dark:text-white font-bold text-lg tracking-tight">AINXT.call</h1>
                <p className="text-[10px] text-slate-500 font-semibold tracking-widest uppercase">Enterprise</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3.5 top-24 w-7 h-7 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 hover:shadow-lg transition-all z-50 focus:outline-none"
      >
        <motion.div
          animate={{ rotate: isCollapsed ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ChevronLeft size={16} />
        </motion.div>
      </button>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 flex flex-col gap-1 custom-scrollbar">
        {navItems.map((item) => (
          <NavLink key={item.name} item={item} />
        ))}
      </div>
    </motion.div>
  );
}
