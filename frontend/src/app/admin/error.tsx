"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function AdminErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin view error caught by boundary:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center p-8 rounded-3xl bg-slate-900/60 border border-white/10 text-center space-y-4 my-8">
      <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
        <AlertCircle className="w-6 h-6" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-white">An error occurred in this view</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
          {error.message || "Unable to display this operational module. Other admin sections remain fully active."}
        </p>
      </div>
      <button
        onClick={() => reset()}
        className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition inline-flex items-center gap-2 shadow-lg shadow-sky-500/25"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Try Again</span>
      </button>
    </div>
  );
}
