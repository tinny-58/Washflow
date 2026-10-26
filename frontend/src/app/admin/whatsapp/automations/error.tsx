"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function AutomationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto my-12 p-6 rounded-3xl bg-slate-900 border border-rose-500/30 text-center space-y-4 shadow-xl">
      <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
        <AlertCircle className="w-6 h-6" />
      </div>
      <div>
        <h3 className="text-base font-bold text-white">Automations Error</h3>
        <p className="text-xs text-rose-300/80 mt-1">
          {error.message || "Failed to load WhatsApp automation templates."}
        </p>
      </div>
      <button
        onClick={() => reset()}
        className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition inline-flex items-center gap-2 shadow"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Retry</span>
      </button>
    </div>
  );
}
