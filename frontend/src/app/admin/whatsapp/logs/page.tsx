"use client";

import React, { useEffect, useState, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";
import {
  MessageSquare,
  Search,
  Filter,
  RefreshCw,
  Download,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Info,
  Calendar,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { WhatsAppNav } from "@/components/admin/whatsapp/whatsapp-nav";

interface LogEntry {
  id: string;
  bookingId?: string | null;
  automationId?: string | null;
  templateVersion?: number | null;
  purpose: string;
  recipientMasked: string;
  providerMessageId?: string | null;
  status: string;
  priority?: string | null;
  renderedBodyMasked?: string | null;
  failureReason?: string | null;
  attempts: number;
  scheduledFor?: string | null;
  queuedAt: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  failedAt?: string | null;
}

interface SummaryData {
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  deliveryRate: number | null;
  medianSendToDeliveredSeconds: number | null;
}

export default function AdminWhatsAppLogsPage() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") || "all";
  const initialQuickFilter = searchParams.get("quickFilter") || (initialStatus === "undelivered" ? "undelivered" : "");

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState(initialStatus === "undelivered" ? "all" : initialStatus);
  const [quickFilter, setQuickFilter] = useState(initialQuickFilter);
  const [purposeFilter, setPurposeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        status: statusFilter,
        purpose: purposeFilter,
        quickFilter,
      });

      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }

      const res = await fetch(`/api/admin/whatsapp/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setLogs(data.logs || []);
          if (data.pagination) {
            setTotalPages(data.pagination.totalPages || 1);
            setTotalCount(data.pagination.totalCount || 0);
          }
          if (data.summary) {
            setSummary(data.summary);
          }
        }
      }
    } catch (err: any) {
      console.warn("Failed to fetch logs:", err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, purposeFilter, quickFilter, searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleRetryMessage = async (log: LogEntry) => {
    if (log.status === "expired" || log.purpose.toLowerCase().includes("otp")) {
      alert("Security Policy: Expired verification codes and OTPs cannot be resent. The customer must request a fresh code from the verification screen.");
      return;
    }

    setRetryingId(log.id);
    try {
      const res = await fetch(`/api/admin/whatsapp/logs/${log.id}/retry`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert("Message requeued and dispatched successfully.");
        fetchLogs();
      } else {
        alert(data.error || "Failed to retry message.");
      }
    } catch {
      alert("Network error retrying message.");
    } finally {
      setRetryingId(null);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/whatsapp/logs/export");
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to export logs.");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `washflow-whatsapp-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      alert("Network error downloading CSV export.");
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "sent":
      case "delivered":
      case "read":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {status.toUpperCase()}
          </span>
        );
      case "failed":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            FAILED
          </span>
        );
      case "expired":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30">
            EXPIRED
          </span>
        );
      case "skipped":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            SKIPPED
          </span>
        );
      case "queued":
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
            QUEUED
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      <WhatsAppNav />

      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-teal-400" />
            <span>Communications Log & Queue</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Indexed, privacy-compliant audit trail of outbound WhatsApp notifications, delivery statuses, and retry controls.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5"
            title="Download CSV log (audited)"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>{exporting ? "Exporting..." : "Export CSV"}</span>
          </button>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-teal-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <GlassCard className="p-4 space-y-1">
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Delivered Messages
          </span>
          <div className="text-xl font-black text-emerald-400 font-mono">
            {summary?.deliveredCount ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">
            Confirmed delivery to phone
          </span>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Failed / Undelivered
          </span>
          <div className="text-xl font-black text-rose-400 font-mono">
            {summary?.failedCount ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">
            Actionable transmission errors
          </span>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Delivery Rate
          </span>
          <div className="text-xl font-black text-white font-mono">
            {summary?.deliveryRate !== null && summary?.deliveryRate !== undefined
              ? `${summary.deliveryRate}%`
              : "—"}
          </div>
          <span className="text-[10px] text-slate-500">
            All-time transmission success
          </span>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Median Delivery Time
          </span>
          <div className="text-xl font-black text-sky-400 font-mono">
            {summary?.medianSendToDeliveredSeconds !== null && summary?.medianSendToDeliveredSeconds !== undefined
              ? `${summary.medianSendToDeliveredSeconds}s`
              : "—"}
          </div>
          <span className="text-[10px] text-slate-500">
            Send-to-delivered latency
          </span>
        </GlassCard>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Quick Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => {
                setQuickFilter("");
                setStatusFilter("all");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
                quickFilter === "" && statusFilter === "all"
                  ? "bg-white/15 text-white border border-white/20"
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              All Messages
            </button>

            <button
              onClick={() => {
                setQuickFilter("undelivered");
                setStatusFilter("all");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
                quickFilter === "undelivered"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              ⚠️ Undelivered Queue
            </button>

            <button
              onClick={() => {
                setQuickFilter("");
                setStatusFilter("delivered");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
                statusFilter === "delivered" && quickFilter === ""
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              Delivered
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search masked number..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400"
            />
          </div>
        </div>
      </div>

      {/* Communications Table */}
      <GlassCard className="p-5 space-y-4">
        {loading && logs.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400 space-y-2">
            <RefreshCw className="w-5 h-5 mx-auto animate-spin text-teal-400" />
            <p>Loading communication records...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            No outbound messages match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-white/10 text-slate-400 text-[10px] uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Purpose / Automation</th>
                  <th className="py-2.5 px-3">Recipient</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Queued / Sent</th>
                  <th className="py-2.5 px-3">Provider ID / Notes</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map((log) => {
                  const purposeLabel = (log.purpose || log.automationId || "DISPATCH")
                    .replace("WA_AUTO_", "")
                    .replace(/_/g, " ");

                  const timeStr = log.queuedAt
                    ? new Date(log.queuedAt).toLocaleDateString("en-KE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";

                  const isRetryable =
                    log.status === "failed" &&
                    !log.purpose.toLowerCase().includes("otp") &&
                    log.attempts < 3;

                  const isExpanded = expandedLogId === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-white/[0.02] transition">
                        <td className="py-3 px-3 font-semibold text-white capitalize">
                          <div className="flex items-center gap-1.5">
                            <span>{purposeLabel}</span>
                            {log.priority === "otp" && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-mono">
                                OTP
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-sky-300">
                          {log.recipientMasked}
                        </td>
                        <td className="py-3 px-3">
                          {getStatusBadge(log.status)}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-400">
                          {timeStr}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-400 max-w-xs truncate">
                          {log.failureReason ? (
                            <span className="text-rose-300" title={log.failureReason}>
                              {log.failureReason}
                            </span>
                          ) : log.providerMessageId ? (
                            <span className="font-mono text-[10px] text-slate-500" title={log.providerMessageId}>
                              {log.providerMessageId.slice(0, 16)}...
                            </span>
                          ) : log.scheduledFor ? (
                            <span className="text-amber-300 text-[10px]">
                              Queued for {new Date(log.scheduledFor).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isRetryable && (
                              <button
                                onClick={() => handleRetryMessage(log)}
                                disabled={retryingId === log.id}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold transition flex items-center gap-1"
                              >
                                <RotateCcw className={`w-3 h-3 ${retryingId === log.id ? "animate-spin" : ""}`} />
                                <span>Retry</span>
                              </button>
                            )}

                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-medium transition"
                            >
                              {isExpanded ? "Hide" : "Details"}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Message Detail */}
                      {isExpanded && (
                        <tr className="bg-black/20">
                          <td colSpan={6} className="py-3 px-4 text-xs space-y-2 border-b border-white/10">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                                <span className="text-slate-400 block text-[10px]">Message Timeline</span>
                                <div className="space-y-1 mt-1 text-slate-300">
                                  <div>Queued: {log.queuedAt ? new Date(log.queuedAt).toLocaleTimeString() : "—"}</div>
                                  <div>Sent: {log.sentAt ? new Date(log.sentAt).toLocaleTimeString() : "—"}</div>
                                  <div>Delivered: {log.deliveredAt ? new Date(log.deliveredAt).toLocaleTimeString() : "—"}</div>
                                </div>
                              </div>

                              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                                <span className="text-slate-400 block text-[10px]">Delivery Diagnostics</span>
                                <div className="space-y-1 mt-1 text-slate-300 font-mono text-[10px]">
                                  <div>Attempts: {log.attempts} / 3</div>
                                  <div>Provider ID: {log.providerMessageId || "Not assigned"}</div>
                                  {log.failureReason && <div className="text-rose-300">Error: {log.failureReason}</div>}
                                </div>
                              </div>

                              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                                <span className="text-slate-400 block text-[10px]">Masked Content (Privacy Protected)</span>
                                <p className="text-[11px] text-slate-300 mt-1 italic">
                                  {log.renderedBodyMasked || "[No rendered body logged]"}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Bar */}
        {totalPages > 1 && (
          <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
            <span>
              Page {page} of {totalPages} ({totalCount} total entries)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
