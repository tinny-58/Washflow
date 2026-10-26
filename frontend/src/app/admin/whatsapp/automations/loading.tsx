export default function AutomationsLoading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 animate-pulse">
      <div className="h-12 bg-slate-800/40 rounded-2xl" />
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-slate-800/30 rounded-2xl border border-white/5" />
        ))}
      </div>
    </div>
  );
}
