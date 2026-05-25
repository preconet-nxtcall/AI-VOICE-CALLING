import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, BarChart2 } from 'lucide-react';
import api from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setError('');
    try {
      const response = await api.post('/auth/forgot-password', { email });
      setMessage(response.data.message || 'If an account exists, a new password has been sent.');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="w-full max-w-md">
        <div className="bg-[#111827] border border-slate-800 rounded-3xl shadow-2xl p-8 relative z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
              <BarChart2 className="text-white" size={24} />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Reset Password</h1>
            <p className="text-slate-400 text-sm mt-2 text-center">
              Enter your email address and we'll send you a new random password.
            </p>
          </div>

          {message ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-6">
              <p className="text-emerald-400 text-sm text-center">{message}</p>
              <Link 
                to="/login" 
                className="flex items-center justify-center gap-2 text-indigo-400 hover:text-indigo-300 font-semibold mt-4 text-sm"
              >
                <ArrowLeft size={16} /> Back to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <p className="text-red-400 text-xs text-center">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail size={18} className="text-slate-400" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    placeholder="admin@enterprise.com"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl py-3 font-semibold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 mt-6"
              >
                {isLoading ? 'Sending...' : 'Send New Password'}
              </button>

              <Link 
                to="/login" 
                className="flex items-center justify-center gap-2 text-slate-400 hover:text-slate-300 text-sm mt-4 transition-colors"
              >
                <ArrowLeft size={16} /> Back to Sign In
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
