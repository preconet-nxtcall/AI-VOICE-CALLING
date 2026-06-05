import { useEffect, useState } from 'react';
import { CreditCard, CalendarDays, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBilling = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get('/billing/summary');
        setBilling(res.data.billing);
      } catch (err) {
        setError(err?.response?.data?.error || 'Failed to load billing data.');
      } finally {
        setLoading(false);
      }
    };
    fetchBilling();
  }, []);

  if (loading) {
    return <div className="text-slate-700 dark:text-slate-300 flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> Loading billing...</div>;
  }

  if (error) {
    return <div className="text-red-600 dark:text-red-400">{error}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Billing</h1>
        <p className="text-slate-500 dark:text-slate-400">Subscription details and available plans.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-8 shadow-sm hover:shadow-md hover:border-emerald-500/20 dark:hover:border-emerald-500/30 transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-emerald-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

          <div className="relative z-10">
            <h2 className="text-slate-900 dark:text-white text-xl font-bold mb-6 flex items-center gap-3 font-heading">
              <CreditCard size={20} className="text-emerald-500 dark:text-emerald-400" /> Current Subscription
            </h2>
            <div className="text-slate-600 dark:text-slate-350 space-y-3 font-medium text-sm">
              <p>Plan: <span className="text-slate-900 dark:text-white font-bold">{billing?.subscription?.plan?.name || 'N/A'}</span></p>
              <p>Status: <span className="text-slate-900 dark:text-white font-bold uppercase text-xs tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">{billing?.subscription?.status || 'N/A'}</span></p>
              <p>Price: <span className="text-slate-900 dark:text-white font-bold">{billing?.subscription?.plan?.currency} {billing?.subscription?.plan?.price}</span></p>
              <p className="flex items-center gap-2">
                <CalendarDays size={16} className="text-slate-500 dark:text-slate-400" />
                Days left: <span className="text-slate-900 dark:text-white font-bold">{billing?.days_left_in_cycle ?? 0}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-8 shadow-sm hover:shadow-md hover:border-indigo-500/20 dark:hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
          {/* Accent colored line */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
          {/* Radial soft glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

          <div className="relative z-10">
            <h2 className="text-slate-900 dark:text-white text-xl font-bold mb-6 font-heading">Available Plans</h2>
            <div className="space-y-4">
              {(billing?.available_plans || []).map((plan) => (
                <div key={plan.id} className="border border-slate-200/60 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl p-4 transition-all hover:bg-slate-100/50 dark:hover:bg-slate-850/25">
                  <p className="text-slate-900 dark:text-white font-bold font-heading">{plan.name}</p>
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 font-medium">{plan.description || 'No description'}</p>
                  <p className="text-indigo-600 dark:text-indigo-400 font-bold text-sm mt-2">{plan.currency} {plan.price} / {plan.interval}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
