"use client";

import { useEffect } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // If it's a chunk load error (stale build cache or network timeout), auto-reload once
    if (
      error.name === "ChunkLoadError" ||
      error.message?.includes("Loading chunk") ||
      error.message?.includes("failed to fetch")
    ) {
      const hasReloaded = sessionStorage.getItem("chunk_reload_attempted");
      if (!hasReloaded) {
        sessionStorage.setItem("chunk_reload_attempted", "true");
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h2 className="text-xl font-bold text-white">Something went wrong</h2>
      <p className="text-xs text-slate-400 max-w-sm">
        {error.message?.includes("Loading chunk")
          ? "A resource update was detected. Please refresh the page."
          : "An unexpected error occurred while loading this page."}
      </p>
      <button
        type="button"
        onClick={() => {
          sessionStorage.removeItem("chunk_reload_attempted");
          window.location.reload();
        }}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-medium text-xs transition shadow-lg shadow-sky-500/20"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Reload Page</span>
      </button>
    </div>
  );
}
