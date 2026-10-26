"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Phone,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  DollarSign,
  Package,
  RefreshCw,
  CheckCircle2,
  Ban,
  Eye,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Activity,
  UserCheck,
  Lock,
  X,
  AlertTriangle,
  Clock,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

interface CustomerRecord {
  id: string;
  name: string | null;
  username: string | null;
  phoneMasked: string;
  email: string | null;
  authProvider: string | null;
  referredBy: string | null;
  referralCount: number;
  rewardPointsBalance: number;
  isBlocked: boolean;
  status: "active" | "disabled";
  signupMethod: "WhatsApp" | "Google";
  createdAt: string;
  orderCount: number;
  totalSpend: number;
  lastActiveAt: string | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

interface CustomerProfile {
  id: string;
  name: string | null;
  username: string | null;
  maskedPhone: string;
  email: string | null;
  authProvider: string | null;
  joinedAt: string;
  isBlocked: boolean;
  referralCode: string | null;
  referredBy: string | null;
  referralCount: number;
  rewardPointsBalance: number;
  addresses: Array<{ id: string; label: string | null; addressText: string; landmark: string | null }>;
  orders: Array<{
    id: string;
    shortId: string;
    status: string;
    total: number;
    pickupWindow: string | null;
    paymentStatus: string;
    createdAt: string;
  }>;
  activeSessionsCount: number;
  lastSeenAt: string;
  recentMessages: Array<{
    id: string;
    purpose: string;
    status: string;
    queuedAt: string;
    deliveredAt: string | null;
  }>;
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 25,
    totalCount: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("joined");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Phone Reveal State (Audited)
  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [revealModalTarget, setRevealModalTarget] = useState<CustomerRecord | null>(null);

  // Status Toggle State
  const [statusTogglingId, setStatusTogglingId] = useState<string | null>(null);
  const [statusModalTarget, setStatusModalTarget] = useState<CustomerRecord | null>(null);

  // Profile Modal State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);

  // Reconciliation State
  const [reconciling, setReconciling] = useState<boolean>(false);
  const [reconcileResult, setReconcileResult] = useState<{
    inSync: boolean;
    registeredClients: number;
    driftCount: number;
    message?: string;
  } | null>(null);

  const fetchCustomers = useCallback(
    async (pageToFetch = pagination.page) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(pageToFetch),
          limit: String(pagination.limit),
          status: statusFilter,
          sortBy,
          sortOrder,
        });
        if (searchQuery.trim()) {
          params.set("q", searchQuery.trim());
        }

        const res = await fetch(`/api/admin/customers?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setCustomers(data.customers || []);
          if (data.pagination) {
            setPagination(data.pagination);
          }
        }
      } catch (err) {
        console.error("Failed to load customers:", err);
      } finally {
        setLoading(false);
      }
    },
    [pagination.limit, statusFilter, sortBy, sortOrder, searchQuery]
  );

  useEffect(() => {
    fetchCustomers(1);
  }, [fetchCustomers]);

  // Handle Audited Phone Reveal
  const handleConfirmReveal = async () => {
    if (!revealModalTarget) return;
    setRevealingId(revealModalTarget.id);
    try {
      const res = await fetch(`/api/admin/customers/${revealModalTarget.id}/reveal-phone`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedPhones((prev) => ({ ...prev, [revealModalTarget.id]: data.phone }));
      } else {
        alert("Failed to reveal phone number (session unverified or rate limited).");
      }
    } catch {
      alert("Network error while revealing phone number.");
    } finally {
      setRevealingId(null);
      setRevealModalTarget(null);
    }
  };

  // Handle Disable/Enable Customer (Revokes sessions)
  const handleConfirmStatusToggle = async () => {
    if (!statusModalTarget) return;
    setStatusTogglingId(statusModalTarget.id);
    try {
      const res = await fetch(`/api/admin/customers/${statusModalTarget.id}/toggle-status`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === statusModalTarget.id
              ? { ...c, isBlocked: data.isBlocked, status: data.status }
              : c
          )
        );
        if (customerProfile && customerProfile.id === statusModalTarget.id) {
          setCustomerProfile((prev) =>
            prev ? { ...prev, isBlocked: data.isBlocked, activeSessionsCount: 0 } : null
          );
        }
      } else {
        alert("Failed to update customer account status.");
      }
    } catch {
      alert("Network error updating customer status.");
    } finally {
      setStatusTogglingId(null);
      setStatusModalTarget(null);
    }
  };

  // Fetch Detailed Profile
  const handleOpenProfile = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    setProfileLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/profile`);
      if (res.ok) {
        const data = await res.json();
        setCustomerProfile(data.profile);
      } else {
        alert("Failed to load customer profile details.");
        setSelectedCustomerId(null);
      }
    } catch {
      alert("Network error loading customer profile.");
      setSelectedCustomerId(null);
    } finally {
      setProfileLoading(false);
    }
  };

  // Run Drift Reconciliation
  const handleReconcile = async () => {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = await fetch("/api/admin/customers/reconcile");
      if (res.ok) {
        const data = await res.json();
        setReconcileResult({
          inSync: data.inSync,
          registeredClients: data.registeredClients,
          driftCount: data.driftCount,
          message: data.message,
        });
      }
    } catch {
      alert("Network error verifying directory sync.");
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Customer Directory
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Read-Model: Live Registered Clients
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Authoritative directory over verified clients (role=&apos;user&apos;). Single source of truth.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/customers/traffic"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-xs font-semibold text-indigo-300 transition"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Traffic & Funnel</span>
          </Link>
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition"
            title="Verify zero count drift between user accounts and read model"
          >
            <UserCheck className={`w-3.5 h-3.5 ${reconciling ? "animate-spin text-amber-400" : ""}`} />
            <span>{reconciling ? "Verifying..." : "Verify Sync"}</span>
          </button>
          <button
            onClick={() => fetchCustomers(pagination.page)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Reconciliation Alert Banner (if checked) */}
      {reconcileResult && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
            reconcileResult.inSync
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : "bg-amber-500/10 border-amber-500/20 text-amber-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {reconcileResult.inSync ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>
              <strong>Directory Sync Verification:</strong>{" "}
              {reconcileResult.inSync
                ? `100% in-sync. Total verified registered clients: ${reconcileResult.registeredClients}. Zero count drift.`
                : `Drift detected: ${reconcileResult.driftCount} account discrepancies found. Transactional outbox sync is running.`}
            </span>
          </div>
          <button
            onClick={() => setReconcileResult(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GlassCard className="p-3.5 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Registered Clients</span>
          </div>
          <div className="text-xl font-black text-white">{pagination.totalCount}</div>
        </GlassCard>

        <GlassCard className="p-3.5 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Active Clients</span>
          </div>
          <div className="text-xl font-black text-emerald-400">
            {customers.filter((c) => !c.isBlocked).length}
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Referral Champions</span>
          </div>
          <div className="text-xl font-black text-amber-300">
            {customers.reduce((acc, c) => acc + (c.referralCount || 0), 0)}
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-sky-400" />
            <span>Lifetime Spend (Page)</span>
          </div>
          <div className="text-xl font-black text-sky-400">
            KES {customers.reduce((acc, c) => acc + (c.totalSpend || 0), 0).toLocaleString()}
          </div>
        </GlassCard>
      </div>

      {/* Controls: Search, Status Filter & Sorting */}
      <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, username, phone, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchCustomers(1)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status Tabs */}
          <div className="flex items-center rounded-xl bg-white/5 p-1 border border-white/10">
            {(["all", "active", "disabled"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                  statusFilter === tab
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Sort Menu */}
          <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/10 text-slate-300">
            <span className="text-[11px] text-slate-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none"
            >
              <option value="joined" className="bg-slate-900">Joined Date</option>
              <option value="name" className="bg-slate-900">Name</option>
              <option value="orders" className="bg-slate-900">Orders</option>
              <option value="spend" className="bg-slate-900">Spend</option>
              <option value="lastActive" className="bg-slate-900">Last Active</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="text-slate-400 hover:text-white"
              title={`Switch to ${sortOrder === "asc" ? "descending" : "ascending"}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Customer Directory Table */}
      <GlassCard className="p-4 sm:p-5 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 font-semibold">
                <th className="pb-3">Client</th>
                <th className="pb-3">Phone (Masked)</th>
                <th className="pb-3">Signup / Channel</th>
                <th className="pb-3">Orders & Spend</th>
                <th className="pb-3">Loyalty & Referrals</th>
                <th className="pb-3">Joined</th>
                <th className="pb-3">Standing</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>Loading registered client directory...</span>
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No registered clients found matching criteria.
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const revealed = revealedPhones[c.id];
                  return (
                    <tr
                      key={c.id}
                      className="text-slate-300 hover:bg-white/[0.02] transition group"
                    >
                      {/* Client Name & Handle */}
                      <td className="py-3 font-medium text-white">
                        <button
                          onClick={() => handleOpenProfile(c.id)}
                          className="text-left hover:text-indigo-400 transition flex flex-col"
                        >
                          <span className="font-bold">{c.name || "WashFlow Client"}</span>
                          {c.username && (
                            <span className="text-[10px] text-slate-400">@{c.username}</span>
                          )}
                          {c.email && (
                            <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
                              {c.email}
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Masked Phone with Audited Reveal */}
                      <td className="py-3">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          {revealed ? (
                            <span className="text-emerald-300 font-bold">{revealed}</span>
                          ) : (
                            <>
                              <span className="text-sky-300">{c.phoneMasked}</span>
                              <button
                                onClick={() => setRevealModalTarget(c)}
                                className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-sky-300 transition"
                                title="Reveal full number (audited action)"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Signup Method */}
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            c.signupMethod === "Google"
                              ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                              : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          }`}
                        >
                          {c.signupMethod}
                        </span>
                      </td>

                      {/* Orders & Spend */}
                      <td className="py-3">
                        <div className="font-semibold text-white">
                          {c.orderCount} {c.orderCount === 1 ? "order" : "orders"}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          KES {c.totalSpend.toLocaleString()}
                        </div>
                      </td>

                      {/* Loyalty & Referrals */}
                      <td className="py-3">
                        <div className="text-amber-300 font-bold text-[11px]">
                          {c.rewardPointsBalance} pts
                        </div>
                        {c.referralCount > 0 ? (
                          <div className="text-[10px] text-slate-400">
                            {c.referralCount} referred
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-500">—</div>
                        )}
                      </td>

                      {/* Joined Date */}
                      <td className="py-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleDateString("en-KE", {
                          dateStyle: "medium",
                        })}
                      </td>

                      {/* Standing Badge */}
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            c.isBlocked
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          }`}
                        >
                          {c.isBlocked ? "DISABLED" : "ACTIVE"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenProfile(c.id)}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition"
                          >
                            Profile
                          </button>
                          <button
                            onClick={() => setStatusModalTarget(c)}
                            disabled={statusTogglingId === c.id}
                            className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition border ${
                              c.isBlocked
                                ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30"
                            }`}
                          >
                            {statusTogglingId === c.id
                              ? "..."
                              : c.isBlocked
                              ? "Enable"
                              : "Disable"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs text-slate-400">
          <div>
            Showing{" "}
            <span className="text-white font-semibold">
              {customers.length === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}
            </span>{" "}
            to{" "}
            <span className="text-white font-semibold">
              {Math.min(pagination.page * pagination.limit, pagination.totalCount)}
            </span>{" "}
            of <span className="text-white font-semibold">{pagination.totalCount}</span> verified clients
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchCustomers(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 disabled:opacity-40 disabled:pointer-events-none hover:bg-white/10 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-white font-mono text-[11px] px-2">
              Page {pagination.page} / {Math.max(1, pagination.totalPages)}
            </span>
            <button
              onClick={() => fetchCustomers(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 disabled:opacity-40 disabled:pointer-events-none hover:bg-white/10 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Audited Phone Reveal Modal */}
      {revealModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-sky-400">
              <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">Audited Client Phone Reveal</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              In accordance with privacy standards and Kenya DPA 2019, revealing the full phone number for{" "}
              <strong className="text-white">{revealModalTarget.name || "this client"}</strong> (
              <span className="font-mono text-sky-300">{revealModalTarget.phoneMasked}</span>) will be recorded
              in the immutable audit log with your admin identity and timestamp.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRevealModalTarget(null)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReveal}
                disabled={revealingId === revealModalTarget.id}
                className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-xs font-bold text-white transition shadow-lg shadow-sky-500/20"
              >
                {revealingId === revealModalTarget.id ? "Recording..." : "Acknowledge & Reveal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable / Enable Confirmation Modal */}
      {statusModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Ban className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">
                {statusModalTarget.isBlocked ? "Enable Client Account" : "Disable Client Account"}
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {statusModalTarget.isBlocked ? (
                <>
                  Are you sure you want to re-enable{" "}
                  <strong className="text-white">{statusModalTarget.name || "this client"}</strong>? They will be
                  able to sign in and book laundry services again.
                </>
              ) : (
                <>
                  Disabling <strong className="text-white">{statusModalTarget.name || "this client"}</strong> will{" "}
                  <span className="text-rose-400 font-semibold">
                    immediately revoke all active sessions in the same transaction
                  </span>{" "}
                  and block them from booking services. This action is audited.
                </>
              )}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setStatusModalTarget(null)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStatusToggle}
                disabled={statusTogglingId === statusModalTarget.id}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold text-white transition ${
                  statusModalTarget.isBlocked
                    ? "bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                    : "bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20"
                }`}
              >
                {statusTogglingId === statusModalTarget.id
                  ? "Processing..."
                  : statusModalTarget.isBlocked
                  ? "Confirm Enable"
                  : "Confirm Disable & Revoke Sessions"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Profile Drawer / Modal */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border-l border-white/10 w-full max-w-lg h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Client Profile</h3>
              </div>
              <button
                onClick={() => {
                  setSelectedCustomerId(null);
                  setCustomerProfile(null);
                }}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {profileLoading || !customerProfile ? (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mx-auto" />
                <p className="text-xs">Loading complete client profile...</p>
              </div>
            ) : (
              <div className="space-y-6 text-xs">
                {/* Header Summary */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {customerProfile.name || "Client"}
                      </h4>
                      {customerProfile.username && (
                        <p className="text-[11px] text-slate-400">@{customerProfile.username}</p>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        customerProfile.isBlocked
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {customerProfile.isBlocked ? "DISABLED" : "ACTIVE"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] text-slate-300">
                    <div>
                      <span className="text-slate-500 block">Masked Phone:</span>
                      <span className="font-mono text-sky-300">{customerProfile.maskedPhone}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Email:</span>
                      <span>{customerProfile.email || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Joined:</span>
                      <span>
                        {new Date(customerProfile.joinedAt).toLocaleDateString("en-KE", {
                          dateStyle: "medium",
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Active Sessions:</span>
                      <span className="font-semibold text-emerald-400">
                        {customerProfile.activeSessionsCount}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Loyalty & Referrals */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                  <h5 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Loyalty & Referrals</span>
                  </h5>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="p-2 rounded-lg bg-white/5">
                      <div className="text-[10px] text-slate-400">Points</div>
                      <div className="text-sm font-black text-amber-300">
                        {customerProfile.rewardPointsBalance}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/5">
                      <div className="text-[10px] text-slate-400">Referred</div>
                      <div className="text-sm font-black text-white">
                        {customerProfile.referralCount}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/5">
                      <div className="text-[10px] text-slate-400">Code</div>
                      <div className="text-xs font-mono font-bold text-sky-300">
                        {customerProfile.referralCode || "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Addresses */}
                <div className="space-y-2">
                  <h5 className="font-bold text-white text-xs">Saved Addresses</h5>
                  {customerProfile.addresses.length === 0 ? (
                    <div className="text-slate-500 text-[11px] p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      No saved addresses.
                    </div>
                  ) : (
                    customerProfile.addresses.map((addr) => (
                      <div
                        key={addr.id}
                        className="p-2.5 rounded-lg bg-white/5 border border-white/5 text-[11px]"
                      >
                        <div className="font-semibold text-white">{addr.label || "Home / Primary"}</div>
                        <div className="text-slate-300 mt-0.5">{addr.addressText}</div>
                        {addr.landmark && (
                          <div className="text-slate-500 text-[10px] mt-0.5">Near: {addr.landmark}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Order History */}
                <div className="space-y-2">
                  <h5 className="font-bold text-white text-xs flex items-center justify-between">
                    <span>Order History ({customerProfile.orders.length})</span>
                  </h5>
                  {customerProfile.orders.length === 0 ? (
                    <div className="text-slate-500 text-[11px] p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      No orders placed yet.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {customerProfile.orders.map((ord) => (
                        <div
                          key={ord.id}
                          className="p-2 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between text-[11px]"
                        >
                          <div>
                            <span className="font-mono text-indigo-300 font-bold">
                              #{ord.shortId}
                            </span>
                            <span className="text-slate-400 ml-2">
                              {new Date(ord.createdAt).toLocaleDateString("en-KE", {
                                dateStyle: "short",
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-semibold">
                              KES {ord.total.toLocaleString()}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/10 text-slate-300">
                              {ord.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Messages (Status Only, Zero OTP) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-white text-xs">WhatsApp Communications</h5>
                    <Link
                      href="/admin/whatsapp/logs"
                      className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <span>Full Logs</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  </div>
                  {customerProfile.recentMessages.length === 0 ? (
                    <div className="text-slate-500 text-[11px] p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      No outbound communications logged.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {customerProfile.recentMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className="p-2 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between text-[10px]"
                        >
                          <div>
                            <span className="font-bold text-slate-200 uppercase">
                              {msg.purpose}
                            </span>
                            <span className="text-slate-500 ml-2">
                              {new Date(msg.queuedAt).toLocaleDateString("en-KE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
                              msg.status === "delivered" || msg.status === "read"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : msg.status === "failed"
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-sky-500/20 text-sky-300"
                            }`}
                          >
                            {msg.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
