"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CreditCard,
  Receipt,
  Printer,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Download,
  Calendar,
  Waves,
  Tag,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

interface PaymentItem {
  id: string;
  bookingId: string;
  type: string;
  provider: string;
  providerRef: string;
  amount: number;
  status: string;
  createdAt: string;
  bookingStatus: string;
  bookingTotal: number;
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

function PaymentsContent() {
  const searchParams = useSearchParams();
  const receiptBookingId = searchParams.get("receipt");

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Receipt Modal state
  const [activeReceipt, setActiveReceipt] = useState<ReceiptDetails | null>(null);
  const [receiptLoading, setReceiptLoading] = useState<boolean>(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    try {
      const res = await fetch("/api/client/payments", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.payments)) {
          setPayments(data.payments);

          // If URL requested a specific booking receipt, open it
          if (receiptBookingId) {
            const match = data.payments.find(
              (p: PaymentItem) => p.bookingId === receiptBookingId
            );
            if (match) {
              loadReceipt(match.id);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch payments:", err);
    } finally {
      setLoading(false);
    }
  }, [receiptBookingId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const loadReceipt = async (paymentId: string) => {
    setReceiptLoading(true);
    setReceiptError(null);
    try {
      const res = await fetch(`/api/client/payments/${paymentId}/receipt`);
      const data = await res.json();
      if (res.ok && data.success && data.receipt) {
        setActiveReceipt(data.receipt);
      } else {
        setReceiptError(data.error || "Failed to load receipt details.");
      }
    } catch {
      setReceiptError("Network error fetching receipt.");
    } finally {
      setReceiptLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totalSpent = payments
    .filter((p) => p.status === "COMPLETED" || p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Payments & Receipts
          </h1>
          <p className="text-sm text-slate-300">
            View M-Pesa transaction records, download official receipts, and track wash expenses
          </p>
        </div>

        <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 self-start sm:self-auto">
          <span className="text-[10px] text-slate-400 uppercase font-bold block">
            Total Laundry Spend
          </span>
          <span className="text-base font-extrabold text-sky-400 font-mono">
            KES {totalSpent.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Payments History Table */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-16 rounded-xl bg-white/5 border border-white/10" />
          <div className="h-16 rounded-xl bg-white/5 border border-white/10" />
          <div className="h-16 rounded-xl bg-white/5 border border-white/10" />
        </div>
      ) : payments.length > 0 ? (
        <GlassCard className="p-0 bg-slate-900/70 border border-white/10 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Receipt / Ref</th>
                  <th className="py-3 px-4">Order</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {payments.map((p) => {
                  const isSuccess = p.status === "COMPLETED" || p.status === "paid";

                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-medium">
                        {new Date(p.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                        {p.providerRef || "M-PESA"}
                      </td>
                      <td className="py-3 px-4 font-mono text-sky-400 whitespace-nowrap">
                        <Link href={`/client/track/${p.bookingId}`} className="hover:underline">
                          #{p.bookingId.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="py-3 px-4 capitalize whitespace-nowrap">
                        {p.type || "Service Wash"}
                      </td>
                      <td className="py-3 px-4 font-mono font-extrabold text-white whitespace-nowrap">
                        KES {p.amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                            isSuccess
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                          }`}
                        >
                          {isSuccess ? "Paid" : p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isSuccess && (
                          <button
                            type="button"
                            onClick={() => loadReceipt(p.id)}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white font-semibold text-[11px] border border-white/10 transition inline-flex items-center gap-1"
                          >
                            <Receipt className="w-3 h-3 text-sky-400" />
                            <span>Receipt</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      ) : (
        <div className="py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
            <CreditCard className="w-8 h-8 text-slate-300" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No Payments Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              You haven't made any laundry payments yet. Once your first order is paid, official M-Pesa receipts will be stored here.
            </p>
          </div>
          <Link
            href="/client/book"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md shadow-sky-500/20 transition"
          >
            <span>Book a Wash</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* PRINTABLE RECEIPT MODAL */}
      {(activeReceipt || receiptLoading || receiptError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl space-y-6 my-8 print:p-0 print:border-none print:shadow-none print:bg-white print:text-black">
            {receiptLoading ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Loading verified receipt...</p>
              </div>
            ) : receiptError ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-xs text-rose-400">{receiptError}</p>
                <button
                  type="button"
                  onClick={() => setActiveReceipt(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-xs text-white"
                >
                  Close
                </button>
              </div>
            ) : activeReceipt ? (
              <>
                {/* Modal Top Actions (Hidden in print) */}
                <div className="flex items-center justify-between pb-3 border-b border-white/10 print:hidden">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Official Receipt
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveReceipt(null)}
                      className="text-slate-400 hover:text-white p-1"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Printable Receipt Content */}
                <div className="space-y-5 text-xs text-slate-300 print:text-black">
                  {/* Brand Header */}
                  <div className="text-center space-y-1">
                    <h2 className="text-lg font-extrabold text-white print:text-black tracking-tight">
                      WashFlow Laundry
                    </h2>
                    <p className="text-[11px] text-slate-400 print:text-gray-600">
                      Door-to-door laundry & dry cleaning service
                    </p>
                    <div className="pt-2 font-mono text-[11px] text-sky-400 print:text-gray-800 font-bold">
                      M-Pesa Ref: {activeReceipt.receiptNumber}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 print:border-gray-300 print:bg-gray-50 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400 print:text-gray-600">Date:</span>
                      <span className="font-semibold text-white print:text-black">
                        {new Date(activeReceipt.date).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 print:text-gray-600">Customer:</span>
                      <span className="font-semibold text-white print:text-black">
                        {activeReceipt.customerName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 print:text-gray-600">Order ID:</span>
                      <span className="font-mono font-semibold text-white print:text-black">
                        #{activeReceipt.bookingId.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 print:text-gray-600">Address:</span>
                      <span className="text-white print:text-black truncate max-w-[200px]">
                        {activeReceipt.deliveryAddress}
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-2">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                      Services Provided
                    </span>
                    <div className="divide-y divide-white/5 print:divide-gray-200">
                      {activeReceipt.items.map((item, idx) => (
                        <div key={idx} className="py-1.5 flex justify-between text-xs">
                          <div>
                            <span className="font-semibold text-white print:text-black">
                              {item.qty}x {item.variant} ({item.category})
                            </span>
                          </div>
                          <span className="font-mono font-bold text-white print:text-black">
                            KES {item.subtotal.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Financial Total Breakdown */}
                  <div className="pt-3 border-t border-white/10 print:border-gray-300 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400 print:text-gray-600">
                      <span>Subtotal:</span>
                      <span className="font-mono">KES {activeReceipt.subtotal.toLocaleString()}</span>
                    </div>

                    {activeReceipt.discount > 0 && (
                      <div className="flex justify-between text-emerald-400 print:text-emerald-700 font-semibold">
                        <span>Voucher Discount:</span>
                        <span className="font-mono">- KES {activeReceipt.discount.toLocaleString()}</span>
                      </div>
                    )}

                    {activeReceipt.tip > 0 && (
                      <div className="flex justify-between text-slate-400 print:text-gray-600">
                        <span>Cleaner Tip:</span>
                        <span className="font-mono">KES {activeReceipt.tip.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-sm font-extrabold text-white print:text-black pt-2 border-t border-white/10 print:border-gray-300">
                      <span>Total Paid via M-Pesa:</span>
                      <span className="font-mono text-emerald-400 print:text-black">
                        KES {activeReceipt.totalPaid.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Paid Stamp */}
                  <div className="text-center pt-3 pb-1">
                    <span className="inline-block px-3 py-1 rounded-full text-[10px] uppercase font-mono font-extrabold border border-emerald-500/40 text-emerald-300 bg-emerald-500/10 print:border-black print:text-black">
                      PAID IN FULL &middot; M-PESA VERIFIED
                    </span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientPaymentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading payments...</div>}>
      <PaymentsContent />
    </Suspense>
  );
}
