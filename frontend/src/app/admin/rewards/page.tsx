"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Gift,
  Sparkles,
  Users,
  Award,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Tag,
  Clock,
  Eye,
  ShieldAlert,
  Sliders,
  RefreshCw,
  Search,
  Filter,
  Check,
  Calendar,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Lock,
  Phone,
  Flame,
  MessageSquare,
  AlertCircle,
  Info,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

interface RewardsOverview {
  kpis: {
    funnel: {
      linkVisits: number;
      signups: number;
      booked: number;
      delivered: number;
      qualified: number;
      flagged: number;
      voided: number;
    };
    points: {
      referralPointsIssued: number;
      loyaltyPointsIssued: number;
    };
    entitlements: {
      pendingApproval: number;
      approved: number;
      rejected: number;
      voided: number;
    };
    vouchers: {
      total: number;
      available: number;
      redeemed: number;
      expired: number;
      voided: number;
    };
    financials: {
      revenueFromReferredClientsKes: number;
      totalRewardCostKes: number;
      netGainKes: number;
      roiPercentage: number;
      formula: string;
    };
  };
  topReferrers: Array<{
    id: string;
    name: string;
    phoneMasked: string;
    code: string;
    points: number;
    qualifiedCount: number;
    revenueGeneratedKes: number;
  }>;
  settings: {
    version: number;
    programActive: boolean;
    standardRewardMilestonePoints?: number;
    exclusiveRewardMilestonePoints?: number;
    standardRewardMaxCapKes?: number;
    exclusiveRewardMaxCapKes?: number;
    loyaltyPointsPerPaidOrder?: number;
    loyaltyRedemptionPoints?: number;
    minOrderValueKes?: number;
    voucherValidityDays?: number;
    annualRewardCap?: number;
    holdWindowHours?: number;
    requireAdminApproval?: boolean;
    autoApproveLowRisk?: boolean;
    adminAlertPhone?: string;
    whatsappTemplateReferralShare?: string;
  };
}

interface ApprovalRecord {
  id: string;
  clientId: string;
  clientName: string;
  clientPhoneMasked: string;
  milestoneKey: string;
  milestoneIndex: number;
  pointsSnapshot: number;
  status: string;
  flagSignals?: any;
  notes?: string;
  createdAt: string;
  isOverdue: boolean;
  ageHours: number;
}

interface VoucherRecord {
  id: string;
  clientId: string;
  clientName: string;
  clientPhoneMasked: string;
  source: string;
  code: string;
  status: string;
  maxDiscountKes: number;
  expiresAt: string;
  redeemedOrderId?: string;
  redeemedAt?: string;
  voidReason?: string;
  createdAt: string;
}

interface ReferralRecord {
  id: string;
  code: string;
  status: string;
  flagSignals?: any;
  voidReason?: string;
  firstTouchAt?: string;
  qualifiedAt?: string;
  createdAt: string;
  referrer: {
    id: string;
    name: string;
    phoneMasked: string;
  };
  referee: {
    id: string;
    name: string;
    phoneMasked: string;
  };
  qualifyingBooking?: {
    id: string;
    status: string;
    total: number;
    paymentStatus: string;
  } | null;
}

export default function AdminRewardsPage() {
  const [overview, setOverview] = useState<RewardsOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<
    "APPROVALS" | "OVERVIEW" | "VOUCHERS" | "REFERRALS" | "FRAUD_QUEUE" | "SETTINGS"
  >("APPROVALS");

  // Approvals Queue state
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState<boolean>(false);

  // Vouchers state
  const [vouchers, setVouchers] = useState<VoucherRecord[]>([]);
  const [voucherFilter, setVoucherFilter] = useState<string>("ALL");
  const [voucherSearch, setVoucherSearch] = useState<string>("");
  const [loadingVouchers, setLoadingVouchers] = useState<boolean>(false);

  // Referrals state
  const [referralsList, setReferralsList] = useState<ReferralRecord[]>([]);
  const [referralFilter, setReferralFilter] = useState<string>("ALL");
  const [loadingReferrals, setLoadingReferrals] = useState<boolean>(false);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<any>({
    standardRewardMilestonePoints: 500,
    exclusiveRewardMilestonePoints: 1000,
    standardRewardMaxCapKes: 300,
    exclusiveRewardMaxCapKes: 450,
    loyaltyPointsPerPaidOrder: 10,
    loyaltyRedemptionPoints: 100,
    minOrderValueKes: 300,
    voucherValidityDays: 90,
    annualRewardCap: 15,
    holdWindowHours: 0,
    requireAdminApproval: true,
    autoApproveLowRisk: false,
    adminAlertPhone: "+254706351077",
    whatsappTemplateReferralShare:
      "Hey! Get your laundry done professionally with WashFlow. Book using my link and get express pickup & delivery: {{shareUrl}}",
  });
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  // Void modal state
  const [voidModal, setVoidModal] = useState<{
    type: "voucher" | "referral";
    id: string;
    targetName: string;
  } | null>(null);
  const [voidReason, setVoidReason] = useState<string>("");
  const [voiding, setVoiding] = useState<boolean>(false);

  // Step-up action modal (for Approvals or Rejections)
  const [stepUpModal, setStepUpModal] = useState<{
    action: "approve" | "reject";
    entitlementId: string;
    clientName: string;
    milestone: string;
  } | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [submittingStepUp, setSubmittingStepUp] = useState<boolean>(false);

  // Audited reveal state (maps userId to unmasked phone)
  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  // Fetch Overview
  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/rewards/overview");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setOverview(data);
          if (data.settings) {
            setSettingsForm({
              standardRewardMilestonePoints: data.settings.standardRewardMilestonePoints || 500,
              exclusiveRewardMilestonePoints: data.settings.exclusiveRewardMilestonePoints || 1000,
              standardRewardMaxCapKes: data.settings.standardRewardMaxCapKes || 300,
              exclusiveRewardMaxCapKes: data.settings.exclusiveRewardMaxCapKes || 450,
              loyaltyPointsPerPaidOrder: data.settings.loyaltyPointsPerPaidOrder || 10,
              loyaltyRedemptionPoints: data.settings.loyaltyRedemptionPoints || 100,
              minOrderValueKes: data.settings.minOrderValueKes || 300,
              voucherValidityDays: data.settings.voucherValidityDays || 90,
              annualRewardCap: data.settings.annualRewardCap || 15,
              holdWindowHours: data.settings.holdWindowHours || 0,
              requireAdminApproval: data.settings.requireAdminApproval ?? true,
              autoApproveLowRisk: data.settings.autoApproveLowRisk ?? false,
              adminAlertPhone: data.settings.adminAlertPhone || "+254706351077",
              whatsappTemplateReferralShare:
                data.settings.whatsappTemplateReferralShare ||
                "Hey! Get your laundry done professionally with WashFlow. Book using my link and get express pickup & delivery: {{shareUrl}}",
            });
          }
        }
      }
    } catch {} finally {
      setLoadingOverview(false);
    }
  }, []);

  // Fetch Approvals
  const fetchApprovals = useCallback(async () => {
    setLoadingApprovals(true);
    try {
      const res = await fetch("/api/admin/rewards/approvals");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.approvals)) {
          setApprovals(data.approvals);
        }
      }
    } catch {} finally {
      setLoadingApprovals(false);
    }
  }, []);

  // Fetch Vouchers
  const fetchVouchers = useCallback(async () => {
    setLoadingVouchers(true);
    try {
      const url =
        voucherFilter !== "ALL"
          ? `/api/admin/rewards/vouchers?status=${voucherFilter}`
          : "/api/admin/rewards/vouchers";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.vouchers)) {
          setVouchers(data.vouchers);
        }
      }
    } catch {} finally {
      setLoadingVouchers(false);
    }
  }, [voucherFilter]);

  // Fetch Referrals
  const fetchReferrals = useCallback(async () => {
    setLoadingReferrals(true);
    try {
      const url =
        referralFilter !== "ALL"
          ? `/api/admin/rewards/referrals?status=${referralFilter}`
          : "/api/admin/rewards/referrals";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.referrals)) {
          setReferralsList(data.referrals);
        }
      }
    } catch {} finally {
      setLoadingReferrals(false);
    }
  }, [referralFilter]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === "APPROVALS") fetchApprovals();
    if (activeTab === "VOUCHERS") fetchVouchers();
    if (activeTab === "REFERRALS" || activeTab === "FRAUD_QUEUE") fetchReferrals();
  }, [activeTab, fetchApprovals, fetchVouchers, fetchReferrals]);

  // Audited Phone Reveal
  const handleRevealPhone = async (userId: string) => {
    if (revealedPhones[userId]) return;
    setRevealingId(userId);
    try {
      const res = await fetch("/api/admin/rewards/reveal-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      const data = await res.json();
      if (res.ok && data.phone) {
        setRevealedPhones((prev) => ({ ...prev, [userId]: data.phone }));
      }
    } catch {} finally {
      setRevealingId(null);
    }
  };

  // Submit Step-Up Approval / Rejection
  const handleExecuteStepUpAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stepUpModal) return;
    if (stepUpModal.action === "reject" && !rejectReason.trim()) {
      setStepUpError("Rejection reason is required.");
      return;
    }

    setSubmittingStepUp(true);
    setStepUpError(null);

    try {
      const endpoint =
        stepUpModal.action === "approve"
          ? `/api/admin/rewards/approvals/${stepUpModal.entitlementId}/approve`
          : `/api/admin/rewards/approvals/${stepUpModal.entitlementId}/reject`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: stepUpPassword,
          stepUpConfirmed: true,
          reason: rejectReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setStepUpError(data.error || "Action failed. Check admin credentials.");
        return;
      }

      // Success
      setStepUpModal(null);
      setStepUpPassword("");
      setRejectReason("");
      await fetchApprovals();
      await fetchOverview();
    } catch {
      setStepUpError("Network error executing step-up action.");
    } finally {
      setSubmittingStepUp(false);
    }
  };

  // Void confirmation
  const handleConfirmVoid = async () => {
    if (!voidModal || !voidReason.trim()) return;
    setVoiding(true);

    try {
      const endpoint =
        voidModal.type === "voucher"
          ? `/api/admin/rewards/vouchers/${voidModal.id}/void`
          : `/api/admin/rewards/referrals/${voidModal.id}/void`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason }),
      });

      if (res.ok) {
        setVoidModal(null);
        setVoidReason("");
        await fetchOverview();
        if (voidModal.type === "voucher") await fetchVouchers();
        else await fetchReferrals();
      }
    } catch {} finally {
      setVoiding(false);
    }
  };

  // Extend Voucher Expiry
  const handleExtendVoucher = async (voucherId: string) => {
    try {
      const res = await fetch(`/api/admin/rewards/vouchers/${voucherId}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      });
      if (res.ok) {
        await fetchVouchers();
      }
    } catch {}
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg(null);

    try {
      const res = await fetch("/api/admin/rewards/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (res.ok) {
        setSettingsMsg("Program settings version updated and logged in audit trail.");
        await fetchOverview();
      } else {
        setSettingsMsg(data.error || "Failed to update settings.");
      }
    } catch {
      setSettingsMsg("Network error saving settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const pendingApprovalsCount = overview?.kpis.entitlements.pendingApproval || approvals.length;
  const overdueApprovalsCount = approvals.filter((a) => a.isOverdue).length;
  const flaggedReferrals = referralsList.filter((r) => r.status === "flagged");

  const filteredVouchers = vouchers.filter((v) => {
    if (!voucherSearch) return true;
    const term = voucherSearch.toLowerCase();
    return (
      v.code.toLowerCase().includes(term) ||
      (v.clientName && v.clientName.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20 p-3 sm:p-6">
      {/* 1. HEADER & GLOBAL KPIS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Settings Version {overview?.settings.version || 1}
            </span>
            <span className="text-slate-400 text-xs">Customer Loyalty & Growth</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Referrals & Loyalty Management
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchOverview();
            if (activeTab === "APPROVALS") fetchApprovals();
            if (activeTab === "VOUCHERS") fetchVouchers();
            if (activeTab === "REFERRALS" || activeTab === "FRAUD_QUEUE") fetchReferrals();
          }}
          className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold transition flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Approvals Queue */}
        <GlassCard className="p-4 bg-slate-900/60 border border-white/10 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Pending Approvals</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-2xl font-extrabold text-amber-400 font-mono block">
            {pendingApprovalsCount}
          </span>
          <span
            className={`text-[11px] font-medium block ${
              overdueApprovalsCount > 0 ? "text-rose-400 font-bold" : "text-slate-400"
            }`}
          >
            {overdueApprovalsCount > 0
              ? `${overdueApprovalsCount} Overdue (>24h)`
              : "All within 24h SLA"}
          </span>
        </GlassCard>

        {/* KPI 2: Financial ROI */}
        <GlassCard className="p-4 bg-slate-900/60 border border-white/10 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Program ROI</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-2xl font-extrabold text-emerald-400 font-mono block">
            +{overview?.kpis.financials.roiPercentage ?? 0}%
          </span>
          <span className="text-[11px] text-slate-300 block truncate" title={overview?.kpis.financials.formula}>
            Net: KES {(overview?.kpis.financials.netGainKes || 0).toLocaleString()}
          </span>
        </GlassCard>

        {/* KPI 3: Funnel Qualified */}
        <GlassCard className="p-4 bg-slate-900/60 border border-white/10 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Qualified Referrals</span>
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>
          <span className="text-2xl font-extrabold text-white font-mono block">
            {overview?.kpis.funnel.qualified || 0}
          </span>
          <span className="text-[11px] text-slate-400 block truncate">
            {overview?.kpis.funnel.signups || 0} Signups &middot; {overview?.kpis.funnel.linkVisits || 0} Visits
          </span>
        </GlassCard>

        {/* KPI 4: Vouchers */}
        <GlassCard className="p-4 bg-slate-900/60 border border-white/10 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Active Vouchers</span>
            <Tag className="w-4 h-4 text-sky-400" />
          </div>
          <span className="text-2xl font-extrabold text-sky-400 font-mono block">
            {overview?.kpis.vouchers.available || 0}
          </span>
          <span className="text-[11px] text-slate-400 block">
            {overview?.kpis.vouchers.redeemed || 0} Redeemed &middot; {overview?.kpis.vouchers.total || 0} Total
          </span>
        </GlassCard>
      </div>

      {/* 2. NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("APPROVALS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === "APPROVALS"
              ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Approvals Queue</span>
          {pendingApprovalsCount > 0 && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                overdueApprovalsCount > 0
                  ? "bg-rose-500 text-white animate-pulse"
                  : "bg-white/20 text-white"
              }`}
            >
              {pendingApprovalsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("OVERVIEW")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === "OVERVIEW"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>ROI & Funnel Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("VOUCHERS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === "VOUCHERS"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Voucher Wallet & Grants</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-white/20">
            {overview?.kpis.vouchers.total || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("REFERRALS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === "REFERRALS"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Referral Explorer</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("FRAUD_QUEUE")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === "FRAUD_QUEUE"
              ? "bg-rose-600 text-white shadow-md shadow-rose-600/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Fraud Queue</span>
          {flaggedReferrals.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-rose-500/30 text-rose-200">
              {flaggedReferrals.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("SETTINGS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === "SETTINGS"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Program Settings</span>
        </button>
      </div>

      {/* 3. TAB 1: APPROVALS QUEUE (Step-Up Authenticated) */}
      {activeTab === "APPROVALS" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/10">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Reward Approvals Queue
              </h3>
              <p className="text-xs text-slate-400">
                Milestones earned by customers. Approving generates an official voucher and triggers client notification.
              </p>
            </div>

            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20">
              {approvals.length} Awaiting Approval
            </span>
          </div>

          {loadingApprovals ? (
            <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
              Loading pending approvals...
            </div>
          ) : approvals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {approvals.map((ent) => (
                <GlassCard
                  key={ent.id}
                  className={`p-5 rounded-2xl border space-y-4 flex flex-col justify-between ${
                    ent.isOverdue
                      ? "bg-rose-950/20 border-rose-500/40"
                      : "bg-slate-900/70 border-white/10"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              ent.milestoneKey === "exclusive_1000"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            }`}
                          >
                            {ent.milestoneKey === "exclusive_1000"
                              ? "Exclusive (1,000 pts)"
                              : "Standard (500 pts)"}
                          </span>

                          {ent.isOverdue && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                              Overdue ({ent.ageHours}h)
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-white">
                          {ent.clientName || "Customer"}
                        </h4>
                      </div>

                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {ent.pointsSnapshot} pts
                      </span>
                    </div>

                    {/* Client phone with audited reveal */}
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span className="font-mono">
                        {revealedPhones[ent.clientId] || ent.clientPhoneMasked}
                      </span>
                      {!revealedPhones[ent.clientId] && (
                        <button
                          type="button"
                          onClick={() => handleRevealPhone(ent.clientId)}
                          disabled={revealingId === ent.clientId}
                          className="text-[10px] text-sky-400 hover:text-sky-300 underline font-semibold transition"
                        >
                          {revealingId === ent.clientId ? "Revealing..." : "Reveal"}
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Reached on {new Date(ent.createdAt).toLocaleString()} &bull; {ent.ageHours} hours ago
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setStepUpModal({
                          action: "reject",
                          entitlementId: ent.id,
                          clientName: ent.clientName,
                          milestone: ent.milestoneKey,
                        })
                      }
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 text-xs font-semibold border border-white/10 transition"
                    >
                      Reject...
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setStepUpModal({
                          action: "approve",
                          entitlementId: ent.id,
                          clientName: ent.clientName,
                          milestone: ent.milestoneKey,
                        })
                      }
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition"
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve Reward</span>
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">Approvals Queue is Clean</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                All earned client milestones have been reviewed. New milestones will appear here for admin step-up approval.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4. TAB 2: OVERVIEW & ROI ANALYSIS */}
      {activeTab === "OVERVIEW" && (
        <div className="space-y-6">
          {/* Revenue & Reward Cost Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-2xl space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Referred Customer Revenue
              </span>
              <span className="text-3xl font-extrabold font-mono text-white block">
                KES {(overview?.kpis.financials.revenueFromReferredClientsKes || 0).toLocaleString()}
              </span>
              <p className="text-xs text-slate-400">
                Total delivered and verified M-Pesa payments from referred customers.
              </p>
            </GlassCard>

            <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-2xl space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Total Reward Voucher Cost
              </span>
              <span className="text-3xl font-extrabold font-mono text-amber-400 block">
                KES {(overview?.kpis.financials.totalRewardCostKes || 0).toLocaleString()}
              </span>
              <p className="text-xs text-slate-400">
                Discounts redeemed on delivered orders via milestone vouchers.
              </p>
            </GlassCard>

            <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-2xl space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                Net Profit Contribution
              </span>
              <span className="text-3xl font-extrabold font-mono text-white block">
                KES {(overview?.kpis.financials.netGainKes || 0).toLocaleString()}
              </span>
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <span>ROI: +{overview?.kpis.financials.roiPercentage || 0}%</span>
                <span className="text-slate-500 font-normal">
                  ({overview?.kpis.financials.formula})
                </span>
              </div>
            </GlassCard>
          </div>

          {/* Funnel Pipeline */}
          <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              Referral Pipeline Funnel
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "1. Link Visits", count: overview?.kpis.funnel.linkVisits || 0 },
                { label: "2. Signups", count: overview?.kpis.funnel.signups || 0 },
                { label: "3. Booked", count: overview?.kpis.funnel.booked || 0 },
                { label: "4. Delivered", count: overview?.kpis.funnel.delivered || 0 },
                { label: "5. Qualified", count: overview?.kpis.funnel.qualified || 0 },
              ].map((step, idx) => (
                <div
                  key={step.label}
                  className="p-4 rounded-xl bg-slate-950/70 border border-white/5 space-y-1"
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    {step.label}
                  </span>
                  <span className="text-2xl font-mono font-extrabold text-white block">
                    {step.count}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Top Referrers */}
          <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              Top Referrer Champions
            </h3>

            {overview?.topReferrers && overview.topReferrers.length > 0 ? (
              <div className="divide-y divide-white/5">
                {overview.topReferrers.map((ref) => (
                  <div
                    key={ref.id}
                    className="py-3 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="font-bold text-white block">{ref.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {ref.phoneMasked} &bull; Code: {ref.code}
                      </span>
                    </div>

                    <div className="text-right space-y-0.5">
                      <span className="font-mono font-bold text-emerald-400 block">
                        {ref.qualifiedCount} Qualified
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block">
                        KES {ref.revenueGeneratedKes.toLocaleString()} Generated
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-4">No top referrers recorded yet.</p>
            )}
          </GlassCard>
        </div>
      )}

      {/* 5. TAB 3: VOUCHERS WALLET & GRANTS */}
      {activeTab === "VOUCHERS" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {["ALL", "available", "redeemed", "expired", "voided"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setVoucherFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition ${
                    voucherFilter === f
                      ? "bg-sky-500 text-white font-bold"
                      : "bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search voucher code or client..."
                value={voucherSearch}
                onChange={(e) => setVoucherSearch(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500"
              />
            </div>
          </div>

          {loadingVouchers ? (
            <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
              Loading vouchers...
            </div>
          ) : filteredVouchers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredVouchers.map((v) => (
                <GlassCard
                  key={v.id}
                  className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono font-extrabold text-emerald-400 text-base">
                        {v.code}
                      </span>
                      <h4 className="text-xs font-bold text-white mt-0.5">
                        {v.clientName}
                      </h4>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        v.status === "available"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : v.status === "redeemed"
                          ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                          : "bg-white/10 text-slate-400"
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1">
                    <p>Capped at KES {v.maxDiscountKes} &bull; Source: {v.source}</p>
                    <p>Expires: {new Date(v.expiresAt).toLocaleDateString()}</p>
                  </div>

                  {v.status === "available" && (
                    <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleExtendVoucher(v.id)}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
                      >
                        Extend +30d
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setVoidModal({
                            type: "voucher",
                            id: v.id,
                            targetName: `Voucher ${v.code}`,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold"
                      >
                        Void
                      </button>
                    </div>
                  )}
                </GlassCard>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              No vouchers match the selected filter.
            </div>
          )}
        </div>
      )}

      {/* 6. TAB 4: REFERRAL EXPLORER */}
      {activeTab === "REFERRALS" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2">
            {["ALL", "qualified", "booked", "delivered", "flagged", "voided"].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setReferralFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition ${
                  referralFilter === f
                    ? "bg-sky-500 text-white font-bold"
                    : "bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {loadingReferrals ? (
            <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
              Loading referrals...
            </div>
          ) : referralsList.length > 0 ? (
            <div className="space-y-3">
              {referralsList.map((r) => (
                <GlassCard
                  key={r.id}
                  className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">
                        {r.referrer.name} &rarr; {r.referee.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          r.status === "qualified"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : r.status === "flagged"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-white/10 text-slate-300"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Code: {r.code} &bull; Created: {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {r.status !== "voided" && (
                      <button
                        type="button"
                        onClick={() =>
                          setVoidModal({
                            type: "referral",
                            id: r.id,
                            targetName: `${r.referrer.name} -> ${r.referee.name}`,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold"
                      >
                        Void
                      </button>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              No referrals found matching the filter.
            </div>
          )}
        </div>
      )}

      {/* 7. TAB 5: FRAUD QUEUE */}
      {activeTab === "FRAUD_QUEUE" && (
        <div className="space-y-4">
          <div className="pb-2 border-b border-white/10">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Flagged Suspicious Referrals
            </h3>
            <p className="text-xs text-slate-400">
              Referrals flagged by self-referral, matching M-Pesa payers, or device fingerprint checks
            </p>
          </div>

          {flaggedReferrals.length > 0 ? (
            <div className="space-y-3">
              {flaggedReferrals.map((r) => (
                <GlassCard
                  key={r.id}
                  className="p-5 rounded-2xl bg-rose-950/20 border border-rose-500/40 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {r.referrer.name} &rarr; {r.referee.name}
                      </h4>
                      <p className="text-xs text-rose-300 mt-1">
                        Signals: {JSON.stringify(r.flagSignals || "Matching phone/device signals")}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setVoidModal({
                          type: "referral",
                          id: r.id,
                          targetName: `${r.referrer.name} -> ${r.referee.name}`,
                        })
                      }
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/30"
                    >
                      Void Referral
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Fraud Queue Clean</h4>
              <p className="text-xs text-slate-400">Zero flagged referrals at this time.</p>
            </div>
          )}
        </div>
      )}

      {/* 8. TAB 6: PROGRAM SETTINGS (Versioned) */}
      {activeTab === "SETTINGS" && (
        <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-3xl space-y-6 max-w-3xl">
          <div className="pb-3 border-b border-white/10">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              Versioned Program Settings
            </h3>
            <p className="text-xs text-slate-400">
              Saving creates an immutable new version row in the database with admin audit logs.
            </p>
          </div>

          {settingsMsg && (
            <div className="p-3.5 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-200 text-xs">
              {settingsMsg}
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Standard Milestone (Referral Points)
                </label>
                <input
                  type="number"
                  min={100}
                  step={50}
                  value={settingsForm.standardRewardMilestonePoints}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      standardRewardMilestonePoints: Number(e.target.value),
                    })
                  }
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Exclusive Milestone (Referral Points)
                </label>
                <input
                  type="number"
                  min={200}
                  step={50}
                  value={settingsForm.exclusiveRewardMilestonePoints}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      exclusiveRewardMilestonePoints: Number(e.target.value),
                    })
                  }
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Standard Reward Cap (KES)
                </label>
                <input
                  type="number"
                  min={100}
                  value={settingsForm.standardRewardMaxCapKes}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      standardRewardMaxCapKes: Number(e.target.value),
                    })
                  }
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Exclusive Reward Cap (KES)
                </label>
                <input
                  type="number"
                  min={100}
                  value={settingsForm.exclusiveRewardMaxCapKes}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      exclusiveRewardMaxCapKes: Number(e.target.value),
                    })
                  }
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Loyalty Points per Paid Order
                </label>
                <input
                  type="number"
                  min={1}
                  value={settingsForm.loyaltyPointsPerPaidOrder}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      loyaltyPointsPerPaidOrder: Number(e.target.value),
                    })
                  }
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Loyalty Points for Free Wash
                </label>
                <input
                  type="number"
                  min={10}
                  value={settingsForm.loyaltyRedemptionPoints}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      loyaltyRedemptionPoints: Number(e.target.value),
                    })
                  }
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Minimum Qualifying Order (MOV in KES)
                </label>
                <input
                  type="number"
                  min={100}
                  value={settingsForm.minOrderValueKes}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      minOrderValueKes: Number(e.target.value),
                    })
                  }
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Voucher Validity (Days)
                </label>
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={settingsForm.voucherValidityDays}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      voucherValidityDays: Number(e.target.value),
                    })
                  }
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Admin Alert Phone Number
                </label>
                <input
                  type="tel"
                  value={settingsForm.adminAlertPhone}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      adminAlertPhone: e.target.value,
                    })
                  }
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Annual Milestone Cap per Client
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={settingsForm.annualRewardCap}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      annualRewardCap: Number(e.target.value),
                    })
                  }
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            {/* WhatsApp Template */}
            <div className="space-y-1.5 pt-2">
              <label className="text-slate-300 font-semibold block">
                Client WhatsApp Share Template (must contain &#123;&#123;shareUrl&#125;&#125;)
              </label>
              <textarea
                rows={3}
                value={settingsForm.whatsappTemplateReferralShare}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    whatsappTemplateReferralShare: e.target.value,
                  })
                }
                required
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white text-xs font-mono"
              />
            </div>

            <div className="pt-3 border-t border-white/10 flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition flex items-center gap-2"
              >
                {savingSettings ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Save New Settings Version</span>
                )}
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* STEP-UP ADMIN MODAL (For Approvals / Rejections) */}
      {stepUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <form
            onSubmit={handleExecuteStepUpAction}
            className="max-w-md w-full p-6 rounded-3xl bg-slate-900 border border-white/15 shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-center gap-2.5 pb-2 border-b border-white/10">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  stepUpModal.action === "approve"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                }`}
              >
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Step-Up Authentication Required
                </h3>
                <p className="text-[11px] text-slate-400">
                  {stepUpModal.action === "approve"
                    ? `Approve reward voucher for ${stepUpModal.clientName}`
                    : `Reject reward for ${stepUpModal.clientName}`}
                </p>
              </div>
            </div>

            {stepUpError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {stepUpError}
              </div>
            )}

            {stepUpModal.action === "reject" && (
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Rejection Reason (Audited & Logged)
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Suspicious duplicate device detected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-2.5 text-white"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold block">
                Confirm Admin Password
              </label>
              <input
                type="password"
                placeholder="Enter your admin password"
                value={stepUpPassword}
                onChange={(e) => setStepUpPassword(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setStepUpModal(null);
                  setStepUpPassword("");
                  setRejectReason("");
                  setStepUpError(null);
                }}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingStepUp}
                className={`px-5 py-2 rounded-xl font-bold text-white transition shadow-md ${
                  stepUpModal.action === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                    : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                }`}
              >
                {submittingStepUp ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : stepUpModal.action === "approve" ? (
                  "Confirm Approval"
                ) : (
                  "Confirm Rejection"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VOID CONFIRMATION MODAL */}
      {voidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="max-w-md w-full p-6 rounded-3xl bg-slate-900 border border-rose-500/40 shadow-2xl space-y-4 text-xs">
            <h3 className="text-base font-bold text-white">Void {voidModal.type}</h3>
            <p className="text-slate-300">
              Please enter an audited reason for voiding <strong>{voidModal.targetName}</strong>:
            </p>

            <textarea
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Order cancelled or fraudulent activity..."
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-rose-400"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setVoidModal(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={voiding || !voidReason.trim()}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-600/25 disabled:opacity-50"
              >
                {voiding ? "Voiding..." : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
