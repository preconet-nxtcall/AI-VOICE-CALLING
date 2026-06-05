import { Users } from 'lucide-react';

export default function Leads() {
  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Leads</h1>
        <p className="text-slate-500 dark:text-slate-400">Unified lead view with AI tags and call outcomes.</p>
      </div>

      <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/50 rounded-3xl p-12 text-center shadow-sm relative overflow-hidden group">
        {/* Accent colored line */}
        <div className="absolute top-0 left-0 right-0 h-[4px] bg-indigo-500"></div>
        {/* Radial soft glow */}
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none"></div>

        <div className="relative z-10">
          <Users className="mx-auto mb-4 text-indigo-500" size={36} />
          <p className="text-slate-900 dark:text-white font-bold text-lg font-heading">No leads to display yet.</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto font-medium">Upload campaign CSVs and complete calls to see lead intelligence here.</p>
        </div>
      </div>
    </div>
  );
}
