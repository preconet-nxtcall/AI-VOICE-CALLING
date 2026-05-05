import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Search, Bell, HelpCircle } from 'lucide-react';
import { useState } from 'react';

export default function Layout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 font-sans">
      <Sidebar />
      
      <div className="flex-1 flex flex-col ml-64 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-800 bg-[#0f172a]/95 backdrop-blur z-10 flex items-center justify-between px-8">
          <div className="flex items-center w-96 bg-slate-900 rounded-lg border border-slate-800 px-3 py-2 text-slate-400 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search analytics..." 
              className="bg-transparent border-none outline-none w-full ml-2 text-sm text-slate-200 placeholder-slate-500"
            />
          </div>

          <div className="flex items-center gap-6">
            <button className="text-slate-400 hover:text-slate-200 transition-colors relative">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-indigo-500 rounded-full"></span>
            </button>
            <button className="text-slate-400 hover:text-slate-200 transition-colors">
              <HelpCircle size={20} />
            </button>
            <div className="w-px h-6 bg-slate-800"></div>
            <button className="text-sm font-medium text-indigo-400 hover:text-indigo-300">Support</button>
            <div className="relative">
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-slate-700 border-2 border-slate-600 overflow-hidden"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                <img src="https://i.pravatar.cc/150?img=11" alt="User" className="w-full h-full object-cover" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-32 bg-slate-800 rounded-md shadow-lg py-1 border border-slate-700">
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700"
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
        <main className="flex-1 overflow-y-auto p-8 bg-gradient-to-br from-[#0f172a] to-[#0b1120]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
