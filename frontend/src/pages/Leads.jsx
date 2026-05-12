import { Users } from 'lucide-react';

export default function Leads() {
  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Leads</h1>
        <p className="text-slate-500 dark:text-slate-400">Unified lead view with AI tags and call outcomes.</p>
      </div>

      <div className="bg-white dark:bg-[#111827]/80 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-10 text-center">
        <Users className="mx-auto mb-3 text-indigo-500" size={28} />
        <p className="text-slate-700 dark:text-slate-300 font-medium">No leads to display yet.</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Upload campaign CSVs and complete calls to see lead intelligence here.</p>
      </div>
    </div>
  );
}
