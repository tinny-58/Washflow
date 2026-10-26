"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Users,
  UserCheck,
  Activity,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Clock,
  Sparkles,
  ChevronLeft,
  Lock,
  Layers,
  CheckCircle2,
  Share2,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

interface TrafficMetrics {
  kpis: {
    registeredCustomers: number;
    newCustomersToday: number;
    newCustomers7d: number;
    newCustomers30d: number;
    activeNow: number;
    dau: number;
    wau: number;
    mau: number;
    returningRate: number;
  };
  funnel: {
    visited: number;
    signup_started: number;
    otp_sent: number;
    otp_verified: number;
    account_created: number;
    first_booking: number;
    first_paid_delivery: number;
  };
  acquisition: {
    channels: Array<{ name: string; count: number }>;
    referralInvites: number;
  };
}

export default function AdminTrafficPage() {
  const [data, setData] = useState<TrafficMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTraffic = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/customers/traffic");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load traffic metrics:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTraffic();
  }, [fetchTraffic]);

  const funnelSteps = data?.funnel
    ? [
        { label: "1. Site Visitors", count: data.funnel.visited, color: "text-sky-400", bg: "bg-sky-500" },
        { label: "2. Signup Initiated", count: data.funnel.signup_started, color: "text-indigo-400", bg: "bg-indigo-500" },
        { label: "3. OTP Sent", count: data.funnel.otp_sent, color: "text-purple-400", bg: "bg-purple-500" },
        { label: "4. OTP Verified", count: data.funnel.otp_verified, color: "text-pink-400", bg: "bg-pink-500" },
        { label: "5. Verified Client", count: data.funnel.account_created, color: "text-emerald-400", bg: "bg-emerald-500" },
        { label: "6. First Booking", count: data.funnel.first_booking, color: "text-amber-400", bg: "bg-amber-500" },
      ]
    : [];

  const maxFunnelCount = funnelSteps.length > 0 ? Math.max(...funnelSteps.map((s) => s.count), 1) : 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/customers"
              className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition"
              title="Back to Customer Directory"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Traffic & Funnel Tracking
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            First-party privacy-preserving funnel analytics, visitor conversion, and acquisition channels.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Kenya DPA 2019 Compliant</span>
          </div>

          <button
            onClick={fetchTraffic}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GlassCard className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Active Now (Past 5m)</span>
          </div>
          <div className="text-2xl font-black text-emerald-400">
            {data?.kpis.activeNow ?? "—"}
          </div>
          <div className="text-[10px] text-slate-500">Live authenticated sessions</div>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Daily Active Users (DAU)</span>
          </div>
          <div className="text-2xl font-black text-white">
            {data?.kpis.dau ?? "—"}
          </div>
          <div className="text-[10px] text-slate-500">
            WAU: {data?.kpis.wau ?? 0} • MAU: {data?.kpis.mau ?? 0}
          </div>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-sky-400" />
            <span>New Signups (30d)</span>
          </div>
          <div className="text-2xl font-black text-sky-400">
            +{data?.kpis.newCustomers30d ?? "—"}
          </div>
          <div className="text-[10px] text-slate-500">
            Today: +{data?.kpis.newCustomersToday ?? 0} • 7d: +{data?.kpis.newCustomers7d ?? 0}
          </div>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Repeat Customer Rate</span>
          </div>
          <div className="text-2xl font-black text-amber-300">
            {data?.kpis.returningRate !== undefined ? `${data.kpis.returningRate}%` : "—"}
          </div>
          <div className="text-[10px] text-slate-500">Clients with &gt;1 completed booking</div>
        </GlassCard>
      </div>

      {/* Conversion Funnel Section */}
      <GlassCard className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/10">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Client Onboarding & Conversion Funnel (30-Day Window)</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Tracks visitor progression from first landing to authenticated client and service order.
            </p>
          </div>
          <span className="text-[10px] text-slate-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/5 self-start sm:self-auto">
            Zero Raw IP Logging • Salted Visitor Hashes
          </span>
        </div>

        <div className="space-y-4">
          {funnelSteps.map((step, idx) => {
            const pctOfTop = Math.round((step.count / maxFunnelCount) * 100);
            const prevStep = idx > 0 ? funnelSteps[idx - 1] : null;
            const stepConversion = prevStep && prevStep.count > 0 ? Math.round((step.count / prevStep.count) * 100) : null;

            return (
              <div key={step.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{step.label}</span>
                    {stepConversion !== null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-mono">
                        {stepConversion}% from step {idx}
                      </span>
                    )}
                  </div>
                  <div className="font-mono font-bold text-white">
                    {step.count.toLocaleString()}
                  </div>
                </div>

                {/* Funnel Progress Bar */}
                <div className="h-3 w-full rounded-full bg-white/5 overflow-hidden border border-white/5">
                  <div
                    className={`h-full rounded-full ${step.bg} transition-all duration-500`}
                    style={{ width: `${Math.max(pctOfTop, 3)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Acquisition Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Auth Channels */}
        <GlassCard className="p-5 space-y-4">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-400" />
            <span>Signup Authentication Channels</span>
          </h3>
          <div className="space-y-3 text-xs">
            {data?.acquisition.channels.map((ch) => (
              <div key={ch.name} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{ch.name}</div>
                  <div className="text-[10px] text-slate-400">Primary client credential flow</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sky-300 font-mono">{ch.count}</div>
                  <div className="text-[10px] text-slate-500">
                    {data.kpis.registeredCustomers > 0
                      ? `${Math.round((ch.count / data.kpis.registeredCustomers) * 100)}%`
                      : "0%"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Viral Referral Loop */}
        <GlassCard className="p-5 space-y-4">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <Share2 className="w-4 h-4 text-amber-400" />
            <span>Organic & Referral Invitations</span>
          </h3>
          <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Signups via Client Referral Code:</span>
              <span className="font-bold text-amber-300 font-mono text-sm">
                {data?.acquisition.referralInvites ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Direct / Organic Signups:</span>
              <span className="font-bold text-white font-mono text-sm">
                {(data?.kpis.registeredCustomers ?? 0) - (data?.acquisition.referralInvites ?? 0)}
              </span>
            </div>
            <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400 leading-relaxed">
              When clients share their unique invite links, both parties earn reward points toward free laundry washes upon the referee&apos;s first completed delivery.
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Kenya DPA Compliance Notice */}
      <GlassCard className="p-5 border-emerald-500/20 bg-emerald-950/10 space-y-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <Lock className="w-4 h-4" />
          <h4 className="text-xs font-bold uppercase tracking-wider">
            Kenya Data Protection Act 2019 Compliance Architecture
          </h4>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          In strict compliance with statutory Kenyan privacy principles (Section 31 Principles of Data Protection):
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-300">
          <div className="p-2.5 rounded-lg bg-black/20 border border-emerald-500/20 space-y-1">
            <strong className="text-emerald-300 block">Daily Salted Hashing</strong>
            <span>
              Unauthenticated visitor identifiers are generated using SHA-256 with a rotating daily cryptographic salt. Raw IP addresses are discarded instantly and never written to disk.
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-black/20 border border-emerald-500/20 space-y-1">
            <strong className="text-emerald-300 block">Single-Source Directory</strong>
            <span>
              The customer directory is an authoritative read-model over verified client accounts (<code className="text-white">role=&apos;user&apos;</code>). Incomplete OTP attempts are purged after verification expires.
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-black/20 border border-emerald-500/20 space-y-1">
            <strong className="text-emerald-300 block">Automated Purging</strong>
            <span>
              Traffic rollups older than 90 days are purged automatically. Customer phone numbers remain masked in the UI and can only be revealed via audited administrative action.
            </span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
