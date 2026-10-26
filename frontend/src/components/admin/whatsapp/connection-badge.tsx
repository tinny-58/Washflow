import React from "react";
import { ShieldAlert, RefreshCw, AlertTriangle } from "lucide-react";

export interface ConnectionBadgeProps {
  status:
    | "connected"
    | "qr_ready"
    | "pairing"
    | "connecting"
    | "reconnecting"
    | "needs_repairing"
    | "blocked_suspected"
    | "disconnected"
    | "error"
    | string;
  circuitBreakerTripped?: boolean;
}

export function ConnectionBadge({ status, circuitBreakerTripped }: ConnectionBadgeProps) {
  if (circuitBreakerTripped) {
    return (
      <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
        <span>CIRCUIT BREAKER ACTIVE</span>
      </span>
    );
  }

  switch (status) {
    case "connected":
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>CONNECTED</span>
        </span>
      );
    case "qr_ready":
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>WAITING FOR QR SCAN</span>
        </span>
      );
    case "pairing":
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
          <span>PAIRING CODE ISSUED</span>
        </span>
      );
    case "connecting":
    case "reconnecting":
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />
          <span>STARTING...</span>
        </span>
      );
    case "needs_repairing":
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>NEEDS RE-PAIRING</span>
        </span>
      );
    case "blocked_suspected":
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span>BLOCKED/BANNED SUSPECTED</span>
        </span>
      );
    case "disconnected":
    default:
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-slate-500/20 text-slate-300 border border-slate-500/30 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span>WORKER OFFLINE</span>
        </span>
      );
  }
}
