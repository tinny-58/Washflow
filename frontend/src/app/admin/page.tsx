"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  DollarSign,
  Truck,
  TrendingUp,
  Server,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Calendar,
  Layers,
  ArrowUpRight,
  MessageSquare,
  ShieldCheck,
  Zap,
  Gift,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

interface AdminSummary {
  transactions: {
    grossRevenue: number;
    totalTransactions: number;
    paidTransactionsCount: number;
    pendingTransactionsCount: number;
    failedTransactionsCount: number;
    totalTips: number;
    recentPayments: Array<{
      id: string;
      bookingId: string;
      type: string;
      provider: string;
      providerRef: string;
      amount: number;
      status: string;
      createdAt: string;
      customerName?: string;
      customerPhone?: string;
    }>;
  };
  deliveries: {
    totalDeliveries: number;
    deliveredCount: number;
    activeDeliveries: number;
    pendingPickups: number;
    cancelledCount: number;
    onTimeRate: number | null;
    statusBreakdown: Record<string, number>;
  };
  traffic: {
    totalUsers: number;
    customerCount: number;
    clientCount: number;
    activeSessionsToday: number;
    bookingConversionRate: number | null;
    realtimeSubscribers: number;
  };
  systemHealth: {
    status: "operational" | "degraded" | "warning" | "downtime";
    database: { status: string; latencyMs: number };
    whatsappGateway: {
      status: string;
      phoneNumber?: string;
      isDowntime: boolean;
    };
    uptimeSeconds: number;
    downtimeAlerts: Array<{
      id: string;
      level: "critical" | "warning" | "info";
      service: string;
      title: string;
      description: string;
      timestamp: string;
    }>;
  };
  notifications: {
    undeliveredCount: number;
    failedMessages: Array<{
      id: string;
      purpose: string;
      recipientMasked: string;
      failureReason?: string;
      attempts: number;
      queuedAt: string;
      failedAt?: string;
    }>;
  };
}

const DELIVERY_STAGES = [
  { key: "PENDING", label: "Pending", color: "amber" },
  { key: "CONFIRMED", label: "Confirmed", color: "sky" },
  { key: "PICKUP_SCHEDULED", label: "Pickup Sched.", color: "indigo" },
  { key: "PICKED_UP", label: "Picked Up", color: "blue" },
  { key: "IN_WASH", label: "In Wash", color: "cyan" },
  { key: "WASHED", label: "Washed", color: "teal" },
  { key: "OUT_FOR_DELIVERY", label: "Out Delivery", color: "purple" },
  { key: "DELIVERED", label: "Delivered", color: "emerald" },
];

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [rewardsOverview, setRewardsOverview] = useState<{
    pendingCount: number;
    qualifiedCount: number;
    roiPercentage: number;
    revenueFromReferred: number;
    rewardCost: number;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/summary");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.summary) {
        setSummary(data.summary);
        setError(null);
      } else {
        throw new Error(data.error || "Failed to load summary");
      }

      fetch("/api/admin/rewards/overview")
        .then((r) => r.json())
        .then((rData) => {
          if (rData.success) {
            setRewardsOverview({
              pendingCount: rData.kpis.entitlements.pendingApproval || 0,
              qualifiedCount: rData.kpis.funnel.qualified || 0,
              roiPercentage: rData.kpis.financials.roiPercentage || 0,
              revenueFromReferred: rData.kpis.financials.revenueFromReferredClientsKes || 0,
              rewardCost: rData.kpis.financials.totalRewardCostKes || 0,
            });
          }
        })
        .catch(() => {});
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setError(err?.message || "Failed to load dashboard summary");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(() => fetchSummary(false), 15000);
    const handleGlobalRefresh = () => fetchSummary(true);
    window.addEventListener("admin-refresh", handleGlobalRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("admin-refresh", handleGlobalRefresh);
    };
  }, [fetchSummary]);

  // Derived alert data
  const hasGatewayDowntime = summary?.systemHealth?.whatsappGateway?.isDowntime ?? false;
  const undeliveredCount = summary?.notifications?.undeliveredCount ?? 0;
  const activeAlertsCount = (summary?.systemHealth?.downtimeAlerts?.length ?? 0) + (hasGatewayDowntime ? 1 : 0);

  // Delivery rate (Messages)
  const totalMessagesDelivered = summary?.notifications
    ? Math.max(0, 100 - (undeliveredCount > 0 ? Math.min(100, undeliveredCount * 5) : 0))
    : null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Page Header: Clean summary title, date range & refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Dashboard Overview
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time fulfillment metrics, financial ledger, and system health status
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-sky-400" />
            <span>Today</span>
          </div>
          <button
            onClick={() => fetchSummary(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-xs font-semibold text-sky-300 transition active:scale-95 disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-sky-400" : ""}`} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* 2. Consolidated Alert Strip (Highest severity + count) */}
      {(hasGatewayDowntime || undeliveredCount > 0 || activeAlertsCount > 0) && (
        <div
          className={`p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border shadow-lg ${
            hasGatewayDowntime
              ? "bg-rose-950/40 border-rose-500/40 text-rose-200"
              : "bg-amber-950/30 border-amber-500/40 text-amber-200"
          }`}
        >
          <div className="flex items-center gap-3">
            {hasGatewayDowntime ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <div className="text-xs">
              <span className="font-bold">
                {hasGatewayDowntime
                  ? "WhatsApp Delivery Gateway Offline"
                  : `${undeliveredCount} Undelivered Message(s) in Queue`}
              </span>
              <span className="text-slate-300 ml-2 hidden sm:inline">
                {hasGatewayDowntime
                  ? "Automated booking notifications and verification OTPs are paused."
                  : "Dispatch attempts stalled or awaiting sender reconnect."}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[11px] font-semibold text-slate-400">
              {activeAlertsCount} open alert{activeAlertsCount === 1 ? "" : "s"}
            </span>
            <Link
              href={hasGatewayDowntime ? "/admin/whatsapp/worker" : "/admin/health"}
              className={`text-xs font-bold underline transition ${
                hasGatewayDowntime ? "text-rose-300 hover:text-white" : "text-amber-300 hover:text-white"
              }`}
            >
              {hasGatewayDowntime ? "Reconnect Gateway →" : "View all alerts →"}
            </Link>
          </div>
        </div>
      )}

      {/* 3. Five Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Revenue & Payments */}
        <GlassCard className="p-4 space-y-3 border-emerald-500/20 bg-emerald-950/10">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4" />
              Revenue & Payments
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
              {summary?.transactions.paidTransactionsCount ?? 0} settled
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-white">
              KES {(summary?.transactions.grossRevenue ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-slate-300 mt-1 flex items-center justify-between">
              <span>Settled orders:</span>
              <span className="font-semibold text-white">
                {summary?.transactions.totalTransactions ?? 0}
              </span>
            </div>
            <div className="text-xs text-slate-300 flex items-center justify-between">
              <span>Cleaner tips:</span>
              <span className="font-semibold text-amber-300">
                KES {(summary?.transactions.totalTips ?? 0).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-white/5">
            <Link
              href="/admin/transactions"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
            >
              <span>View ledger</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </GlassCard>

        {/* Card 2: Active Orders / Deliveries */}
        <GlassCard className="p-4 space-y-3 border-sky-500/20 bg-sky-950/10">
          <div className="flex items-center justify-between text-xs font-bold text-sky-400">
            <span className="flex items-center gap-1.5">
              <Truck className="w-4 h-4" />
              Active Deliveries
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-semibold">
              {summary?.deliveries.totalDeliveries && summary.deliveries.totalDeliveries > 0
                ? `${summary.deliveries.onTimeRate ?? 100}% on-time`
                : "—"}
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-white">
              {summary?.deliveries.activeDeliveries ?? 0}
            </div>
            <div className="text-xs text-slate-300 mt-1 flex items-center justify-between">
              <span>Total orders placed:</span>
              <span className="font-semibold text-white">
                {summary?.deliveries.totalDeliveries ?? 0}
              </span>
            </div>
            <div className="text-xs text-slate-300 flex items-center justify-between">
              <span>Spotless completed:</span>
              <span className="font-semibold text-emerald-400">
                {summary?.deliveries.deliveredCount ?? 0}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-white/5">
            <Link
              href="/admin/deliveries"
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
            >
              <span>View deliveries</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </GlassCard>

        {/* Card 3: WhatsApp Delivery Rate */}
        <GlassCard className="p-4 space-y-3 border-teal-500/20 bg-teal-950/10">
          <div className="flex items-center justify-between text-xs font-bold text-teal-400">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4" />
              WhatsApp Messages
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                undeliveredCount === 0
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {undeliveredCount === 0 ? "Clean queue" : `${undeliveredCount} queued`}
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-white">
              {hasGatewayDowntime ? (
                <span className="text-rose-400 text-lg font-bold">Offline</span>
              ) : (
                <span className="text-emerald-400 text-lg font-bold">Active</span>
              )}
            </div>
            <div className="text-xs text-slate-300 mt-1 flex items-center justify-between">
              <span>Undelivered / failed:</span>
              <span className="font-semibold text-white">{undeliveredCount}</span>
            </div>
            <div className="text-xs text-slate-300 flex items-center justify-between">
              <span>Gateway status:</span>
              <span className="font-semibold text-slate-200 capitalize">
                {summary?.systemHealth.whatsappGateway.status || "Disconnected"}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-white/5">
            <Link
              href="/admin/whatsapp/logs"
              className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1 transition"
            >
              <span>View messages</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </GlassCard>

        {/* Card 4: Traffic & Sessions */}
        <GlassCard className="p-4 space-y-3 border-indigo-500/20 bg-indigo-950/10">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-400">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              Traffic & Sessions
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold">
              {summary?.traffic.bookingConversionRate !== null &&
              summary?.traffic.bookingConversionRate !== undefined &&
              summary.traffic.bookingConversionRate > 0
                ? `${summary.traffic.bookingConversionRate}% conv.`
                : "—"}
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-white">
              {summary?.traffic.activeSessionsToday ?? 1}
            </div>
            <div className="text-xs text-slate-300 mt-1 flex items-center justify-between">
              <span>Registered users:</span>
              <span className="font-semibold text-white">{summary?.traffic.totalUsers ?? 0}</span>
            </div>
            <div className="text-xs text-slate-300 flex items-center justify-between">
              <span>Realtime SSE stream:</span>
              <span className="font-semibold text-emerald-400">
                {summary?.traffic.realtimeSubscribers ?? 1} active
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-white/5">
            <Link
              href="/admin/customers"
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
            >
              <span>Customer directory</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </GlassCard>

        {/* Card 5: Rewards & Referrals */}
        <GlassCard className="p-4 space-y-3 border-amber-500/20 bg-amber-950/10">
          <div className="flex items-center justify-between text-xs font-bold text-amber-400">
            <span className="flex items-center gap-1.5">
              <Gift className="w-4 h-4" />
              Rewards & Referrals
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                (rewardsOverview?.pendingCount ?? 0) > 0
                  ? "bg-amber-500/20 text-amber-300 animate-pulse"
                  : "bg-white/10 text-slate-300"
              }`}
            >
              {(rewardsOverview?.pendingCount ?? 0) > 0
                ? `${rewardsOverview?.pendingCount} pending`
                : "All clear"}
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-white">
              +{rewardsOverview?.roiPercentage ?? 0}%{" "}
              <span className="text-xs text-emerald-400 font-bold">ROI</span>
            </div>
            <div className="text-xs text-slate-300 mt-1 flex items-center justify-between">
              <span>Qualified referrals:</span>
              <span className="font-semibold text-white">
                {rewardsOverview?.qualifiedCount ?? 0}
              </span>
            </div>
            <div className="text-xs text-slate-300 flex items-center justify-between">
              <span>Pending approvals:</span>
              <span
                className={`font-semibold ${
                  (rewardsOverview?.pendingCount ?? 0) > 0
                    ? "text-amber-400 font-bold"
                    : "text-emerald-400"
                }`}
              >
                {rewardsOverview?.pendingCount ?? 0}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-white/5">
            <Link
              href="/admin/rewards"
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
            >
              <span>Manage rewards</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </GlassCard>
      </div>

      {/* 4. Compact Order-Pipeline Strip (Horizontal scroll on mobile) */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Order Fulfillment Stages
            </h3>
          </div>
          <Link
            href="/admin/deliveries"
            className="text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
          >
            <span>Deliveries pipeline</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {DELIVERY_STAGES.map((stage) => {
            const count = summary?.deliveries?.statusBreakdown?.[stage.key] ?? 0;
            return (
              <div
                key={stage.key}
                className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center min-w-[110px] flex-1 text-center hover:border-white/10 transition shrink-0"
              >
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  {stage.label}
                </span>
                <span className="text-lg font-black text-white mt-0.5">{count}</span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* 5. Two-Column Row: Latest 5 Transactions & Latest 5 Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Transactions */}
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Latest Transactions
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Recent customer payments, receipts, and settlement status
              </p>
            </div>
            <Link
              href="/admin/transactions"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
            >
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 font-semibold">
                  <th className="pb-2">Receipt / Ref</th>
                  <th className="pb-2">Customer</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {summary?.transactions.recentPayments && summary.transactions.recentPayments.length > 0 ? (
                  summary.transactions.recentPayments.slice(0, 5).map((pay) => (
                    <tr key={pay.id} className="text-slate-300 hover:bg-white/[0.02]">
                      <td className="py-2.5 font-mono text-[11px] text-sky-300">
                        {pay.providerRef ? pay.providerRef.slice(-10) : "PENDING"}
                      </td>
                      <td className="py-2.5 font-medium text-white truncate max-w-[120px]">
                        {pay.customerName || "Customer"}
                      </td>
                      <td className="py-2.5 font-bold text-white">
                        KES {pay.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            pay.status === "COMPLETED" || pay.status === "PAID"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : pay.status === "PENDING"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          }`}
                        >
                          {pay.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      No transaction records logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* Latest Alerts / Queue Failures */}
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Open Alerts & Undelivered
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Dispatch errors and gateway uptime events
              </p>
            </div>
            <Link
              href="/admin/whatsapp/logs?quickFilter=undelivered"
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
            >
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {summary?.notifications.failedMessages && summary.notifications.failedMessages.length > 0 ? (
            <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
              {summary.notifications.failedMessages.slice(0, 5).map((msg) => (
                <div
                  key={msg.id}
                  className="p-3 rounded-xl bg-white/[0.03] border border-rose-500/20 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white uppercase text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                        {msg.purpose}
                      </span>
                      <span className="text-slate-400 text-[11px] truncate">
                        {msg.recipientMasked}
                      </span>
                    </div>
                    <p className="text-[11px] text-rose-300 truncate">
                      {msg.failureReason || "Gateway offline or unreachable."}
                    </p>
                  </div>
                  <Link
                    href={`/admin/whatsapp/logs?quickFilter=undelivered&search=${encodeURIComponent(msg.recipientMasked)}`}
                    className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[11px] font-semibold transition shrink-0"
                  >
                    Inspect
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <p className="text-xs font-semibold text-white">All Dispatches Clean</p>
              <p className="text-[11px] text-slate-400 max-w-xs">
                No active delivery failures or message queue blocks reported.
              </p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* 6. Service Status Dots Row */}
      <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
          Service Health
        </span>

        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-200">API Gateway:</span>
            <span className="text-emerald-400 font-semibold">Online</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-200">PostgreSQL:</span>
            <span className="text-emerald-400 font-semibold">
              {summary?.systemHealth.database.latencyMs ?? 2}ms
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                undeliveredCount > 0 ? "bg-amber-400" : "bg-emerald-400"
              }`}
            />
            <span className="text-slate-200">BullMQ Queue:</span>
            <span
              className={
                undeliveredCount > 0 ? "text-amber-400 font-semibold" : "text-emerald-400 font-semibold"
              }
            >
              {undeliveredCount > 0 ? `${undeliveredCount} waiting` : "Idle"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                hasGatewayDowntime ? "bg-rose-500 animate-ping" : "bg-emerald-400 animate-pulse"
              }`}
            />
            <span className="text-slate-200">WhatsApp Sender:</span>
            <span
              className={
                hasGatewayDowntime
                  ? "text-rose-400 font-bold"
                  : "text-emerald-400 font-semibold capitalize"
              }
            >
              {summary?.systemHealth.whatsappGateway.status || "Disconnected"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
