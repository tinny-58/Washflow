"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { Sparkles, Waves, ArrowLeft, ShieldCheck, CheckCircle2 } from "lucide-react";
import { AuthCard } from "@/components/shared/auth-card";

export default function LoginPage() {
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if ((data.authenticated || data.success) && data.user) {
          if (data.user.role === "admin") {
            window.location.href = "/admin";
          } else if (data.user.role === "client") {
            window.location.href = "/client";
          }
        }
      })
      .catch(() => {});
  }, []);
  return (
    <div className="min-h-[100dvh] flex flex-col justify-center items-center px-4 py-8 max-w-lg mx-auto w-full space-y-6">
      {/* Back to Home Link */}
      <div className="w-full flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>

        <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>HTTPS Protected</span>
        </div>
      </div>

      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center mx-auto shadow-xl shadow-sky-500/25">
          <Waves className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Welcome to <span className="bg-gradient-to-r from-white via-sky-100 to-sky-400 bg-clip-text text-transparent">WashFlow</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto">
          Sign in with your username, or create an account with WhatsApp or Google.
        </p>
      </div>

      {/* Main Authentication Card */}
      <div className="w-full flex justify-center">
        <AuthCard />
      </div>

      {/* Security note */}
      <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp OTP Security
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" /> Instant Recognition
        </span>
      </div>
    </div>
  );
}
