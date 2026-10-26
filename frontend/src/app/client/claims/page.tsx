"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  HelpCircle,
  PlusCircle,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ShieldCheck,
  Package,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatusChip,
  DataTable,
  Column,
  EmptyState,
} from "@/components/shared";
import { formatDate } from "@/lib/utils";

interface ClaimRecord {
  id: string;
  claimRef: string;
  orderId: string;
  issueType: string;
  status: "NEW" | "UNDER_REVIEW" | "AWAITING_CUSTOMER" | "RESOLVED" | "REJECTED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  description: string;
  resolutionType?: string;
  hasUnreadAdminReply?: boolean;
}

export default function ClientClaimsPage() {
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<string>("ALL");

  const fetchClaims = useCallback(async () => {
    try {
      const res = await fetch("/api/client/claims", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.claims)) {
          setClaims(data.claims);
        }
      }
    } catch {
      // Endpoint may not be active until Phase 5 backend is mounted
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const filteredClaims = claims.filter((c) => {
    if (filter === "ALL") return true;
    return c.status === filter;
  });

  const columns: Column<ClaimRecord>[] = [
    {
      key: "claimRef",
      header: "Claim Ref",
      render: (row) => (
        <div className="flex flex-col font-mono">
          <span className="font-bold text-sky-400 text-xs sm:text-sm">{row.claimRef}</span>
          <span className="text-[10px] text-slate-500">Order #{row.orderId.slice(0, 8)}</span>
        </div>
      ),
    },
    {
      key: "issueType",
      header: "Issue Type",
      render: (row) => (
        <span className="text-xs font-medium text-slate-200 capitalize">
          {row.issueType.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Filed On",
      render: (row) => (
        <span className="text-xs text-slate-400 font-mono">
          {formatDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const statusMap: Record<
          string,
          { variant: "amber" | "sky" | "indigo" | "emerald" | "rose" | "slate"; label: string }
        > = {
          NEW: { variant: "amber", label: "New / Submitted" },
          UNDER_REVIEW: { variant: "sky", label: "Under Review" },
          AWAITING_CUSTOMER: { variant: "indigo", label: "Awaiting Reply" },
          RESOLVED: { variant: "emerald", label: "Resolved" },
          REJECTED: { variant: "rose", label: "Rejected" },
          CLOSED: { variant: "slate", label: "Closed" },
        };
        const config = statusMap[row.status] || { variant: "slate", label: row.status };
        return <StatusChip label={config.label} variant={config.variant} size="sm" />;
      },
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Claims & Dispute Support
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            File an issue regarding a delivered order within the 72-hour guarantee window.
          </p>
        </div>

        <Link
          href="/client/orders?filter=DELIVERED"
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-sky-500/20 transition self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Report an Issue</span>
        </Link>
      </div>

      {/* SLA & Guarantee Info Banner */}
      <Card variant="accent" className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">WashFlow Quality Guarantee</h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                All delivered orders are protected by our 72-hour resolution policy. Our team responds within 24 hours.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-300 shrink-0">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">First Response SLA</span>
              <span className="text-sky-300 font-bold">&lt; 24 Hours</span>
            </div>
            <div className="border-l border-white/10 pl-4">
              <span className="text-[10px] text-slate-400 block uppercase">Claim Window</span>
              <span className="text-emerald-300 font-bold">72 Hours Post-Delivery</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Claims Data Table */}
      <DataTable
        columns={columns}
        data={filteredClaims}
        keyExtractor={(item) => item.id}
        loading={loading}
        pageSize={10}
        emptyTitle="No claims filed"
        emptyDescription="You do not have any open or resolved claims. If there's an issue with a recent wash, select your order to request review."
        emptyAction={{
          label: "View Delivered Orders",
          href: "/client/orders?filter=DELIVERED",
        }}
      />
    </div>
  );
}
