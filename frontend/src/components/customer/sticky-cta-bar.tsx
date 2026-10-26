"use client";

import React from "react";
import { ArrowRight, ShoppingCart } from "lucide-react";

interface StickyCtaBarProps {
  total: number;
  itemCount: number;
  buttonText: string;
  onAction: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function StickyCtaBar({
  total,
  itemCount,
  buttonText,
  onAction,
  disabled = false,
  loading = false,
}: StickyCtaBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 backdrop-blur-2xl bg-slate-950/85 border-t border-white/15 shadow-2xl">
      <div className="max-w-md mx-auto flex items-center justify-between gap-4">
        {/* Left: Total summary */}
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShoppingCart className="w-3.5 h-3.5 text-sky-400" />
            <span>
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          </div>
          <div className="text-xl font-extrabold text-white tracking-tight">
            KES {total.toLocaleString()}
          </div>
        </div>

        {/* Right: Primary Large Action Button */}
        <button
          type="button"
          onClick={onAction}
          disabled={disabled || loading}
          className="flex-1 max-w-[200px] h-13 py-3 px-5 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-sky-500/30 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          {loading ? (
            <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <>
              <span>{buttonText}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
