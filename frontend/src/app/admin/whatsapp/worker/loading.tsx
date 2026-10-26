export default function WorkerLoading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 animate-pulse">
      <div className="h-20 bg-slate-800/40 rounded-2xl border border-white/5" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 h-96 bg-slate-800/30 rounded-2xl border border-white/5" />
        <div className="lg:col-span-5 h-96 bg-slate-800/30 rounded-2xl border border-white/5" />
      </div>
      <div className="h-64 bg-slate-800/20 rounded-2xl border border-white/5" />
    </div>
  );
}
