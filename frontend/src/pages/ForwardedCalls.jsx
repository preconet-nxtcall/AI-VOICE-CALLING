import { PhoneForwarded } from 'lucide-react';

export default function ForwardedCalls() {
  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Forwarded Calls</h1>
        <p className="text-slate-500 dark:text-slate-400">Calls escalated from AI to human agents will appear here.</p>
      </div>

      <div className="bg-white dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-10 text-center">
        <PhoneForwarded className="mx-auto mb-3 text-indigo-500" size={28} />
        <p className="text-slate-700 dark:text-slate-300 font-medium">No forwarded calls yet.</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Start campaigns with handoff enabled to populate this feed.</p>
      </div>
    </div>
  );
}
