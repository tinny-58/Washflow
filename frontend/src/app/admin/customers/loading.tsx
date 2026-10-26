import React from "react";
import { Users, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export default function AdminCustomersLoading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="h-7 w-56 bg-white/10 rounded-lg mb-2" />
          <div className="h-4 w-96 bg-white/5 rounded-md" />
        </div>
        <div className="h-9 w-28 bg-white/10 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <GlassCard key={i} className="p-4 space-y-2">
            <div className="h-3 w-20 bg-white/10 rounded" />
            <div className="h-6 w-16 bg-white/20 rounded" />
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span className="text-xs">Loading customer directory...</span>
        </div>
      </GlassCard>
    </div>
  );
}
