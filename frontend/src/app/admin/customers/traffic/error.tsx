"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, TrendingUp, ChevronLeft } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export default function AdminTrafficError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin Traffic Segment Error:", error);
  }, [error]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-indigo-400" />
        <h1 className="text-xl sm:text-2xl font-black text-white">Traffic & Funnel Tracking</h1>
      </div>

      <GlassCard className="p-8 text-center space-y-4 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-white">Unable to load traffic metrics</h2>
          <p className="text-xs text-slate-400">
            {error.message || "An unexpected error occurred while querying traffic rollups."}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Link
            href="/admin/customers"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Customer Directory</span>
          </Link>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-xs font-bold text-white transition shadow-lg shadow-indigo-500/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
