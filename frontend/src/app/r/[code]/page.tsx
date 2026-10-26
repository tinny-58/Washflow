"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Waves,
  Truck,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  Gift,
  Star,
  Check,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export default function ReferralLandingPage() {
  const params = useParams();
  const router = useRouter();
  const rawCode = (params?.code as string) || "";
  const cleanCode = rawCode.trim().toUpperCase();

  const [tracked, setTracked] = useState<boolean>(false);
  const [isValidCode, setIsValidCode] = useState<boolean | null>(null);

  useEffect(() => {
    if (!cleanCode) return;

    // Track visit and set signed attribution cookie (first touch wins)
    fetch("/api/auth/referral/track-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: cleanCode }),
    })
      .then((res) => res.json())
      .then((data) => {
        setTracked(true);
        setIsValidCode(Boolean(data.valid));
      })
      .catch(() => {
        setTracked(true);
      });
  }, [cleanCode]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500/30">
      {/* Top Navbar */}
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20">
              <Waves className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-white">
              WashFlow
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 transition"
            >
              Sign In
            </Link>
            <Link
              href={`/login?mode=signup&ref=${encodeURIComponent(cleanCode)}`}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition flex items-center gap-1.5"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 sm:py-16 flex flex-col items-center justify-center text-center space-y-10">
        {/* Referral Invitation Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-pulse">
          <Gift className="w-4 h-4 text-emerald-400" />
          <span>You were invited to WashFlow with code:</span>
          <span className="font-mono font-extrabold text-white">{cleanCode}</span>
        </div>

        {/* Hero Title & 5-Second Pitch */}
        <div className="space-y-4 max-w-2xl">
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Premium Laundry & Dry Cleaning,{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 bg-clip-text text-transparent">
              Delivered to Your Door.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Schedule a pickup in under 60 seconds. We wash, dry, and neatly fold your clothes with express same-day or next-day turnaround. Starting at just <strong>KES 300</strong> per basket.
          </p>
        </div>

        {/* 3 Core Benefits (Under 5-Seconds) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
          <GlassCard className="p-5 bg-slate-900/70 border border-white/10 rounded-2xl space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Truck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white">Free Doorstep Pickup</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Our driver collects your laundry right from your doorstep or gate at your preferred time.
            </p>
          </GlassCard>

          <GlassCard className="p-5 bg-slate-900/70 border border-white/10 rounded-2xl space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white">Professional Care</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Washed with premium detergents, fabric-sorted, machine-dried, and neatly folded or hung.
            </p>
          </GlassCard>

          <GlassCard className="p-5 bg-slate-900/70 border border-white/10 rounded-2xl space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white">Verified M-Pesa Pay</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pay securely via verified M-Pesa upon inspection or delivery. Zero hidden charges.
            </p>
          </GlassCard>
        </div>

        {/* Primary Call to Action */}
        <div className="space-y-3 w-full max-w-md">
          <Link
            href={`/login?mode=signup&ref=${encodeURIComponent(cleanCode)}`}
            className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30 hover:scale-[1.02] active:scale-[0.98] transition"
          >
            <span>Claim Invite & Book Wash</span>
            <ArrowRight className="w-5 h-5" />
          </Link>

          <div className="flex items-center justify-center gap-6 text-[11px] text-slate-400 font-medium">
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Code automatically applied
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> No prepayment required
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} WashFlow Kenya. All rights reserved.</p>
      </footer>
    </div>
  );
}
