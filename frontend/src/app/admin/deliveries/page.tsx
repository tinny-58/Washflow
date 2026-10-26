"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Truck,
  Package,
  Calendar,
  Clock,
  MapPin,
  Phone,
  RefreshCw,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

function maskPhone(phone?: string): string {
  if (!phone) return "No phone registered";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "••••";
  const prefix = phone.startsWith("+") ? phone.slice(0, 4) : digits.slice(0, 3);
  const suffix = digits.slice(-3);
  return `${prefix} ••• ••• ${suffix}`;
}

const STAGES = [
  { id: "ALL", label: "All Orders" },
  { id: "PENDING", label: "Pending" },
  { id: "CONFIRMED", label: "Confirmed" },
  { id: "PICKED_UP", label: "Picked Up" },
  { id: "WASHING", label: "In Wash" },
  { id: "READY", label: "Washed / Ready" },
  { id: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { id: "DELIVERED", label: "Delivered" },
];

export default function AdminDeliveriesPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStage, setSelectedStage] = useState<string>("ALL");
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bookings");
      if (res.ok) {
        const data = await res.json();
        if (data.bookings) {
          setBookings(data.bookings);
        }
      }
    } catch (err) {
      console.error("Failed to fetch deliveries:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 15000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  const handleAdvanceStatus = async (bookingId: string, nextStatus: string) => {
    setTransitioningId(bookingId);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchBookings();
      } else {
        alert(data.error || "Failed to update order status");
      }
    } catch {
      alert("Network error updating delivery stage");
    } finally {
      setTransitioningId(null);
    }
  };

  const filteredBookings = bookings.filter((b) =>
    selectedStage === "ALL" ? true : b.status === selectedStage
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5 text-sky-400" />
            <span>Deliveries & Logistics</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Stage fulfillment tracking, pickup schedules, and delivery dispatch controls
          </p>
        </div>

        <button
          onClick={fetchBookings}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stage Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {STAGES.map((st) => {
          const count =
            st.id === "ALL"
              ? bookings.length
              : bookings.filter((b) => b.status === st.id).length;
          return (
            <button
              key={st.id}
              onClick={() => setSelectedStage(st.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
                selectedStage === st.id
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "bg-white/5 text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <span>{st.label}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Grid of Delivery Cards */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 text-xs">Loading logistics orders...</div>
      ) : filteredBookings.length === 0 ? (
        <GlassCard className="p-16 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm font-semibold text-white">No deliveries in this stage</p>
          <p className="text-xs text-slate-400">
            Select another fulfillment category or check back as orders progress.
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBookings.map((booking) => (
            <GlassCard key={booking.id} className="p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-sky-400">
                      #{booking.id.slice(0, 8)}
                    </span>
                    <h4 className="text-sm font-bold text-white mt-0.5">
                      {booking.customerName || "Customer"}
                    </h4>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      booking.status === "DELIVERED"
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                        : booking.status === "CANCELLED"
                        ? "bg-rose-500/10 text-rose-300 border-rose-500/20"
                        : "bg-sky-500/10 text-sky-300 border-sky-500/20"
                    }`}
                  >
                    {booking.status}
                  </span>
                </div>

                <div className="text-xs text-slate-300 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{maskPhone(booking.customerPhone)}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="truncate">
                      {booking.addressText || "Drop-off Location"}
                      {booking.landmark ? ` (${booking.landmark})` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Pickup Window: {booking.pickupWindow || "Standard"}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Payment:</span>
                  <span
                    className={`font-semibold ${
                      booking.paymentStatus === "PAID" ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {booking.paymentStatus || "UNPAID"} • KES {booking.total?.toLocaleString() ?? 0}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              {booking.nextAllowedTransitions && booking.nextAllowedTransitions.length > 0 && (
                <div className="pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                  {booking.nextAllowedTransitions.map((nextSt: string) => (
                    <button
                      key={nextSt}
                      onClick={() => handleAdvanceStatus(booking.id, nextSt)}
                      disabled={transitioningId === booking.id}
                      className="flex-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white transition disabled:opacity-50"
                    >
                      {nextSt.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
