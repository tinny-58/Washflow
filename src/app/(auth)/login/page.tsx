"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Mail, Lock, KeyRound, ArrowRight, AlertCircle } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string>("admin@washflow.co.ke");
  const [password, setPassword] = useState<string>("WashFlow#Admin2026!Secure");
  const [totpCode, setTotpCode] = useState<string>("");
  const [requiresTotp, setRequiresTotp] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          totpCode: requiresTotp ? totpCode : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.requiresTotp) {
          setRequiresTotp(true);
          setErrorMessage("Please enter your 6-digit Authenticator code.");
        } else {
          setErrorMessage(data.error || "Authentication failed.");
        }
        setLoading(false);
        return;
      }

      // Success
      router.push("/admin");
    } catch {
      setErrorMessage("Network error during admin login.");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 max-w-sm mx-auto px-4 py-16 w-full flex flex-col justify-center space-y-6">
      <div className="text-center space-y-1.5">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center mx-auto shadow-lg shadow-sky-500/20">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Admin Operations</h1>
        <p className="text-xs text-slate-300">
          Sign in with your verified operational credentials
        </p>
      </div>

      <GlassCard>
        <form onSubmit={handleLogin} className="space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Admin Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@washflow.co.ke"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-400"
              />
            </div>
          </div>

          {requiresTotp && (
            <div>
              <label className="block text-xs font-medium text-amber-300 mb-1">
                Authenticator 2FA Code (6 Digits)
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-amber-400" />
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl glass-input text-sm text-white font-mono"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </GlassCard>
    </div>
  );
}
