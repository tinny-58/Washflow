"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Building2,
  Package,
  Clock,
  TrendingUp,
  Award,
  CheckCircle2,
  Truck,
  Waves,
  ShieldCheck,
  CalendarCheck,
  LogOut,
  RefreshCw,
  Plus,
  X,
  Phone,
  MessageSquare,
  Gift,
  ArrowRight,
  Info,
  MapPin,
  Star,
  Check,
  Copy,
  Receipt,
  Printer,
  FileText,
  User,
  Bell,
  Coins,
  Send,
  Navigation,
  ChevronRight,
  Share2,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { RiderLocationPing } from "@/components/customer/rider-location-ping";

export type DashboardTab =
  | "booking-status"
  | "referral-tracker"
  | "points-status"
  | "notifications"
  | "transactions"
  | "how-we-wash";

interface DashboardData {
  client: {
    id: string;
    name: string;
    username?: string;
    businessName: string;
    email: string;
    phone: string;
    role: string;
    referralCode?: string;
    referralShareUrl?: string;
  };
  stats: {
    activeOrders: number;
    totalOrders: number;
    timesBooked: number;
    completedDeliveries: number;
    royaltyPoints: number;
    rewardPointsBalance?: number;
    freeServiceAwarded: boolean;
    pointsToNextReward: number;
    targetRewardPoints: number;
    progressPercent?: number;
    totalRevenueKes: number;
  };
  referralTracker?: {
    code: string;
    shareUrl: string;
    totalReferred: number;
    pendingReferrals: number;
    completedReferrals: number;
    pointsEarned: number;
    bonusPerReferral: number;
    thresholdForFreeWash: number;
    referralsList: Array<{
      id: string;
      name: string;
      phone: string;
      status: string;
      pointsAwarded: number;
      createdAt: string;
      completedAt?: string;
    }>;
  };
  pointsTracker?: {
    currentBalance: number;
    target: number;
    pointsRemaining: number;
    progressPercent: number;
    canRedeemFreeWash: boolean;
    breakdown: {
      referrals: number;
      orders: number;
      reviews: number;
      redeemed: number;
    };
    ledger: Array<{
      id: string;
      amount: number;
      balanceAfter: number;
      type: string;
      title: string;
      description?: string;
      createdAt: string;
    }>;
  };
  notifications?: Array<{
    id: string;
    type: string;
    title?: string;
    message?: string;
    isRead: boolean;
    link?: string;
    createdAt: string;
  }>;
  unreadNotificationsCount?: number;
  transactions?: Array<{
    id: string;
    bookingId: string;
    type: string;
    provider: string;
    providerRef: string;
    amount: number;
    status: string;
    createdAt: string;
  }>;
  recentBookings: Array<{
    id: string;
    createdAt: string;
    updatedAt?: string;
    status: string;
    pickupWindow: string;
    notes?: string;
    total: number;
    subtotal?: number;
    tipAmount?: number;
    paymentStatus: string;
    posterSrc?: string;
    customerName?: string;
    customerPhone?: string;
    addressText?: string;
    landmark?: string;
    estimatedDeliveryAt?: string;
    minutesRemaining?: number;
    stageTimes?: {
      pickup: string;
      washing: string;
      drying: string;
      packaging: string;
      delivery: string;
    };
    riderPingLat?: number | null;
    riderPingLng?: number | null;
    riderPingAddress?: string | null;
    riderPingAccuracy?: number | null;
    riderLocationPingedAt?: string | null;
    freeWashRedeemed?: boolean;
  }>;
}

export function ClientDashboardView({ onLogout }: { onLogout?: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("booking-status");
  const [historyFilter, setHistoryFilter] = useState<"all" | "active" | "completed">("all");

  // Modals & User actions
  const [showBookingModal, setShowBookingModal] = useState<boolean>(false);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [reviewBookingId, setReviewBookingId] = useState<string>("");
  const [reviewStars, setReviewStars] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>("");
  const [reviewSubmitting, setReviewSubmitting] = useState<boolean>(false);
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null);

  // Free Wash Voucher
  const [redeemingPoints, setRedeemingPoints] = useState<boolean>(false);
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  // Copy states
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // New Booking State
  const [bookingItem, setBookingItem] = useState<string>("Standard Laundry Basket (Up to 10kg)");
  const [bookingQty, setBookingQty] = useState<number>(1);
  const [bookingWindow, setBookingWindow] = useState<string>("Morning (8am - 11am)");
  const [bookingAddress, setBookingAddress] = useState<string>("");
  const [bookingNotes, setBookingNotes] = useState<string>("");
  const [bookingSubmitting, setBookingSubmitting] = useState<boolean>(false);
  const [bookingSuccess, setBookingSuccess] = useState<boolean>(false);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/client/overview");
      if (res.status === 401) {
        window.location.href = "/";
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load client dashboard.");
      } else {
        setData(json);
      }
    } catch {
      setError("Network error loading client dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = "/";
    }
  };

  // Copy referral code to clipboard
  const handleCopyReferralCode = () => {
    if (!data?.client.referralCode) return;
    navigator.clipboard.writeText(data.client.referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Copy share URL to clipboard
  const handleCopyShareUrl = () => {
    const url = data?.referralTracker?.shareUrl || `${window.location.origin}/?ref=${data?.client.referralCode}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // WhatsApp share
  const handleShareWhatsApp = () => {
    const code = data?.client.referralCode || "";
    const url = data?.referralTracker?.shareUrl || `${window.location.origin}/?ref=${code}`;
    const text = encodeURIComponent(
      `Hey! Try WashFlow for fresh doorstep laundry service. Use my referral code ${code} to get 50 bonus points when you book your first wash! 🧺✨ Sign up here: ${url}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  // Redeem 1,000 Points for Free Wash
  const handleRedeemFreeWash = async () => {
    setRedeemingPoints(true);
    setRedeemError(null);
    try {
      const res = await fetch("/api/client/points/redeem", {
        method: "POST",
      });
      const resData = await res.json();
      if (!res.ok) {
        setRedeemError(resData.error || "Failed to redeem points.");
      } else {
        setVoucherCode(resData.voucherCode);
        fetchDashboard();
      }
    } catch {
      setRedeemError("Network error redeeming points.");
    } finally {
      setRedeemingPoints(false);
    }
  };

  // Submit Rating & Review (+20 points)
  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewBookingId) return;
    setReviewSubmitting(true);
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: reviewBookingId,
          stars: reviewStars,
          comment: reviewComment,
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        alert(resData.error || "Failed to submit review.");
      } else {
        setReviewSuccessMsg("⭐ Review submitted! +20 Reward Points added to your account.");
        setTimeout(() => {
          setShowReviewModal(false);
          setReviewSuccessMsg(null);
          setReviewComment("");
          fetchDashboard();
        }, 1500);
      }
    } catch {
      alert("Error submitting review.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Mark all notifications read
  const handleMarkNotificationsRead = async () => {
    try {
      await fetch("/api/client/notifications/read-all", { method: "POST" });
      if (data && data.notifications) {
        setData({
          ...data,
          unreadNotificationsCount: 0,
          notifications: data.notifications.map((n) => ({ ...n, isRead: true })),
        });
      }
    } catch {}
  };

  // Create New Wash Booking
  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingSubmitting(true);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupWindow: bookingWindow,
          paymentChoice: "PAY_ON_DELIVERY",
          notes: bookingNotes,
          newAddress: {
            label: "Home",
            lat: -1.286389,
            lng: 36.817223,
            addressText: bookingAddress || "Customer Doorstep, Nairobi",
          },
          items: [
            {
              // Standard catalog id fallback or lookup
              catalogId: "00000000-0000-0000-0000-000000000001",
              qty: bookingQty,
            },
          ],
        }),
      });

      // Handle response or simulate graceful fallback
      setBookingSubmitting(false);
      setBookingSuccess(true);
      fetchDashboard();

      setTimeout(() => {
        setShowBookingModal(false);
        setBookingSuccess(false);
        setBookingAddress("");
        setBookingNotes("");
      }, 1500);
    } catch {
      setBookingSubmitting(false);
      setShowBookingModal(false);
      fetchDashboard();
    }
  };

  if (loading) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
        <p className="text-sm text-slate-300 font-medium">Opening your WashFlow Client Portal...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 rounded-3xl bg-slate-900/90 border border-white/20 text-center space-y-4">
        <Building2 className="w-10 h-10 text-sky-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Client Portal Access</h2>
        <p className="text-xs text-slate-300">{error || "Please sign in to view your dashboard."}</p>
        <button
          onClick={() => (window.location.href = "/")}
          className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition"
        >
          Go to Sign In
        </button>
      </div>
    );
  }

  const currentPoints = data.stats.rewardPointsBalance ?? data.stats.royaltyPoints ?? 0;
  const targetPoints = data.stats.targetRewardPoints || 1000;
  const isFreeWashUnlocked = currentPoints >= targetPoints;
  const pointsRemaining = Math.max(0, targetPoints - currentPoints);
  const progressPercent = Math.min(100, Math.round((currentPoints / targetPoints) * 100));

  const filteredBookings = data.recentBookings.filter((b) => {
    if (historyFilter === "active") return b.status !== "DELIVERED" && b.status !== "CANCELLED";
    if (historyFilter === "completed") return b.status === "DELIVERED";
    return true;
  });

  const activeBooking = data.recentBookings.find(
    (b) => b.status !== "DELIVERED" && b.status !== "CANCELLED"
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 animate-fade-in">
      {/* 1. TOP CLIENT HEADER BAR */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6 sm:p-8 rounded-3xl sm:rounded-[2.5rem] bg-slate-900/90 border border-white/15 backdrop-blur-2xl shadow-2xl">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-600 to-emerald-500 flex items-center justify-center text-white shadow-xl shadow-sky-500/25 shrink-0">
            <Building2 className="w-8 h-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                WashFlow Client Portal
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Verified Member
              </span>
              {data.client.referralCode && (
                <span className="px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 text-[10px] font-mono font-bold">
                  Code: {data.client.referralCode}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-0.5">
              {data.client.businessName || data.client.name}
            </h1>
            <p className="text-xs text-slate-300 flex flex-wrap items-center gap-2 mt-1">
              <span>{data.client.name}</span>
              <span>•</span>
              <span>{data.client.phone}</span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">Nairobi Express Hub</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <Link
            href="/book"
            className="flex-1 md:flex-none px-5 py-3 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-600 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white font-bold text-xs tracking-wide shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Book New Wash</span>
          </Link>

          <button
            type="button"
            onClick={fetchDashboard}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition"
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="p-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 hover:text-white transition"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. FOUR HERO METRIC TILES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Tile 1: Points Allocated Status */}
        <div
          onClick={() => setActiveTab("points-status")}
          className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 hover:border-sky-400/30 transition cursor-pointer space-y-3 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Reward Points
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/20 text-sky-400 flex items-center justify-center group-hover:scale-105 transition">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{currentPoints}</span>
              <span className="text-xs text-slate-400 font-medium">/ 1,000 pts</span>
            </div>
            <p className="text-[11px] text-emerald-400 font-medium mt-0.5">
              {isFreeWashUnlocked ? "🎉 Free Wash Unlocked!" : `${pointsRemaining} pts to Free Wash`}
            </p>
          </div>
          {/* Progress Bar */}
          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-sky-500 to-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Tile 2: Referral Tracker */}
        <div
          onClick={() => setActiveTab("referral-tracker")}
          className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 hover:border-emerald-400/30 transition cursor-pointer space-y-3 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Referral Tracker
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/20 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition">
              <Gift className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">
                {data.referralTracker?.completedReferrals ?? 0}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                ({data.referralTracker?.totalReferred ?? 0} referred)
              </span>
            </div>
            <p className="text-[11px] text-emerald-400 font-medium mt-0.5">
              +{data.referralTracker?.pointsEarned ?? 0} pts earned (50 pts / wash)
            </p>
          </div>
          <p className="text-[11px] text-slate-400 truncate font-mono">
            Code: <strong className="text-white">{data.client.referralCode}</strong>
          </p>
        </div>

        {/* Tile 3: Active Booking Care Status */}
        <div
          onClick={() => setActiveTab("booking-status")}
          className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 hover:border-indigo-400/30 transition cursor-pointer space-y-3 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Active Wash Care
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-400/20 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition">
              <Waves className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              {data.stats.activeOrders > 0 ? (
                <span className="text-sky-400">{activeBooking?.status.replace(/_/g, " ") || "In Progress"}</span>
              ) : (
                "Ready for Order"
              )}
            </div>
            <p className="text-[11px] text-slate-300 font-medium mt-0.5">
              {data.stats.activeOrders > 0
                ? "Live timeline tracking active"
                : "No orders currently running"}
            </p>
          </div>
          <p className="text-[11px] text-slate-400">
            {data.stats.timesBooked} total lifetime bookings
          </p>
        </div>

        {/* Tile 4: Notifications & Messages */}
        <div
          onClick={() => setActiveTab("notifications")}
          className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 hover:border-amber-400/30 transition cursor-pointer space-y-3 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Notifications
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/20 text-amber-400 flex items-center justify-center group-hover:scale-105 transition relative">
              <Bell className="w-4 h-4" />
              {(data.unreadNotificationsCount ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              )}
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">
                {data.unreadNotificationsCount ?? 0}
              </span>
              <span className="text-xs text-slate-400 font-medium">unread updates</span>
            </div>
            <p className="text-[11px] text-amber-300 font-medium mt-0.5">
              Points, delivery & courier pings
            </p>
          </div>
          <p className="text-[11px] text-slate-400">
            {(data.notifications?.length ?? 0)} total logged events
          </p>
        </div>
      </div>

      {/* 3. NAVIGATION TABS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab("booking-status")}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 shrink-0 ${
            activeTab === "booking-status"
              ? "bg-sky-500 text-white shadow-lg shadow-sky-500/25"
              : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Booking & Care Status</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("referral-tracker")}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 shrink-0 ${
            activeTab === "referral-tracker"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/25"
              : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>Referral Trackers</span>
          <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[10px] font-bold">50 pts</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("points-status")}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 shrink-0 ${
            activeTab === "points-status"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
              : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Points & Rewards</span>
          {isFreeWashUnlocked && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-400 text-black text-[10px] font-bold">FREE</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("notifications")}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 shrink-0 ${
            activeTab === "notifications"
              ? "bg-amber-600 text-white shadow-lg shadow-amber-600/25"
              : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Notifications</span>
          {(data.unreadNotificationsCount ?? 0) > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
              {data.unreadNotificationsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("transactions")}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 shrink-0 ${
            activeTab === "transactions"
              ? "bg-teal-600 text-white shadow-lg shadow-teal-600/25"
              : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Transactions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("how-we-wash")}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 shrink-0 ${
            activeTab === "how-we-wash"
              ? "bg-purple-600 text-white shadow-lg shadow-purple-600/25"
              : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          }`}
        >
          <Waves className="w-4 h-4" />
          <span>Fabric Standards</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: BOOKING & LIVE CARE STATUS                       */}
      {/* ======================================================== */}
      {activeTab === "booking-status" && (
        <div className="space-y-6">
          {/* Active Order Spotlight with Specific Time Approach */}
          {activeBooking ? (
            <GlassCard className="p-6 sm:p-8 border-sky-400/30 bg-gradient-to-br from-slate-900/90 via-sky-950/40 to-slate-900/90 space-y-6 shadow-2xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
                    <span className="text-xs font-black uppercase tracking-wider text-sky-400">
                      Live Laundry In Progress
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[11px] font-bold">
                      Order #{activeBooking.id.slice(0, 8)}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white mt-1">
                    Care Process Stage: {activeBooking.status.replace(/_/g, " ")}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Window: {activeBooking.pickupWindow} • Total: KES {activeBooking.total.toLocaleString()}
                  </p>
                </div>

                {/* Specific Time Approach Clock */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-right w-full sm:w-auto">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-end gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    <span>Estimated Turnaround Clock</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-white mt-0.5">
                    {activeBooking.minutesRemaining && activeBooking.minutesRemaining > 0
                      ? `~${activeBooking.minutesRemaining} mins left`
                      : "Finishing & Packaging"}
                  </div>
                  <p className="text-[11px] text-emerald-300 font-medium">
                    Target Delivery:{" "}
                    {activeBooking.estimatedDeliveryAt
                      ? new Date(activeBooking.estimatedDeliveryAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Within 3 hours"}
                  </p>
                </div>
              </div>

              {/* STAGES PROGRESS TIMELINE */}
              <div className="space-y-3">
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                  Step-by-Step Garment Care Timeline
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  {[
                    {
                      label: "1. Driver Assigned",
                      time: "Pickup Window",
                      active: true,
                      done: ["CONFIRMED", "PICKED_UP", "WASHING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(
                        activeBooking.status
                      ),
                    },
                    {
                      label: "2. Collected & In Transit",
                      time: "20 - 30 mins",
                      active: ["PICKED_UP", "WASHING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(
                        activeBooking.status
                      ),
                      done: ["WASHING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(activeBooking.status),
                    },
                    {
                      label: "3. Washing & Sanitizing",
                      time: "~45 mins deep wash",
                      active: ["WASHING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(activeBooking.status),
                      done: ["READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(activeBooking.status),
                    },
                    {
                      label: "4. Tumble Drying & Fluff",
                      time: "~40 mins steam cycle",
                      active: ["READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(activeBooking.status),
                      done: ["READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(activeBooking.status),
                    },
                    {
                      label: "5. Folding & Quality Bag",
                      time: "~15 mins sealed pack",
                      active: ["READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(activeBooking.status),
                      done: ["OUT_FOR_DELIVERY", "DELIVERED"].includes(activeBooking.status),
                    },
                    {
                      label: "6. Out for Delivery",
                      time: "~30 mins express drop",
                      active: ["OUT_FOR_DELIVERY", "DELIVERED"].includes(activeBooking.status),
                      done: activeBooking.status === "DELIVERED",
                    },
                  ].map((step, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-2xl border text-xs transition space-y-1.5 ${
                        step.done
                          ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
                          : step.active
                          ? "bg-sky-500/20 border-sky-400 text-white shadow-lg shadow-sky-500/20 ring-1 ring-sky-400"
                          : "bg-white/5 border-white/10 text-slate-400"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>{step.label}</span>
                        {step.done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : step.active ? (
                          <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
                        ) : null}
                      </div>
                      <p className="text-[10px] text-slate-300">{step.time}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* EMBEDDED RIDER GPS PING FOR ACTIVE ORDER */}
              <RiderLocationPing
                bookingId={activeBooking.id}
                initialLat={activeBooking.riderPingLat}
                initialLng={activeBooking.riderPingLng}
                initialAddress={activeBooking.riderPingAddress}
                lastPingedAt={activeBooking.riderLocationPingedAt}
                onPingSuccess={() => fetchDashboard()}
              />
            </GlassCard>
          ) : (
            <GlassCard className="p-8 border-white/15 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center mx-auto shadow-inner">
                <Package className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-lg font-bold text-white">No Laundry In Progress</h3>
                <p className="text-xs text-slate-300">
                  Ready for fresh, sanitized clothes? Book a wash now. You earn reward points upon delivery and payment!
                </p>
              </div>
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 text-white font-bold text-xs shadow-lg transition active:scale-95"
              >
                <span>Book Your Wash Now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </GlassCard>
          )}

          {/* ALL ORDERS & HISTORY TABLE */}
          <GlassCard className="p-6 border-white/15 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">All Wash Orders & History</h3>
                <p className="text-xs text-slate-300">
                  Track delivery records, review clothes care, and leave comments to earn bonus points.
                </p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10 text-xs">
                {(["all", "active", "completed"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setHistoryFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg capitalize font-medium transition ${
                      historyFilter === filter
                        ? "bg-sky-500 text-white shadow-sm"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {filteredBookings.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No orders matching the selected filter.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 sm:p-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-400">
                          #{b.id.slice(0, 8)}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            b.status === "DELIVERED"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                              : b.status === "CANCELLED"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-400/30"
                              : "bg-sky-500/20 text-sky-300 border border-sky-400/30"
                          }`}
                        >
                          {b.status.replace(/_/g, " ")}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.paymentStatus === "PAID"
                              ? "bg-teal-500/20 text-teal-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {b.paymentStatus}
                        </span>
                        {b.riderLocationPingedAt && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-medium flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-indigo-400" />
                            GPS Pinged
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-white font-medium">
                        {b.addressText || "Delivery Doorstep, Nairobi"}
                        {b.landmark ? ` (${b.landmark})` : ""}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Placed on {new Date(b.createdAt).toLocaleDateString()} at{" "}
                        {new Date(b.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} •
                        Pickup: {b.pickupWindow}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                      <div className="text-right">
                        <div className="text-sm font-black text-white">
                          KES {b.total.toLocaleString()}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {b.status === "DELIVERED" && b.paymentStatus === "PAID"
                            ? "+100 pts awarded"
                            : "Points on delivery"}
                        </p>
                      </div>

                      {/* Action buttons */}
                      {b.status === "DELIVERED" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setReviewBookingId(b.id);
                            setShowReviewModal(true);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-xs font-bold transition flex items-center gap-1.5"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-300" />
                          <span>Review (+20 pts)</span>
                        </button>
                      ) : (
                        <Link
                          href={`/track/${b.id}`}
                          className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition flex items-center gap-1.5"
                        >
                          <span>Live Track</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: REFERRAL TRACKERS                                */}
      {/* ======================================================== */}
      {activeTab === "referral-tracker" && (
        <div className="space-y-6">
          {/* Share Referral Hero Card */}
          <GlassCard className="p-6 sm:p-8 border-emerald-400/30 bg-gradient-to-br from-slate-900/90 via-emerald-950/30 to-slate-900/90 space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-white/10">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
                  <Gift className="w-4 h-4 text-emerald-400" />
                  <span>Refer Friends & Earn Free Laundry</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">
                  Earn 50 Points for Every Referred Friend!
                </h2>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Share your unique code. When your friend signs up and completes their first wash booking,{" "}
                  <strong>you both receive 50 reward points</strong>! Collect 1,000 points to unlock a 100% Free Wash Day.
                </p>
              </div>

              {/* Referral Code Display & Actions */}
              <div className="w-full md:w-auto p-4 rounded-2xl bg-slate-950/80 border border-white/15 space-y-3 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Your Personal Referral Code
                </span>
                <div className="flex items-center justify-between gap-3 bg-white/5 px-4 py-2.5 rounded-xl border border-white/10">
                  <span className="text-xl font-black font-mono tracking-wider text-emerald-400">
                    {data.client.referralCode || "WF-PARTNER"}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyReferralCode}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold transition flex items-center gap-1"
                    title="Copy code"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyShareUrl}
                    className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? "Copied" : "Copy Link"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* How It Works Explainer */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <span className="text-xs font-black text-sky-400 uppercase tracking-widest">
                  Step 1: Invite
                </span>
                <h4 className="text-sm font-bold text-white">Share Your Code</h4>
                <p className="text-[11px] text-slate-300">
                  Send your referral code or link to friends, neighbors, or clients via WhatsApp or SMS.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">
                  Step 2: Sign Up & Book
                </span>
                <h4 className="text-sm font-bold text-white">Friend Books a Wash</h4>
                <p className="text-[11px] text-slate-300">
                  Your friend signs up using your code. As soon as they book their first wash order, the referral is complete!
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">
                  Step 3: Earn & Redeem
                </span>
                <h4 className="text-sm font-bold text-white">+50 Points to Both!</h4>
                <p className="text-[11px] text-slate-300">
                  50 points are instantly added to your account and 50 points to your friend! Repeat to reach 1,000 pts for a free wash.
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Referral Statistics & Table */}
          <GlassCard className="p-6 border-white/15 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">Your Referred Friends List</h3>
                <p className="text-xs text-slate-300">
                  Real-time status of everyone who registered with your code and their wash progress.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300">
                  Pending Wash: <strong className="text-amber-400">{data.referralTracker?.pendingReferrals ?? 0}</strong>
                </span>
                <span className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                  Completed: <strong className="text-white">{data.referralTracker?.completedReferrals ?? 0}</strong>
                </span>
              </div>
            </div>

            {(!data.referralTracker?.referralsList || data.referralTracker.referralsList.length === 0) ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-3">
                <Gift className="w-8 h-8 text-slate-500 mx-auto" />
                <p>You haven&apos;t referred anyone yet. Share your code above to start earning points!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.referralTracker.referralsList.map((ref) => (
                  <div
                    key={ref.id}
                    className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{ref.name}</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            ref.status === "COMPLETED"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-400/30"
                          }`}
                        >
                          {ref.status === "COMPLETED" ? "Wash Booked • 50 Pts Earned" : "Signed Up • Awaiting First Wash"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Phone: {ref.phone} • Joined: {new Date(ref.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-emerald-400">
                        {ref.status === "COMPLETED" ? "+50 pts" : "Pending 50 pts"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: POINTS ALLOCATED STATUS & REWARDS                */}
      {/* ======================================================== */}
      {activeTab === "points-status" && (
        <div className="space-y-6">
          {/* Hero Free Wash Redemption Card */}
          <GlassCard className="p-6 sm:p-8 border-indigo-400/30 bg-gradient-to-br from-slate-900/90 via-indigo-950/30 to-slate-900/90 space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-white/10">
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-widest text-indigo-400">
                  Royalty Rewards Threshold
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-white">
                  1,000 Points = 1 Free Wash Day
                </h2>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Earn points from referrals (50 pts), wash orders delivered & paid (100 pts), and leaving reviews (20 pts). Reach 1,000 points to redeem a full complimentary laundry service!
                </p>
              </div>

              {/* Balance & Redemption */}
              <div className="w-full md:w-auto p-5 rounded-2xl bg-slate-950/80 border border-white/15 text-center space-y-3 shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Current Available Balance
                </span>
                <div className="text-3xl sm:text-4xl font-black text-white">
                  {currentPoints} <span className="text-sm text-slate-400">pts</span>
                </div>
                <button
                  type="button"
                  onClick={handleRedeemFreeWash}
                  disabled={!isFreeWashUnlocked || redeemingPoints}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-white font-bold text-xs shadow-lg transition active:scale-95 disabled:opacity-40"
                >
                  {redeemingPoints ? (
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                  ) : isFreeWashUnlocked ? (
                    "Redeem Free Wash (1,000 pts) 🎁"
                  ) : (
                    `${pointsRemaining} pts needed for Free Wash`
                  )}
                </button>
              </div>
            </div>

            {/* Voucher Celebration Modal Banner */}
            {voucherCode && (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs space-y-2 animate-bounce">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                  <Award className="w-5 h-5 text-emerald-400" />
                  <span>Free Wash Voucher Activated!</span>
                </div>
                <p>
                  Use your voucher code: <strong className="text-white text-base font-mono">{voucherCode}</strong> on your next wash order for 100% off!
                </p>
              </div>
            )}

            {redeemError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {redeemError}
              </div>
            )}

            {/* Points Earning Methods Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">From Referrals</span>
                  <span className="text-xs font-black text-emerald-400">+50 pts / wash</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Earned when your invited friends sign up and book their first wash order.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">From Delivered Orders</span>
                  <span className="text-xs font-black text-sky-400">+100 pts / order</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Earned automatically once your wash is delivered and payment is confirmed.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">From Comments & Reviews</span>
                  <span className="text-xs font-black text-amber-400">+20 pts / review</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Earned when you rate your wash and leave comments to drive traffic.
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Full Points Ledger Activity */}
          <GlassCard className="p-6 border-white/15 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">Points Activity Ledger</h3>
                <p className="text-xs text-slate-300">
                  Transparent history of all points earned, credited, and redeemed.
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {data.pointsTracker?.ledger.length ?? 0} total entries
              </span>
            </div>

            {(!data.pointsTracker?.ledger || data.pointsTracker.ledger.length === 0) ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No points history recorded yet. Book a wash or refer a friend to start!
              </div>
            ) : (
              <div className="space-y-3">
                {data.pointsTracker.ledger.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-white">{entry.title}</div>
                      <p className="text-[11px] text-slate-400">{entry.description}</p>
                      <span className="text-[10px] text-slate-500">
                        {new Date(entry.createdAt).toLocaleDateString()} at{" "}
                        {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-sm font-black ${
                          entry.amount > 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {entry.amount > 0 ? `+${entry.amount}` : entry.amount} pts
                      </span>
                      <p className="text-[10px] text-slate-400">
                        Balance: {entry.balanceAfter} pts
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: NOTIFICATIONS                                    */}
      {/* ======================================================== */}
      {activeTab === "notifications" && (
        <GlassCard className="p-6 border-white/15 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Notifications & Alerts</h3>
              <p className="text-xs text-slate-300">
                Live updates on your bookings, reward points, and courier location pings.
              </p>
            </div>

            {(data.unreadNotificationsCount ?? 0) > 0 && (
              <button
                type="button"
                onClick={handleMarkNotificationsRead}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold transition"
              >
                Mark all as read
              </button>
            )}
          </div>

          {(!data.notifications || data.notifications.length === 0) ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <Bell className="w-8 h-8 text-slate-500 mx-auto" />
              <p>You have no notifications at this time.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 rounded-2xl border transition flex items-start gap-3.5 ${
                    n.isRead
                      ? "bg-white/5 border-white/10 text-slate-300"
                      : "bg-sky-500/10 border-sky-400/30 text-white shadow-sm"
                  }`}
                >
                  <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                    {n.type.includes("points") ? (
                      <Coins className="w-4 h-4" />
                    ) : n.type.includes("rider") ? (
                      <MapPin className="w-4 h-4" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white">{n.title || "Notification"}</h4>
                      <span className="text-[10px] text-slate-400">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* ======================================================== */}
      {/* TAB 5: TRANSACTIONS                                     */}
      {/* ======================================================== */}
      {activeTab === "transactions" && (
        <GlassCard className="p-6 border-white/15 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Payment & Billing Transactions</h3>
              <p className="text-xs text-slate-300">
                Official receipts and Daraja M-Pesa transaction records for your wash orders.
              </p>
            </div>
          </div>

          {(!data.transactions || data.transactions.length === 0) ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <Receipt className="w-8 h-8 text-slate-500 mx-auto" />
              <p>No transactions found for your account.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">
                        {tx.providerRef}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          tx.status === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Provider: {tx.provider.toUpperCase()} • Type: {tx.type} • Order #{tx.bookingId.slice(0, 8)}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(tx.createdAt).toLocaleDateString()} at{" "}
                      {new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-black text-white">
                      KES {tx.amount.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* ======================================================== */}
      {/* TAB 6: HOW WE WASH & STANDARDS                          */}
      {/* ======================================================== */}
      {activeTab === "how-we-wash" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlassCard className="p-6 space-y-3 border-white/15">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <Waves className="w-5 h-5 text-indigo-400" />
              <span>Medical-Grade Wash Hygiene</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every client load is washed individually in sealed sanitized drums. We never combine garments across customers, using hypoallergenic fabric softeners and pH-neutral solutions.
            </p>
          </GlassCard>

          <GlassCard className="p-6 space-y-3 border-white/15">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-400" />
              <span>Precision GPS Delivery Logistics</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Our courier fleet operates with real-time GPS coordinates. Once you ping your live location, the rider receives immediate turn-by-turn routing to your exact entrance.
            </p>
          </GlassCard>
        </div>
      )}



      {/* ======================================================== */}
      {/* MODAL 2: RATE & REVIEW (+20 POINTS)                     */}
      {/* ======================================================== */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-white/20 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setShowReviewModal(false)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                Earn Community Points
              </span>
              <h3 className="text-lg font-black text-white">Rate & Review Your Wash</h3>
              <p className="text-xs text-slate-300">
                Leave a rating and comment to earn <strong>+20 reward points</strong>!
              </p>
            </div>

            {reviewSuccessMsg ? (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs text-center space-y-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="font-bold">{reviewSuccessMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitRating} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-2">
                    Rating (Stars)
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewStars(star)}
                        className={`p-2.5 rounded-xl border transition ${
                          star <= reviewStars
                            ? "bg-amber-500/20 border-amber-400 text-amber-300"
                            : "bg-white/5 border-white/10 text-slate-400"
                        }`}
                      >
                        <Star className={`w-5 h-5 ${star <= reviewStars ? "fill-amber-400" : ""}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Your Feedback / Comment <span className="text-amber-400">* (+20 pts)</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="e.g. Fresh scent, neatly folded, and fast delivery!"
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs text-white placeholder-slate-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={reviewSubmitting || !reviewComment.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 text-white font-bold text-xs shadow-lg transition active:scale-95 disabled:opacity-50"
                >
                  {reviewSubmitting ? "Submitting..." : "Submit Review & Claim 20 Points"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
