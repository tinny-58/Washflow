"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Receipt,
  Download,
  Search,
  Filter,
  CreditCard,
  Printer,
  X,
  FileSpreadsheet,
  Waves,
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
import { formatKes, formatDate } from "@/lib/utils";

interface TransactionItem {
  id: string;
  bookingId: string;
  type: "service" | "tip" | "deposit" | "balance" | "refund";
  provider: string;
  providerRef: string;
  amount: number;
  status: "COMPLETED" | "PENDING" | "FAILED";
  createdAt: string;
  bookingStatus?: string;
  bookingTotal?: number;
}

interface ReceiptDetails {
  receiptNumber: string;
  paymentId: string;
  bookingId: string;
  date: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  landmark?: string;
  items: Array<{
    variant: string;
    category: string;
    qty: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  discount: number;
  tip: number;
  totalPaid: number;
  provider: string;
  status: string;
}

function TransactionsContent() {
  const searchParams = useSearchParams();
  const receiptQueryId = searchParams.get("receipt");

  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState<ReceiptDetails | null>(null);
  const [receiptLoading, setReceiptLoading] = useState<boolean>(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch("/api/client/payments", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.payments)) {
          setTransactions(data.payments);

          if (receiptQueryId) {
            const match = data.payments.find(
              (p: TransactionItem) => p.bookingId === receiptQueryId || p.id === receiptQueryId
            );
            if (match) {
              loadReceipt(match.id);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [receiptQueryId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const loadReceipt = async (paymentId: string) => {
    setReceiptLoading(true);
    setReceiptError(null);
    try {
      const res = await fetch(`/api/client/payments/${paymentId}/receipt`);
      const data = await res.json();
      if (res.ok && data.success && data.receipt) {
        setActiveReceipt(data.receipt);
      } else {
        setReceiptError(data.error || "Unable to retrieve receipt details.");
      }
    } catch {
      setReceiptError("Network error while generating receipt.");
    } finally {
      setReceiptLoading(false);
    }
  };

  // Safe CSV Export (Protected against formula injection)
  const exportCsv = () => {
    if (transactions.length === 0) return;

    const sanitizeCell = (val: unknown) => {
      let str = String(val ?? "").trim();
      // Guard against spreadsheet formula injection (=, +, -, @)
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = ["Receipt / Ref", "Date (EAT)", "Type", "Amount (KES)", "Status", "Order ID"];
    const rows = filteredTransactions.map((t) => [
      sanitizeCell(t.providerRef),
      sanitizeCell(formatDate(t.createdAt)),
      sanitizeCell(t.type),
      sanitizeCell(t.amount),
      sanitizeCell(t.status),
      sanitizeCell(t.bookingId),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `washflow-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered transactions
  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      searchQuery.trim() === "" ||
      t.providerRef.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.bookingId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    const matchesType = typeFilter === "ALL" || t.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const totalAmountCompleted = filteredTransactions
    .filter((t) => t.status === "COMPLETED")
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const columns: Column<TransactionItem>[] = [
    {
      key: "providerRef",
      header: "M-Pesa Receipt / Ref",
      render: (row) => (
        <div className="flex flex-col font-mono">
          <span className="font-bold text-sky-400 text-xs sm:text-sm">{row.providerRef}</span>
          <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
            Order #{row.bookingId.slice(0, 8)}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Date",
      render: (row) => (
        <span className="text-xs text-slate-300 font-mono">
          {formatDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => {
        const typeLabels: Record<string, string> = {
          service: "Service Wash",
          deposit: "Booking Deposit",
          balance: "Balance Due",
          tip: "Rider Tip",
          refund: "Reversal / Refund",
        };
        return (
          <span className="capitalize text-xs font-medium text-slate-300">
            {typeLabels[row.type] || row.type}
          </span>
        );
      },
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => (
        <span className="font-bold text-xs sm:text-sm text-white font-mono">
          {formatKes(row.amount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const variant =
          row.status === "COMPLETED"
            ? "emerald"
            : row.status === "PENDING"
            ? "amber"
            : "rose";
        return <StatusChip label={row.status} variant={variant} size="sm" />;
      },
    },
    {
      key: "actions",
      header: "Receipt",
      className: "text-right",
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            loadReceipt(row.id);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 hover:border-sky-400/40 bg-white/5 hover:bg-white/10 text-xs font-semibold text-sky-300 transition"
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>View</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header & Metric Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Transactions & Receipts
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Complete immutable ledger of your deposits, service payments, tips and refunds.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredTransactions.length === 0}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 transition disabled:opacity-40"
            title="Export filtered records to safe CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card variant="glass" className="p-4 sm:p-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            Total Completed Payments
          </span>
          <div className="text-xl sm:text-2xl font-black text-white font-mono mt-1">
            {formatKes(totalAmountCompleted)}
          </div>
          <span className="text-xs text-emerald-400 font-medium mt-0.5 block">
            {filteredTransactions.filter((t) => t.status === "COMPLETED").length} settled transactions
          </span>
        </Card>

        <Card variant="glass" className="p-4 sm:p-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            Filtered Records
          </span>
          <div className="text-xl sm:text-2xl font-black text-white font-mono mt-1">
            {filteredTransactions.length}
          </div>
          <span className="text-xs text-slate-400 font-medium mt-0.5 block">
            Across selected date and type filters
          </span>
        </Card>

        <Card variant="glass" className="p-4 sm:p-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            Payment Method
          </span>
          <div className="text-base sm:text-lg font-bold text-white mt-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span>M-Pesa Express (Daraja)</span>
          </div>
          <span className="text-xs text-slate-400 mt-0.5 block">
            Direct STK Push verification
          </span>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card variant="subtle" className="p-3.5">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by M-Pesa receipt code or Order ID..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400 transition"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-slate-200 focus:outline-none focus:border-sky-400"
              aria-label="Filter by transaction status"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-slate-200 focus:outline-none focus:border-sky-400"
              aria-label="Filter by transaction type"
            >
              <option value="ALL">All Types</option>
              <option value="service">Service</option>
              <option value="deposit">Deposit</option>
              <option value="balance">Balance</option>
              <option value="tip">Tip</option>
              <option value="refund">Refund</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Transactions Data Table */}
      <DataTable
        columns={columns}
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        loading={loading}
        pageSize={10}
        emptyTitle="No transactions found"
        emptyDescription={
          searchQuery || statusFilter !== "ALL" || typeFilter !== "ALL"
            ? "No records matched your search or filter criteria. Try clearing filters."
            : "You have not completed any payments yet. Book a wash to get started."
        }
        emptyAction={
          searchQuery || statusFilter !== "ALL" || typeFilter !== "ALL"
            ? {
                label: "Clear Filters",
                onClick: () => {
                  setSearchQuery("");
                  setStatusFilter("ALL");
                  setTypeFilter("ALL");
                },
              }
            : {
                label: "Book a Wash",
                href: "/client/book",
              }
        }
      />

      {/* Receipt Modal */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-5 animate-in fade-in-50 zoom-in-95 max-h-[90dvh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-title"
          >
            {/* Receipt Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20">
                  <Waves className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 id="receipt-title" className="text-base font-extrabold text-white leading-tight">
                    WashFlow Kenya
                  </h3>
                  <span className="text-[11px] text-sky-400 font-mono">Official Payment Receipt</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition"
                  title="Print receipt"
                  aria-label="Print receipt"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReceipt(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition"
                  title="Close receipt"
                  aria-label="Close receipt"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Receipt Body */}
            <div className="space-y-4 text-xs">
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Receipt Number</span>
                  <span className="font-mono font-bold text-sky-300 text-sm">{activeReceipt.receiptNumber}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Date</span>
                  <span className="font-mono text-slate-200">{formatDate(activeReceipt.date)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">Customer</span>
                  <span className="font-semibold text-white">{activeReceipt.customerName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Delivery Address</span>
                  <span className="text-slate-300 truncate block">{activeReceipt.deliveryAddress}</span>
                </div>
              </div>

              {/* Items Breakdown */}
              {activeReceipt.items && activeReceipt.items.length > 0 && (
                <div className="border-t border-white/10 pt-3 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Laundry Items Breakdown
                  </span>
                  <div className="divide-y divide-white/5 bg-white/[0.02] rounded-xl border border-white/5 p-2">
                    {activeReceipt.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1.5 text-xs">
                        <span className="text-slate-200">
                          {item.variant} <span className="text-slate-400 text-[11px]">× {item.qty}</span>
                        </span>
                        <span className="font-mono font-medium text-slate-100">{formatKes(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Financial Totals */}
              <div className="border-t border-white/10 pt-3 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span>{formatKes(activeReceipt.subtotal)}</span>
                </div>
                {activeReceipt.discount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount Applied:</span>
                    <span>-{formatKes(activeReceipt.discount)}</span>
                  </div>
                )}
                {activeReceipt.tip > 0 && (
                  <div className="flex justify-between text-indigo-400">
                    <span>Rider Tip:</span>
                    <span>+{formatKes(activeReceipt.tip)}</span>
                  </div>
                )}
                <div className="flex justify-between text-white font-bold text-sm border-t border-white/10 pt-2">
                  <span>Total Paid via M-Pesa:</span>
                  <span className="text-sky-300">{formatKes(activeReceipt.totalPaid)}</span>
                </div>
              </div>
            </div>

            {/* Receipt Modal Footer */}
            <div className="pt-2 text-center text-[10px] text-slate-500 font-mono">
              Thank you for trusting WashFlow Kenya. Doorstep laundry done right.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientTransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto py-12 text-center text-slate-400 text-xs">
          Loading transaction records...
        </div>
      }
    >
      <TransactionsContent />
    </Suspense>
  );
}
