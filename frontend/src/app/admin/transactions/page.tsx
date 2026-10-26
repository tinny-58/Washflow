"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  Download,
  Filter,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Heart,
  TrendingUp,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

interface PaymentRecord {
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
}

export default function AdminTransactionsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [stats, setStats] = useState({
    grossRevenue: 0,
    totalTips: 0,
    settledCount: 0,
    pendingCount: 0,
  });

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/summary");
      if (res.ok) {
        const data = await res.json();
        if (data.summary?.transactions) {
          const tx = data.summary.transactions;
          setPayments(tx.recentPayments || []);
          setStats({
            grossRevenue: tx.grossRevenue || 0,
            totalTips: tx.totalTips || 0,
            settledCount: tx.paidTransactionsCount || 0,
            pendingCount: tx.pendingTransactionsCount || 0,
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const filteredPayments = payments.filter((p) => {
    const matchesStatus =
      statusFilter === "ALL"
        ? true
        : statusFilter === "SETTLED"
        ? p.status === "COMPLETED" || p.status === "PAID"
        : p.status === statusFilter;

    const matchesSearch =
      !searchQuery.trim() ||
      p.providerRef.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.customerName || "").toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <span>Transactions & Finance</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            M-Pesa payment ledger, tip disbursements, and daily revenue settlements
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/admin/export"
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </a>

          <button
            onClick={fetchTransactions}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition"
            title="Refresh Ledger"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard className="p-4 border-emerald-500/20 bg-emerald-950/10 space-y-1">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
            Gross Settled Revenue
          </span>
          <div className="text-2xl font-black text-white">
            KES {stats.grossRevenue.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400 block">
            {stats.settledCount} confirmed customer payment{stats.settledCount === 1 ? "" : "s"}
          </span>
        </GlassCard>

        <GlassCard className="p-4 border-amber-500/20 bg-amber-950/10 space-y-1">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
            Cleaner & Rider Gratuity
          </span>
          <div className="text-2xl font-black text-white">
            KES {stats.totalTips.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400 block">
            100% disbursed directly to operational staff
          </span>
        </GlassCard>

        <GlassCard className="p-4 border-sky-500/20 bg-sky-950/10 space-y-1">
          <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
            Pending Settlements
          </span>
          <div className="text-2xl font-black text-white">{stats.pendingCount}</div>
          <span className="text-[11px] text-slate-400 block">
            STK pushes pending customer PIN entry
          </span>
        </GlassCard>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by receipt or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {["ALL", "SETTLED", "PENDING", "FAILED"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                statusFilter === st
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                  : "bg-white/5 text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Ledger Table */}
      <GlassCard className="p-5 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 font-semibold">
                <th className="pb-3">M-Pesa Receipt</th>
                <th className="pb-3">Customer</th>
                <th className="pb-3">Purpose</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Date & Time</th>
                <th className="pb-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading financial ledger...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No transactions found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="text-slate-300 hover:bg-white/[0.02] transition">
                    <td className="py-3 font-mono text-[11px] text-sky-300">
                      {p.providerRef || "STK_PENDING"}
                    </td>
                    <td className="py-3 font-medium text-white">{p.customerName || "Customer"}</td>
                    <td className="py-3 capitalize">{p.type}</td>
                    <td className="py-3 font-bold text-white">KES {p.amount.toLocaleString()}</td>
                    <td className="py-3 text-slate-400 text-[11px]">
                      {new Date(p.createdAt).toLocaleString("en-KE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.status === "COMPLETED" || p.status === "PAID"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : p.status === "PENDING"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
