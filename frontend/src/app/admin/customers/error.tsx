"use client";

import React, { useEffect } from "react";
import { AlertCircle, RefreshCw, Users } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export default function AdminCustomersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin Customers Segment Error:", error);
  }, [error]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-indigo-400" />
        <h1 className="text-xl sm:text-2xl font-black text-white">Customer Directory</h1>
      </div>

      <GlassCard className="p-8 text-center space-y-4 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-white">Unable to load customer directory</h2>
          <p className="text-xs text-slate-400">
            {error.message || "An unexpected error occurred while querying registered clients."}
          </p>
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-xs font-bold text-white transition shadow-lg shadow-indigo-500/20"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </GlassCard>
    </div>
  );
}
