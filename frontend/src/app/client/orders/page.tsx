"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  ArrowRight,
  MapPin,
  Calendar,
  XCircle,
  RotateCcw,
  Tag,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Receipt,
  FileText,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

interface OrderRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  pickupWindow: string;
  notes?: string;
  subtotal: number;
  discountAmount: number;
  tipAmount: number;
  total: number;
  paymentStatus: string;
  posterSrc?: string;
  estimatedDeliveryAt?: string;
  addressText?: string;
  landmark?: string;
  addressLabel?: string;
  voucherId?: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  PENDING: { label: "Booked", bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30" },
  CONFIRMED: { label: "Confirmed", bg: "bg-sky-500/15", text: "text-sky-300", border: "border-sky-500/30" },
  PICKED_UP: { label: "Collected", bg: "bg-indigo-500/15", text: "text-indigo-300", border: "border-indigo-500/30" },
  IN_WASH: { label: "Washing & Drying", bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-500/30" },
  WASHED: { label: "Folded & Ready", bg: "bg-teal-500/15", text: "text-teal-300", border: "border-teal-500/30" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", bg: "bg-cyan-500/15", text: "text-cyan-300", border: "border-cyan-500/30" },
  DELIVERED: { label: "Delivered", bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30" },
  CANCELLED: { label: "Cancelled", bg: "bg-rose-500/15", text: "text-rose-300", border: "border-rose-500/30" },
};

export default function ClientOrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "DELIVERED" | "CANCELLED">("ALL");

  // Cancellation modal state
  const [cancellingOrder, setCancellingOrder] = useState<OrderRecord | null>(null);
  const [cancelLoading, setCancelLoading] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/client/orders", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          setOrders(data.orders);
        }
      }
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    const handleRefresh = () => fetchOrders();
    window.addEventListener("client-refresh", handleRefresh);
    return () => window.removeEventListener("client-refresh", handleRefresh);
  }, [fetchOrders]);

  const handleCancelOrder = async () => {
    if (!cancellingOrder) return;
    setCancelLoading(true);
    setCancelError(null);

    try {
      const res = await fetch(`/api/client/orders/${cancellingOrder.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Client requested cancellation via portal" }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.error || "Failed to cancel order.");
        setCancelLoading(false);
        return;
      }

      setCancellingOrder(null);
      await fetchOrders();
      window.dispatchEvent(new CustomEvent("client-refresh"));
    } catch {
      setCancelError("Network error attempting to cancel order.");
    } finally {
      setCancelLoading(false);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (filter === "ALL") return true;
    if (filter === "DELIVERED") return order.status === "DELIVERED";
    if (filter === "CANCELLED") return order.status === "CANCELLED";
    if (filter === "ACTIVE") {
      return (
        order.status !== "DELIVERED" &&
        order.status !== "CANCELLED"
      );
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            My Orders
          </h1>
          <p className="text-sm text-slate-300">
            View history, track current pickups, and manage wash requests
          </p>
        </div>

        <Link
          href="/client/book"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-sky-500/20 transition self-start sm:self-auto"
        >
          <span>Schedule New Wash</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {(["ALL", "ACTIVE", "DELIVERED", "CANCELLED"] as const).map((tab) => {
          const isActive = filter === tab;
          const count =
            tab === "ALL"
              ? orders.length
              : tab === "ACTIVE"
              ? orders.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED").length
              : orders.filter((o) => o.status === tab).length;

          return (
            <button
              type="button"
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                isActive
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "bg-white/5 text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <span>{tab === "ALL" ? "All Orders" : tab.charAt(0) + tab.slice(1).toLowerCase()}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? "bg-white/20 text-white" : "bg-white/10 text-slate-400"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-40 rounded-2xl bg-white/5 border border-white/10" />
          <div className="h-40 rounded-2xl bg-white/5 border border-white/10" />
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const statusMeta = STATUS_CONFIG[order.status] || {
              label: order.status,
              bg: "bg-white/10",
              text: "text-white",
              border: "border-white/20",
            };
            const canCancel = order.status === "PENDING" || order.status === "CONFIRMED";
            const isDelivered = order.status === "DELIVERED";

            return (
              <GlassCard
                key={order.id}
                className="p-5 sm:p-6 bg-slate-900/70 border border-white/10 rounded-2xl space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sky-400">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-extrabold text-white">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Placed on {new Date(order.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        order.paymentStatus === "PAID"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {order.paymentStatus === "PAID" ? "M-Pesa Paid" : "Unpaid"}
                    </span>

                    <span className="font-mono font-extrabold text-white text-base">
                      KES {order.total.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Info row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="flex items-start gap-2 text-slate-300">
                    <Clock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Pickup Window</span>
                      <span>{order.pickupWindow}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-slate-300">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Delivery Location</span>
                      <span className="truncate block max-w-xs">{order.addressText || "Home Pin"}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-slate-300">
                    <Tag className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Discounts</span>
                      <span>
                        {order.discountAmount > 0
                          ? `Voucher Applied (- KES ${order.discountAmount})`
                          : "Standard Rate"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancellingOrder(order);
                          setCancelError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel Wash</span>
                      </button>
                    )}

                    {isDelivered && (
                      <Link
                        href={`/client/payments?receipt=${order.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition flex items-center gap-1.5"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>View Receipt</span>
                      </Link>
                    )}
                  </div>

                  <Link
                    href={`/client/track/${order.id}`}
                    className="px-4 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <span>Track Order Timeline</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </GlassCard>
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
            <Package className="w-8 h-8 text-slate-300" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No Orders Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {filter === "ALL"
                ? "You haven't booked any laundry orders yet. Ready to experience fresh door-to-door laundry?"
                : `You do not have any orders currently marked as ${filter.toLowerCase()}.`}
            </p>
          </div>
          <Link
            href="/client/book"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md shadow-sky-500/20 transition"
          >
            <span>Book Your First Wash</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* CANCELLATION MODAL */}
      {cancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900 border border-rose-500/30 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Cancel Wash Order</h3>
                <p className="text-xs text-slate-400">Order #{cancellingOrder.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to cancel this booking? If you applied a free wash voucher, it will be immediately restored to your available voucher wallet.
            </p>

            {cancelError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {cancelError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCancellingOrder(null)}
                disabled={cancelLoading}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={cancelLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/25 transition flex items-center gap-2"
              >
                {cancelLoading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    <span>Confirm Cancellation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
