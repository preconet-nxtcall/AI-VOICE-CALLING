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
    return <div className="text-slate-300 flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> Loading billing...</div>;
  }

  if (error) {
    return <div className="text-red-400">{error}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Billing</h1>
        <p className="text-slate-400">Subscription details and available plans.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-6">
          <h2 className="text-white text-xl font-semibold mb-4 flex items-center gap-2">
            <CreditCard size={18} className="text-indigo-400" /> Current Subscription
          </h2>
          <div className="text-slate-300 space-y-2">
            <p>Plan: <span className="text-white">{billing?.subscription?.plan?.name || 'N/A'}</span></p>
            <p>Status: <span className="text-white">{billing?.subscription?.status || 'N/A'}</span></p>
            <p>Price: <span className="text-white">{billing?.subscription?.plan?.currency} {billing?.subscription?.plan?.price}</span></p>
            <p className="flex items-center gap-2">
              <CalendarDays size={16} className="text-slate-400" />
              Days left: <span className="text-white">{billing?.days_left_in_cycle ?? 0}</span>
            </p>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-6">
          <h2 className="text-white text-xl font-semibold mb-4">Available Plans</h2>
          <div className="space-y-3">
            {(billing?.available_plans || []).map((plan) => (
              <div key={plan.id} className="border border-slate-700 rounded-lg p-3">
                <p className="text-white font-medium">{plan.name}</p>
                <p className="text-slate-400 text-sm">{plan.description || 'No description'}</p>
                <p className="text-indigo-400 text-sm mt-1">{plan.currency} {plan.price} / {plan.interval}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
