import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, BarChart2, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const emailRef = useRef(null);

  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = [
    { src: '/login_hero.png', alt: 'AINXT Call Metrics Visualizer' },
    { src: '/login_hero_2.png', alt: 'AINXT Call Wave Visualizer' }
  ];

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoading) return; // prevent double-submit
    setError('');
    setIsLoading(true);
    try {
      const response = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      const { access_token, refresh_token } = response?.data || {};
      if (!access_token) throw new Error('Access token missing in login response');
      localStorage.setItem('token', access_token);
      if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error;
      setError(msg || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-slate-50 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden relative font-sans">
      {/* Background Decorative Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Left Pane: Form (Col Span 5 / 12) */}
      <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10 h-full relative z-10 bg-white overflow-y-auto">
        <div className="w-full max-w-sm flex flex-col gap-6">
          
          {/* Logo and Greeting */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">
              <BarChart2 className="text-white" size={20} />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight font-heading leading-none">Welcome back</h1>
            <p className="text-slate-500 text-xs mt-2 font-semibold">Enter your credentials to manage your voice platform.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3" role="alert">
                <p className="text-red-600 text-xs text-center font-semibold">{error}</p>
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest font-heading">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail size={16} className="text-slate-400" />
                </div>
                <input
                  id="login-email"
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 !pl-11 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-semibold text-xs"
                  placeholder="admin@enterprise.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest font-heading">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-[10px] font-extrabold text-indigo-600 hover:underline transition-colors font-heading tracking-widest uppercase"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock size={16} className="text-slate-400" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 !pl-11 !pr-10 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-semibold text-xs"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl py-3 font-bold transition-all shadow-lg shadow-indigo-500/10 flex items-center justify-center gap-2 group mt-4 cursor-pointer text-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In to Dashboard
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="text-center lg:text-left text-xs text-slate-500 mt-1 font-medium">
            Don't have an account?{' '}
            <Link to="/register" className="font-extrabold text-indigo-600 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>

      {/* Right Pane: Hero Details (Col Span 7 / 12, hidden below lg) */}
      <div className="hidden lg:flex lg:col-span-7 bg-slate-50 border-l border-slate-200 relative overflow-hidden flex-col justify-between p-10 select-none h-full">
        {/* Soft Background Gradients */}
        <div className="absolute top-[-20%] right-[-20%] w-[60%] h-[60%] bg-indigo-50/60 rounded-full blur-[140px] pointer-events-none z-0" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-50/50 rounded-full blur-[120px] pointer-events-none z-0" />

        {/* Small Brand Header */}
        <div className="flex items-center gap-2 relative z-10">
          <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BarChart2 className="text-white" size={16} />
          </div>
          <span className="text-slate-900 font-bold tracking-tight text-md font-heading">AINXT.call</span>
          <span className="text-[9px] uppercase tracking-widest font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">Enterprise</span>
        </div>

        {/* Hero Visual Block */}
        <div className="relative flex flex-col items-center justify-center my-auto py-2 z-10">
          {/* Mockup Frame with increased width and modern shadow */}
          <div className="relative bg-white border border-slate-200 p-2.5 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.06)] w-full max-w-[460px] overflow-hidden group transition-all duration-700 hover:scale-[1.01] hover:border-slate-300">
            <div className="relative w-full h-[220px] overflow-hidden rounded-xl bg-slate-100">
              {slides.map((slide, idx) => (
                <img
                  key={idx}
                  src={slide.src}
                  alt={slide.alt}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
                    currentSlide === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                />
              ))}
            </div>
            
            {/* Slide Indicators / Dots */}
            <div className="flex justify-center gap-1.5 mt-2">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    currentSlide === idx ? 'w-4 bg-indigo-600' : 'w-1.5 bg-slate-300'
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Informative Feature Highlights */}
        <div className="flex flex-col gap-4 relative z-10 max-w-xl">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 font-heading tracking-tight mb-2 leading-tight">Next-Gen Outbound AI Voice Agent Platform</h2>
            <p className="text-slate-500 text-xs font-semibold leading-relaxed">
              Automate customer engagement, qualify outbound leads, and coordinate interactive support dials using real-time, highly natural-sounding AI agents.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-heading">Script Automation</span>
              <span className="text-slate-600 text-[11px] leading-normal font-semibold">Configure welcome messages, rules, languages, and custom AI behaviors.</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-heading">Real-Time Dashboards</span>
              <span className="text-slate-600 text-[11px] leading-normal font-semibold">Track active call concurrency, retry queues, and agent conversion statuses.</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-heading">Integrated Assets</span>
              <span className="text-slate-600 text-[11px] leading-normal font-semibold">Bind documentation knowledge folders directly to AI agent prompt memory.</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-heading">VoiceLink DID Dialing</span>
              <span className="text-slate-600 text-[11px] leading-normal font-semibold">Manage outbound caller IDs, retry intervals, and dialing speed concurrency bounds.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
