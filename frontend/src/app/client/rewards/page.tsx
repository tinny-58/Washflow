"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Gift,
  Sparkles,
  Share2,
  Copy,
  Check,
  Tag,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Users,
  Award,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Info,
  HelpCircle,
  Flame,
  QrCode,
  TrendingUp,
  FileText,
  BadgeCheck,
  AlertTriangle,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { ReferralQrCard } from "@/components/shared/qr-generator";

interface CatalogOption {
  id: string;
  name: string;
  variant: string;
  basePrice: number;
  imageUrl?: string | null;
  description?: string | null;
}

interface ClientRewardsData {
  header: {
    referralPoints: number;
    cumulativeReferralPoints: number;
    loyaltyPoints: number;
    nextReward: {
      name: string;
      pointsNeeded: number;
      targetPoints: number;
      currentPoints: number;
    };
  };
  share: {
    code: string;
    shareUrl: string;
    whatsappShareLink: string;
    renderedShareText: string;
  };
  milestones: {
    standard: {
      targetPoints: number;
      currentPoints: number;
      isReached: boolean;
      capKes: number;
      options: CatalogOption[];
    };
    exclusive: {
      targetPoints: number;
      currentPoints: number;
      isReached: boolean;
      capKes: number;
      options: CatalogOption[];
    };
  };
  funnel: {
    linkVisits: number;
    signedUp: number;
    booked: number;
    delivered: number;
    qualified: number;
  };
  referees: Array<{
    id: string;
    name: string;
    status: string;
    stage: string;
    whyPending: string;
    signedUpDate: string;
    qualifiedDate?: string;
  }>;
  wallet: {
    pendingApproval: Array<{
      id: string;
      milestoneKey: string;
      title: string;
      pointsSnapshot: number;
      status: string;
      createdAt: string;
    }>;
    approved: Array<{
      id: string;
      code: string;
      status: string;
      maxDiscountKes: number;
      expiresAt: string;
      eligibleItemIds?: string[] | null;
      createdAt: string;
    }>;
    used: Array<{
      id: string;
      code: string;
      status: string;
      maxDiscountKes: number;
      expiresAt: string;
      redeemedAt?: string;
      createdAt: string;
    }>;
    expired: Array<{
      id: string;
      code: string;
      status: string;
      maxDiscountKes: number;
      expiresAt: string;
      createdAt: string;
    }>;
  };
  loyalty: {
    pointsBalance: number;
    pointsPerBooking: number;
    progressCurrent: number;
    progressTarget: number;
    pointsToNextReward: number;
    rewardDescription: string;
    history: Array<{
      id: string;
      delta: number;
      reason: string;
      balanceAfter: number;
      createdAt: string;
    }>;
  };
  programRules: {
    standardRewardMilestonePoints: number;
    exclusiveRewardMilestonePoints: number;
    minOrderValueKes: number;
    standardRewardCapKes: number;
    exclusiveRewardCapKes: number;
    voucherValidityDays: number;
    version: number;
    programActive: boolean;
  };
}

export default function ClientRewardsPage() {
  const [data, setData] = useState<ClientRewardsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [walletTab, setWalletTab] = useState<
    "READY" | "PENDING" | "USED" | "EXPIRED"
  >("READY");
  const [rulesOpen, setRulesOpen] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  const fetchRewards = useCallback(async () => {
    try {
      const res = await fetch("/api/client/rewards", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json);
        }
      }
    } catch (err) {
      console.error("Failed to fetch rewards:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRewards();

    const handleRefresh = () => fetchRewards();
    window.addEventListener("client-refresh", handleRefresh);
    return () => window.removeEventListener("client-refresh", handleRefresh);
  }, [fetchRewards]);

  const copyShareUrl = async () => {
    if (!data?.share.shareUrl) return;
    try {
      await navigator.clipboard.writeText(data.share.shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {}
  };

  const copyReferralCode = async () => {
    if (!data?.share.code) return;
    try {
      await navigator.clipboard.writeText(data.share.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {}
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-pulse p-4 sm:p-6">
        <div className="h-56 rounded-3xl bg-slate-900/60 border border-white/10" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="h-44 rounded-2xl bg-slate-900/60 border border-white/10" />
          <div className="h-44 rounded-2xl bg-slate-900/60 border border-white/10" />
          <div className="h-44 rounded-2xl bg-slate-900/60 border border-white/10" />
        </div>
      </div>
    );
  }

  const header = data?.header;
  const share = data?.share;
  const milestones = data?.milestones;
  const funnel = data?.funnel;
  const referees = data?.referees || [];
  const wallet = data?.wallet;
  const loyalty = data?.loyalty;
  const rules = data?.programRules;

  // Wallet list by tab
  const readyVouchers = wallet?.approved || [];
  const pendingEntitlements = wallet?.pendingApproval || [];
  const usedVouchers = wallet?.used || [];
  const expiredVouchers = wallet?.expired || [];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 p-3 sm:p-6">
      {/* ==================================================================== */}
      {/* 1. HEADER: POINTS BALANCES & NEXT REWARD PROGRESS */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card A: Referral Points */}
        <GlassCard className="p-5 sm:p-6 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-emerald-950/30 border border-emerald-500/20 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              Referral Balance
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {header?.cumulativeReferralPoints || 0} pts lifetime
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
              {header?.referralPoints || 0}
            </span>
            <span className="text-xs font-semibold text-emerald-400">POINTS</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Earn <strong>100 points</strong> for every friend whose first wash is delivered and paid.
          </p>
        </GlassCard>

        {/* Card B: Loyalty Points */}
        <GlassCard className="p-5 sm:p-6 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-sky-950/30 border border-sky-500/20 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              Loyalty Balance
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              +{loyalty?.pointsPerBooking || 10} pts / wash
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
              {header?.loyaltyPoints || 0}
            </span>
            <span className="text-xs font-semibold text-sky-400">POINTS</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Earn <strong>10 points</strong> on every completed paid order. 100 points = 1 free wash!
          </p>
        </GlassCard>

        {/* Card C: Next Reward Roadmap */}
        <GlassCard className="p-5 sm:p-6 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-amber-950/30 border border-amber-500/20 rounded-2xl space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-400" />
                Next Milestone
              </span>
              <span className="text-[11px] font-mono font-bold text-amber-300">
                {header?.nextReward.pointsNeeded || 0} pts to unlock
              </span>
            </div>
            <h4 className="text-sm font-bold text-white line-clamp-1">
              {header?.nextReward.name}
            </h4>
          </div>

          <div className="space-y-1.5">
            <div className="w-full h-2.5 rounded-full bg-white/5 border border-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      ((header?.nextReward.currentPoints || 0) /
                        (header?.nextReward.targetPoints || 500)) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>{header?.nextReward.currentPoints || 0} pts</span>
              <span>{header?.nextReward.targetPoints || 500} pts</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* ==================================================================== */}
      {/* 2. SHARE CARD: PERSONAL LINK, CODE, COPY, WA.ME, QR */}
      {/* ==================================================================== */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-emerald-950/90 via-slate-950 to-teal-950/80 border border-emerald-500/30 shadow-2xl backdrop-blur-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left: Message & Value Proposition */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Official Invite Link
              </span>
              <span className="text-slate-400 text-xs">Share & Earn Together</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
              Invite friends to WashFlow. <br className="hidden sm:inline" />
              Earn Free Washes automatically.
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
              Give your unique link to neighbors, colleagues and friends. When their first order is delivered and paid (min KES {rules?.minOrderValueKes.toLocaleString() || 300}), you receive <strong>100 referral points</strong> toward free laundry hampers, duvets, and mats!
            </p>

            {/* Quick Link & Code Pill */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 flex-1 min-w-0">
                <span className="font-mono text-xs text-slate-300 truncate mr-2 select-all">
                  {share?.shareUrl}
                </span>
                <button
                  type="button"
                  onClick={copyShareUrl}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 transition shrink-0"
                  title="Copy share link"
                >
                  {copiedLink ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedLink ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 shrink-0 gap-3">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Code</span>
                  <span className="font-mono text-xs font-extrabold text-emerald-400 tracking-wider">
                    {share?.code}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={copyReferralCode}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition"
                  title="Copy code only"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href={share?.whatsappShareLink || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition"
              >
                <Share2 className="w-4 h-4" />
                <span>Share on WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={() => setShowQrModal(!showQrModal)}
                className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition"
              >
                <QrCode className="w-4 h-4 text-sky-400" />
                <span>{showQrModal ? "Hide QR Code" : "Show QR Code"}</span>
              </button>
            </div>
          </div>

          {/* Right: Interactive / Downloadable QR Component */}
          <div className="lg:col-span-5 flex justify-center">
            {share?.shareUrl && share?.code && (
              <ReferralQrCard
                value={share.shareUrl}
                code={share.code}
                className="w-full max-w-xs shadow-2xl"
              />
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. MILESTONE TRACKER: 500 PTS (STANDARD) & 1,000 PTS (EXCLUSIVE) */}
      {/* ==================================================================== */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-extrabold text-white tracking-tight flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              Milestone Rewards Tracker
            </h3>
            <p className="text-xs text-slate-400">
              Reach point thresholds to earn free laundry vouchers capped at catalog values.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Admin Review triggers automatically upon reaching each milestone</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Milestone 1: Standard Reward (500 pts) */}
          <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-3xl space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      500 Points (5 Referrals)
                    </span>
                    {milestones?.standard.isReached && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Reached
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-bold text-white">
                    Standard Reward (Choice of 1 Free Wash)
                  </h4>
                  <p className="text-xs text-slate-400">
                    Max value cap: <strong>KES {milestones?.standard.capKes || 300}</strong>. Valid for 90 days.
                  </p>
                </div>

                <div className="text-right">
                  <span className="font-mono text-base font-extrabold text-emerald-400 block">
                    {milestones?.standard.currentPoints || 0} / 500
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">pts</span>
                </div>
              </div>

              {/* Visual Reward Options (from real catalog) */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                  Choose 1 when booking:
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  {(milestones?.standard.options || []).map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-slate-950/70 border border-white/10 flex flex-col justify-between text-center group hover:border-emerald-500/40 transition"
                    >
                      <div className="w-10 h-10 mx-auto rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 mb-2 overflow-hidden">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Gift className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-white block line-clamp-1">
                          {item.variant || item.name}
                        </span>
                        <span className="text-[10px] font-mono font-semibold text-slate-400 block">
                          KES {item.basePrice}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Milestone Progress Bar */}
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      ((milestones?.standard.currentPoints || 0) / 500) * 100
                    )}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {milestones?.standard.isReached
                  ? "Milestone achieved! If your reward is pending approval, admin review will release it shortly."
                  : `${500 - (milestones?.standard.currentPoints || 0)} more points needed to unlock the Standard Reward.`}
              </p>
            </div>
          </GlassCard>

          {/* Milestone 2: Exclusive Reward (1,000 pts) */}
          <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-3xl space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      1,000 Points (10 Referrals)
                    </span>
                    {milestones?.exclusive.isReached && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Reached
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-bold text-white">
                    Exclusive Reward (Free Large Basket)
                  </h4>
                  <p className="text-xs text-slate-400">
                    Max value cap: <strong>KES {milestones?.exclusive.capKes || 450}</strong> (up to 15 kg). Valid for 90 days.
                  </p>
                </div>

                <div className="text-right">
                  <span className="font-mono text-base font-extrabold text-amber-400 block">
                    {milestones?.exclusive.currentPoints || 0} / 1000
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">pts</span>
                </div>
              </div>

              {/* Visual Exclusive Option */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                  Reward Item:
                </span>
                <div className="grid grid-cols-1 gap-2.5">
                  {(milestones?.exclusive.options || []).slice(0, 1).map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10 flex items-center gap-4 group hover:border-amber-500/40 transition"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 overflow-hidden shrink-0">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Gift className="w-6 h-6 text-amber-400" />
                        )}
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="text-sm font-bold text-white block truncate">
                          {item.variant || item.name}
                        </span>
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {item.description || "Washed, dried, folded, up to 15 kg."}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-bold text-amber-400 block">
                          KES {item.basePrice}
                        </span>
                        <span className="text-[9px] uppercase font-bold text-emerald-400">100% Free</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Milestone Progress Bar */}
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      ((milestones?.exclusive.currentPoints || 0) / 1000) * 100
                    )}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {milestones?.exclusive.isReached
                  ? "Exclusive Milestone reached! Thank you for being a WashFlow champion."
                  : `${1000 - (milestones?.exclusive.currentPoints || 0)} more points needed to unlock the Exclusive Reward.`}
              </p>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. LINK FUNNEL & CONVERSION METRICS */}
      {/* ==================================================================== */}
      <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-3xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              Your Personal Referral Funnel
            </h3>
            <p className="text-xs text-slate-400">
              Live progression of clients visiting through your unique link
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
            {funnel?.qualified || 0} / {funnel?.signedUp || 0} Qualified
          </span>
        </div>

        {/* 5-step horizontal funnel */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "1. Link Visits", count: funnel?.linkVisits || 0, desc: "Visitors on your link" },
            { label: "2. Signed Up", count: funnel?.signedUp || 0, desc: "Accounts created" },
            { label: "3. Booked", count: funnel?.booked || 0, desc: "1st wash ordered" },
            { label: "4. Delivered", count: funnel?.delivered || 0, desc: "Laundry delivered" },
            { label: "5. Qualified", count: funnel?.qualified || 0, desc: "M-Pesa paid (+100 pts)" },
          ].map((step, idx) => (
            <div
              key={step.label}
              className={`p-3.5 rounded-2xl border flex flex-col justify-between space-y-1 transition ${
                idx === 4 && (funnel?.qualified || 0) > 0
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-950/60 border-white/5 text-slate-400"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block">
                {step.label}
              </span>
              <span className="font-mono text-2xl font-extrabold text-white">
                {step.count}
              </span>
              <span className="text-[10px] text-slate-400 block line-clamp-1">
                {step.desc}
              </span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* ==================================================================== */}
      {/* 5. REFEREE TRACKER: PRIVACY-PROTECTED "J•••" WITH STAGE CHIPS */}
      {/* ==================================================================== */}
      <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-3xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Referred Friends Progress
            </h3>
            <p className="text-xs text-slate-400">
              For privacy, personal contact info and order amounts are masked.
            </p>
          </div>

          <span className="text-xs font-mono text-slate-400">
            {referees.length} total invitees
          </span>
        </div>

        {referees.length > 0 ? (
          <div className="divide-y divide-white/5">
            {referees.map((ref) => {
              const isQualified = ref.status === "qualified" || ref.status === "COMPLETED";

              return (
                <div
                  key={ref.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 max-w-md">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">
                        {ref.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isQualified
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : ref.stage === "Under review"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-white/10 text-slate-300 border border-white/10"
                        }`}
                      >
                        {ref.stage}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {ref.whyPending}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 block font-mono">
                        Joined {new Date(ref.signedUpDate).toLocaleDateString()}
                      </span>
                      {ref.qualifiedDate && (
                        <span className="text-[10px] text-emerald-400 font-bold block font-mono">
                          Qualified {new Date(ref.qualifiedDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
              <Users className="w-6 h-6 text-slate-400" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h4 className="text-sm font-bold text-white">No Friends Referred Yet</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Share your personal link above with friends and neighbors. When they register and complete their first wash, you will see their progress right here!
              </p>
            </div>
          </div>
        )}
      </GlassCard>

      {/* ==================================================================== */}
      {/* 6. REWARDS WALLET (READY, PENDING APPROVAL, USED, EXPIRED) */}
      {/* ==================================================================== */}
      <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-3xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/10">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Gift className="w-4 h-4 text-emerald-400" />
              Rewards Wallet
            </h3>
            <p className="text-xs text-slate-400">
              View your approved free wash vouchers and pending milestone approvals
            </p>
          </div>

          {/* Wallet Tabs */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-2xl border border-white/10 text-xs">
            {[
              { key: "READY" as const, label: "Ready to Redeem", count: readyVouchers.length },
              { key: "PENDING" as const, label: "Pending Approval", count: pendingEntitlements.length },
              { key: "USED" as const, label: "Used", count: usedVouchers.length },
              { key: "EXPIRED" as const, label: "Expired", count: expiredVouchers.length },
            ].map((tab) => {
              const active = walletTab === tab.key;
              return (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => setWalletTab(tab.key)}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${
                    active
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      active ? "bg-white/20 text-white" : "bg-white/10 text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab 1: Ready to Redeem */}
        {walletTab === "READY" && (
          <div>
            {readyVouchers.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {readyVouchers.map((v) => {
                  const daysLeft = Math.ceil(
                    (new Date(v.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  );

                  return (
                    <div
                      key={v.id}
                      className="p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-950 to-emerald-950/30 border border-emerald-500/30 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-extrabold text-emerald-400 text-base tracking-wider">
                            {v.code}
                          </span>
                          <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            Approved
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          <h4 className="text-sm font-bold text-white">
                            Free Wash Reward (Capped at KES {v.maxDiscountKes})
                          </h4>
                          <p className="text-xs text-slate-400">
                            Apply at booking for 1 free wash line. Any excess is billed normally.
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-400 font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {daysLeft > 0 ? `Expires in ${daysLeft} days` : "Expires today"}
                          </span>
                        </div>

                        <Link
                          href={`/client/book?voucher=${v.code}`}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition"
                        >
                          <span>Apply at Booking</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  You have no approved vouchers ready to redeem right now. Keep referring friends or completing washes to earn!
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Pending Approval */}
        {walletTab === "PENDING" && (
          <div>
            {pendingEntitlements.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pendingEntitlements.map((e) => (
                  <div
                    key={e.id}
                    className="p-5 rounded-2xl bg-slate-950/70 border border-amber-500/30 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> Under Admin Review
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(e.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white">{e.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Congratulations on reaching {e.pointsSnapshot} points! For safety and fraud checks, your reward is being reviewed by our administrative team. Once approved, your voucher will immediately appear in your wallet.
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  No rewards currently awaiting admin approval.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Used */}
        {walletTab === "USED" && (
          <div>
            {usedVouchers.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {usedVouchers.map((v) => (
                  <div
                    key={v.id}
                    className="p-4 rounded-2xl bg-slate-950/50 border border-white/5 space-y-1.5 opacity-75"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-300 text-sm">
                        {v.code}
                      </span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-400">
                        Redeemed
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Redeemed on {new Date(v.redeemedAt || v.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No redeemed vouchers found.
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Expired */}
        {walletTab === "EXPIRED" && (
          <div>
            {expiredVouchers.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {expiredVouchers.map((v) => (
                  <div
                    key={v.id}
                    className="p-4 rounded-2xl bg-slate-950/50 border border-rose-500/20 space-y-1.5 opacity-75"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-300 text-sm">
                        {v.code}
                      </span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                        Expired
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Expired on {new Date(v.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No expired vouchers found.
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* ==================================================================== */}
      {/* 7. LOYALTY SECTION & POINTS LEDGER */}
      {/* ==================================================================== */}
      <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-3xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Award className="w-5 h-4 text-sky-400" />
              Loyalty Points & History
            </h3>
            <p className="text-xs text-slate-400">
              Earn +10 loyalty points on every paid wash. Every 100 points = 1 free Small Basket wash!
            </p>
          </div>

          <div className="text-right">
            <span className="font-mono text-xl font-extrabold text-sky-400">
              {loyalty?.pointsBalance || 0}
            </span>
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
              Loyalty Points
            </span>
          </div>
        </div>

        {/* Progress towards 100 points */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-white">Progress toward Free Wash</span>
            <span className="text-sky-400 font-mono">
              {loyalty?.progressCurrent || 0} / {loyalty?.progressTarget || 100} pts
            </span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-white/5 border border-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(
                  100,
                  ((loyalty?.progressCurrent || 0) / (loyalty?.progressTarget || 100)) *
                    100
                )}%`,
              }}
            />
          </div>

          <p className="text-[11px] text-slate-400">
            {loyalty?.pointsToNextReward || 100} more loyalty points needed to claim {loyalty?.rewardDescription}.
          </p>
        </div>

        {/* Recent Points Ledger History */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Recent Points Activity
          </h4>

          {loyalty?.history && loyalty.history.length > 0 ? (
            <div className="divide-y divide-white/5">
              {loyalty.history.map((item) => (
                <div
                  key={item.id}
                  className="py-2.5 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-semibold text-slate-200 block">
                      {item.reason}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-mono font-bold ${
                        item.delta > 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {item.delta > 0 ? `+${item.delta}` : item.delta} pts
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      Bal: {item.balanceAfter}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-3">
              No recent loyalty points activity yet. Complete a wash to earn your first +10 points!
            </p>
          )}
        </div>
      </GlassCard>

      {/* ==================================================================== */}
      {/* 8. LIVE VERSIONED PROGRAM RULES SHEET */}
      {/* ==================================================================== */}
      <GlassCard className="p-6 bg-slate-900/80 border border-white/10 rounded-3xl space-y-4">
        <button
          type="button"
          onClick={() => setRulesOpen(!rulesOpen)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Program Terms & Rewards Policy
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Version {rules?.version || 1} &bull; Active Fair Play Rules
              </p>
            </div>
          </div>

          {rulesOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {rulesOpen && (
          <div className="pt-4 border-t border-white/10 space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="p-3.5 rounded-2xl bg-white/5 space-y-1">
              <strong className="text-white block font-semibold">
                1. Referral Qualification Criteria:
              </strong>
              <p>
                A referral qualifies exclusively when the referred client is a genuinely new customer, their first order reaches <strong>DELIVERED</strong> status, payment is verified via M-Pesa for at least <strong>KES {rules?.minOrderValueKes || 300}</strong>, no refund or cancellation occurs, and security checks pass. Referrer earns 100 points per qualified referral.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 space-y-1">
              <strong className="text-white block font-semibold">
                2. Milestones & Catalog Value Caps:
              </strong>
              <p>
                At <strong>500 referral points</strong>, the Standard Reward unlocks (1 free wash from Small Basket up to 7 kg, Single Duvet, or Small Doormat, capped at KES {rules?.standardRewardCapKes || 300}). At <strong>1,000 referral points</strong>, the Exclusive Reward unlocks (1 free Large Basket up to 15 kg, capped at KES {rules?.exclusiveRewardCapKes || 450}).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 space-y-1">
              <strong className="text-white block font-semibold">
                3. Loyalty Points Earning & Redemption:
              </strong>
              <p>
                Earn 10 loyalty points for every completed booking that is delivered and paid. Orders paid entirely with a reward voucher earn 0 points. Accumulating 100 loyalty points entitles the client to 1 free Small Basket wash (capped at KES 300).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 space-y-1">
              <strong className="text-white block font-semibold">
                4. Admin Review & Voucher Validity:
              </strong>
              <p>
                All milestone rewards undergo administrative review prior to release. Issued vouchers are non-transferable, valid for <strong>{rules?.voucherValidityDays || 90} days</strong>, and cannot be stacked. One voucher may be redeemed per booking.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 space-y-1">
              <strong className="text-white block font-semibold">
                5. Fraud Prevention & Disqualifications:
              </strong>
              <p>
                Self-referrals, matching M-Pesa numbers, duplicate device accounts, or automated referral rings are strictly prohibited and will void points without notice.
              </p>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
