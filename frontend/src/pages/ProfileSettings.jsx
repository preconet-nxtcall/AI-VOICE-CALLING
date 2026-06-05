import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Shield, Bell, Save, Camera, CheckCircle, ChevronLeft } from 'lucide-react';
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

export default function ProfileSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: ''
  });

  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await api.get('/auth/me');
        const user = res.data.user;
        setProfile({
          name: user.full_name || '',
          email: user.email || '',
          phone: user.phone || ''
        });
      } catch (err) {
        console.error('Failed to fetch profile', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }, 1000);
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      alert("Passwords do not match!");
      return;
    }
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setPasswords({ current: '', new: '', confirm: '' });
      setTimeout(() => setSuccess(false), 3000);
    }, 1000);
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-4xl mx-auto flex flex-col gap-8 pb-10"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-1">Profile Settings</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Manage your account information and security preferences.</p>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-col gap-8">
        {/* Forms */}
        <motion.div variants={itemVariants} className="flex flex-col gap-8">
          
          {/* Personal Information */}
          <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-8 shadow-sm hover:shadow-md hover:border-indigo-500/20 dark:hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden group">
            {/* Accent colored line */}
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
            {/* Radial soft glow */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3 font-heading relative z-10">
              <User size={20} className="text-indigo-500" />
              Personal Information
            </h3>
            <form onSubmit={handleProfileUpdate} className="flex flex-col gap-6 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-1 font-heading">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={18} />
                    <input 
                      type="text" 
                      value={profile.name}
                      onChange={(e) => setProfile({...profile, name: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-1 font-heading">Phone Number</label>
                  <div className="relative">
                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={18} />
                    <input 
                      type="text" 
                      value={profile.phone}
                      onChange={(e) => setProfile({...profile, phone: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-1 font-heading">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={18} />
                  <input 
                    type="email" 
                    value={profile.email}
                    disabled
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-slate-500 dark:text-slate-400 cursor-not-allowed outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end mt-2">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                >
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Save size={18} />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>

          {/* Security / Password */}
          <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-8 shadow-sm hover:shadow-md hover:border-purple-500/20 dark:hover:border-purple-500/30 transition-all duration-300 relative overflow-hidden group">
            {/* Accent colored line */}
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-purple-500"></div>
            {/* Radial soft glow */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3 font-heading relative z-10">
              <Lock size={20} className="text-purple-500" />
              Security & Password
            </h3>
            <form onSubmit={handlePasswordUpdate} className="flex flex-col gap-6 relative z-10">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-1 font-heading">Current Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={18} />
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={passwords.current}
                    onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-1 font-heading">New Password</label>
                  <div className="relative">
                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={18} />
                    <input 
                      type="password" 
                      placeholder="••••••••"
                      value={passwords.new}
                      onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-1 font-heading">Confirm New Password</label>
                  <div className="relative">
                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={18} />
                    <input 
                      type="password" 
                      placeholder="••••••••"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-2">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex items-center gap-2 px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50"
                >
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Save size={18} />}
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>

      {/* Success Toast */}
      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 bg-emerald-500 text-slate-900 dark:text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50 border border-emerald-400"
          >
            <CheckCircle size={24} />
            <span className="font-bold">Settings updated successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
