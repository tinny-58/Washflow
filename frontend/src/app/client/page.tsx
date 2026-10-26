"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  PlusCircle,
  CreditCard,
  AlertCircle,
  Truck,
  ArrowRight,
  Clock,
  CheckCircle2,
  Calendar,
  Gift,
  Copy,
  Check,
  Share2,
  QrCode,
  Sparkles,
  Package,
  X,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatusChip,
  EmptyState,
} from "@/components/shared";
import { useClientSidebar } from "@/components/client/client-sidebar";
import { formatKes, formatDate } from "@/lib/utils";

// Exact 7-stage order lifecycle
const ORDER_STAGES = [
  { key: "PENDING", label: "Booked" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PICKED_UP", label: "Collected" },
  { key: "WASHING", label: "Washing" },
  { key: "READY", label: "Ready" },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { key: "DELIVERED", label: "Delivered" },
];

function getStageIndex(status: string): number {
  if (status === "IN_WASH") return 3;
  if (status === "WASHED") return 4;
  const idx = ORDER_STAGES.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

interface OverviewData {
  client: {
    id: string;
    name: string;
    phone: string;
    referralCode: string;
    referralShareUrl: string;
  };
  activeOrder: {
    id: string;
    createdAt: string;
    status: string;
    pickupWindow: string;
    total: number;
    subtotal: number;
    paymentStatus: string;
    addressText?: string;
    landmark?: string;
  } | null;
  pendingPayments: Array<{
    id: string;
    orderId: string;
    status: string;
    total: number;
    pickupWindow: string;
    paymentStatus: string;
    createdAt: string;
  }>;
  recentOrders: Array<{
    id: string;
    createdAt: string;
    status: string;
    pickupWindow: string;
    total: number;
    paymentStatus: string;
    addressText?: string;
  }>;
  isLastOrderDelivered: boolean;
  referralsRemaining: number;
  milestones: {
    referrals: {
      current: number;
      target: number;
      points: number;
      cycle: number;
    };
    loyalty: {
      current: number;
      target: number;
      points: number;
      cycle: number;
    };
  };
  stats: {
    totalOrders: number;
    completedWashes: number;
    activeOrdersCount: number;
    amountsDueCount: number;
  };
}

export default function ClientDashboardPage() {
  const { refresh: refreshSidebar } = useClientSidebar();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [qrModalOpen, setQrModalOpen] = useState<boolean>(false);

  // Time-of-day contextual greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/client/overview", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json);
        }
      }
    } catch (err) {
      console.error("Dashboard overview fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();

    const handleRefreshEvent = () => {
      fetchOverview();
    };

    window.addEventListener("client-refresh", handleRefreshEvent);
    return () => window.removeEventListener("client-refresh", handleRefreshEvent);
  }, [fetchOverview]);

  const copyReferralLink = async () => {
    if (!data?.client.referralShareUrl) return;
    try {
      await navigator.clipboard.writeText(data.client.referralShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const getWhatsAppShareUrl = () => {
    if (!data?.client.referralShareUrl) return "#";
    const text = encodeURIComponent(
      `Hey! Get your everyday laundry, duvets, and mats cleaned professionally with WashFlow. Use my link for doorstep pickup & delivery: ${data.client.referralShareUrl}`
    );
    return `https://wa.me/?text=${text}`;
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-pulse">
        <div className="h-20 rounded-2xl bg-white/5 border border-white/10" />
        <div className="h-44 rounded-2xl bg-white/5 border border-white/10" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-60 rounded-2xl bg-white/5 border border-white/10" />
          <div className="h-60 rounded-2xl bg-white/5 border border-white/10" />
        </div>
      </div>
    );
  }

  const client = data?.client;
  const activeOrder = data?.activeOrder;
  const pendingPayments = data?.pendingPayments || [];
  const hasDues = pendingPayments.length > 0 || (data?.stats.amountsDueCount || 0) > 0;
  const recentOrders = data?.recentOrders || [];
  const referralsRemaining = data?.referralsRemaining ?? 3;
  const loyaltyPoints = data?.milestones.loyalty.points ?? 0;
  const activeStageIdx = activeOrder ? getStageIndex(activeOrder.status) : 0;
  const isHighlightedInvite = Boolean(data?.isLastOrderDelivered);

  // Progress ring computation (500 pts = 1 reward)
  const currentReferralProgress = (data?.milestones.referrals.current || 0) % 500;
  const ringPercentage = Math.min(100, Math.round((currentReferralProgress / 500) * 100));
  const strokeDashoffset = 100 - ringPercentage;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* =========================================================================
          BLOCK 1: SLIM GREETING WITH THREE QUICK ACTIONS
          ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {getGreeting()}, {client?.name?.split(" ")[0] || "Customer"}!
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Doorstep laundry service • Live order status and reward tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Action 1: Book a Wash */}
          <Link
            href="/client/book"
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold transition shadow-lg shadow-sky-500/20"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Book a wash</span>
          </Link>

          {/* Quick Action 2: Pay Now (Shown ONLY if something is due) */}
          {hasDues && (
            <Link
              href="/client/payments"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold transition shadow-lg shadow-amber-500/20 animate-pulse"
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              <span>Pay now ({pendingPayments.length})</span>
            </Link>
          )}

          {/* Quick Action 3: Report an Issue */}
          <Link
            href="/client/claims"
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs sm:text-sm font-semibold transition"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-slate-400" />
            <span>Report an issue</span>
          </Link>
        </div>
      </div>

      {/* =========================================================================
          BLOCK 2: NEXT PICKUP (Date, Window, Status Stepper, Link to Order)
          ========================================================================= */}
      <Card variant="glass">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Truck className="w-5 h-5 text-sky-400 shrink-0" />
              <span>Next Pickup</span>
            </CardTitle>
            <CardDescription>Live pickup window and current garment care status.</CardDescription>
          </div>
          <Link
            href="/client/orders"
            className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition flex items-center gap-1"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>

        <CardContent>
          {activeOrder ? (
            <div className="space-y-5">
              {/* Pickup Meta Strip */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="font-bold text-white text-sm sm:text-base">
                      {activeOrder.pickupWindow}
                    </span>
                  </div>
                  {activeOrder.addressText && (
                    <span className="text-xs text-slate-400 block truncate max-w-md">
                      📍 {activeOrder.addressText}
                      {activeOrder.landmark ? ` (Near ${activeOrder.landmark})` : ""}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Link
                    href={`/client/track/${activeOrder.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-semibold transition"
                  >
                    <span>Track order live</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Status Stepper (7 Stages) */}
              <div className="pt-2">
                <div className="relative">
                  {/* Progress Line */}
                  <div className="absolute top-4 left-0 right-0 h-0.5 bg-white/10 -z-0" />
                  <div
                    className="absolute top-4 left-0 h-0.5 bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500 -z-0"
                    style={{
                      width: `${(activeStageIdx / (ORDER_STAGES.length - 1)) * 100}%`,
                    }}
                  />

                  {/* Stage Dots & Labels */}
                  <div className="grid grid-cols-7 gap-1 text-center relative z-10">
                    {ORDER_STAGES.map((stage, idx) => {
                      const isCompleted = idx < activeStageIdx;
                      const isCurrent = idx === activeStageIdx;
                      const isUpcoming = idx > activeStageIdx;

                      return (
                        <div key={stage.key} className="flex flex-col items-center">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-md ${
                              isCurrent
                                ? "bg-sky-500 text-white ring-4 ring-sky-500/20 scale-110"
                                : isCompleted
                                ? "bg-emerald-500 text-white"
                                : "bg-slate-900 border border-white/20 text-slate-500"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              <span>{idx + 1}</span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] sm:text-xs font-medium mt-2 leading-tight hidden sm:block ${
                              isCurrent
                                ? "text-sky-300 font-bold"
                                : isCompleted
                                ? "text-slate-300"
                                : "text-slate-500"
                            }`}
                          >
                            {stage.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mobile Active Stage Indicator */}
                <div className="sm:hidden text-center mt-3 text-xs font-semibold text-sky-300">
                  Current Status: {ORDER_STAGES[activeStageIdx]?.label}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center space-y-3">
              <span className="text-2xl font-bold text-slate-600 block">—</span>
              <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
                No upcoming pickups scheduled. Book your next wash to receive door-to-door garment care.
              </p>
              <Link
                href="/client/book"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition"
              >
                <PlusCircle className="w-3.5 h-3.5 text-sky-400" />
                <span>Schedule a Pickup</span>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =========================================================================
          BLOCK 3: PAYMENTS DUE (Shown ONLY if something is due)
          ========================================================================= */}
      {hasDues && (
        <Card variant="accent" className="border-amber-500/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-amber-300">
                <CreditCard className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Payments Due</span>
              </CardTitle>
              <CardDescription>
                Outstanding deposit or order balance requiring M-Pesa STK push settlement.
              </CardDescription>
            </div>
            <Link
              href="/client/payments"
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition flex items-center gap-1"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>

          <CardContent className="space-y-3">
            {pendingPayments.map((p) => (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-amber-500/20"
              >
                <div className="space-y-0.5 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">Order #{p.orderId.slice(0, 8)}</span>
                    <StatusChip label={p.paymentStatus} variant="amber" size="sm" />
                  </div>
                  <span className="text-[11px] text-slate-400 block font-sans">
                    Window: {p.pickupWindow} • Placed {formatDate(p.createdAt)}
                  </span>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-slate-400 font-mono block">Amount Due</span>
                    <span className="text-base sm:text-lg font-black text-amber-300 font-mono">
                      {formatKes(p.total)}
                    </span>
                  </div>

                  <Link
                    href={`/client/payments?order=${p.id}`}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-md shadow-amber-500/20"
                  >
                    <span>Pay now</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* =========================================================================
          BLOCK 4: REWARDS & INVITATIONS
          (Progress ring, loyalty points, invite card with Delivery Highlight)
          ========================================================================= */}
      <Card
        variant="glass"
        className={
          isHighlightedInvite
            ? "border-emerald-500/50 shadow-2xl shadow-emerald-500/10 ring-1 ring-emerald-500/30"
            : ""
        }
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Rewards & Invitations</span>
            </CardTitle>
            <CardDescription>
              Accumulate referrals for free washes and earn points on every completed wash.
            </CardDescription>
          </div>
          <Link
            href="/client/rewards"
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Post-Delivery Celebration Banner (if last order is delivered) */}
          {isHighlightedInvite && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-emerald-500/20 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 animate-pulse" />
              <div>
                <span className="font-bold text-white block">
                  Your last laundry was delivered fresh & clean!
                </span>
                <span>
                  Share WashFlow with friends to earn your next wash 100% free.
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left: Circular Progress Ring & Loyalty Points */}
            <div className="flex items-center gap-5 p-4 rounded-xl bg-white/[0.02] border border-white/5">
              {/* SVG Circular Progress Ring */}
              <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  {/* Track */}
                  <path
                    className="text-white/10"
                    strokeWidth="3.2"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Indicator */}
                  <path
                    className="text-emerald-400 transition-all duration-1000 ease-out"
                    strokeDasharray="100, 100"
                    strokeDashoffset={strokeDashoffset}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-black text-white font-mono">{ringPercentage}%</span>
                  <span className="text-[8px] text-slate-400 uppercase">Target</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs sm:text-sm font-bold text-white block">
                  {referralsRemaining > 0
                    ? `${referralsRemaining} more ${referralsRemaining === 1 ? "referral" : "referrals"} to a free wash`
                    : "Free wash milestone unlocked!"}
                </span>
                <div className="flex items-center gap-3 text-xs font-mono text-slate-400 pt-0.5">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Referral Pts</span>
                    <span className="text-sky-300 font-bold">{data?.milestones.referrals.points || 0} pts</span>
                  </div>
                  <div className="border-l border-white/10 pl-3">
                    <span className="text-slate-500 block text-[10px]">Loyalty Pts</span>
                    <span className="text-indigo-300 font-bold">{loyaltyPoints} pts</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Invitation Card (Copy Link, WhatsApp Share, QR Code) */}
            <div className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Your Invite Link:</span>
                <span className="font-mono text-sky-400 font-bold text-[11px]">
                  Code: {client?.referralCode}
                </span>
              </div>

              {/* Share Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyReferralLink}
                  className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 transition"
                  title="Copy link to clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied!" : "Copy Link"}</span>
                </button>

                <a
                  href={getWhatsAppShareUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-md shadow-emerald-600/20"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>

                <button
                  type="button"
                  onClick={() => setQrModalOpen(true)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition"
                  title="Show QR Code"
                  aria-label="Show Referral QR Code"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* =========================================================================
          BLOCK 5: RECENT ACTIVITY (Last 3 orders and recent claim updates)
          ========================================================================= */}
      <Card variant="glass">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>Recent Activity</span>
            </CardTitle>
            <CardDescription>Your last three laundry orders and updates.</CardDescription>
          </div>
          <Link
            href="/client/orders"
            className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition flex items-center gap-1"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>

        <CardContent>
          {recentOrders.length > 0 ? (
            <div className="divide-y divide-white/5">
              {recentOrders.map((order) => {
                const statusMap: Record<string, { label: string; variant: "amber" | "sky" | "indigo" | "emerald" | "rose" | "slate" }> = {
                  PENDING: { label: "Booked", variant: "amber" },
                  CONFIRMED: { label: "Confirmed", variant: "sky" },
                  PICKED_UP: { label: "Collected", variant: "indigo" },
                  WASHING: { label: "Washing", variant: "sky" },
                  IN_WASH: { label: "Washing", variant: "sky" },
                  READY: { label: "Ready", variant: "sky" },
                  WASHED: { label: "Ready", variant: "sky" },
                  OUT_FOR_DELIVERY: { label: "Out for Delivery", variant: "sky" },
                  DELIVERED: { label: "Delivered", variant: "emerald" },
                  CANCELLED: { label: "Cancelled", variant: "rose" },
                };
                const config = statusMap[order.status] || { label: order.status, variant: "slate" };

                return (
                  <div
                    key={order.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02] -mx-4 px-4 rounded-xl transition"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-xs sm:text-sm text-white">
                          Order #{order.id.slice(0, 8)}
                        </span>
                        <StatusChip label={config.label} variant={config.variant} size="sm" />
                      </div>
                      <span className="text-xs text-slate-400 block font-mono">
                        {formatDate(order.createdAt)} • {order.pickupWindow}
                      </span>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <span className="font-mono font-bold text-xs sm:text-sm text-slate-200">
                        {formatKes(order.total)}
                      </span>

                      <Link
                        href={`/client/track/${order.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 transition"
                      >
                        <span>Details</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center space-y-2">
              <span className="text-xl font-bold text-slate-600 block">—</span>
              <p className="text-xs text-slate-400">
                No orders placed yet. Your recent activity will appear here once you place a booking.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referral QR Code Modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95 text-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 id="qr-modal-title" className="text-sm font-bold text-white">
                Your Referral QR Code
              </h3>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Let friends scan this code on their phone camera to instantly open your invite link:
            </p>

            {/* High-contrast QR visual box */}
            <div className="p-4 bg-white rounded-2xl inline-block shadow-inner mx-auto">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  data?.client.referralShareUrl || ""
                )}`}
                alt="Referral QR Code"
                className="w-40 h-40 object-contain mx-auto"
              />
            </div>

            <span className="text-xs font-mono font-bold text-sky-400 block">
              Code: {client?.referralCode}
            </span>

            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
