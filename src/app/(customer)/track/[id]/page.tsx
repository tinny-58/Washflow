"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Sparkles,
  MapPin,
  CreditCard,
  Star,
  RefreshCw,
  Phone,
  ShieldCheck,
  ArrowRight,
  PackageCheck,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { STATUS_METADATA, BookingStatus } from "@/lib/state-machine";

export default function TrackBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: bookingId } = use(params);

  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // M-Pesa STK state
  const [payingMpesa, setPayingMpesa] = useState<boolean>(false);
  const [mpesaStatus, setMpesaStatus] = useState<string | null>(null);

  const loadBooking = async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load booking details");
        return;
      }
      setBooking(data.booking);
    } catch {
      setError("Network error fetching booking.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBooking();

    // Listen to Server-Sent Events for real-time status changes
    const eventSource = new EventSource("/api/admin/sse");
    eventSource.addEventListener("STATUS_UPDATED", (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.bookingId === bookingId) {
          loadBooking();
        }
      } catch {}
    });

    eventSource.addEventListener("PAYMENT_RECEIVED", (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.bookingId === bookingId) {
          loadBooking();
        }
      } catch {}
    });

    // Also poll every 15s as backup
    const interval = setInterval(loadBooking, 15000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [bookingId]);

  // Trigger M-Pesa STK Push
  const handleInitiateMpesa = async () => {
    if (!booking) return;
    setPayingMpesa(true);
    setMpesaStatus("Sending M-Pesa STK Push to your phone...");

    try {
      const res = await fetch("/api/payments/mpesa/stk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          phone: booking.customer?.phone,
          amount: booking.total,
          type: "service",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMpesaStatus(data.error || "M-Pesa STK request failed.");
        setPayingMpesa(false);
        return;
      }

      setMpesaStatus("📲 Please check your phone and enter your M-Pesa PIN to complete payment.");
      // Poll for payment confirmation
      const pollTimer = setInterval(async () => {
        const checkRes = await fetch(`/api/bookings/${booking.id}`);
        const checkData = await checkRes.json();
        if (checkData.booking?.paymentStatus === "PAID") {
          clearInterval(pollTimer);
          setPayingMpesa(false);
          setMpesaStatus("✅ Payment confirmed via M-Pesa! Thank you.");
          setBooking(checkData.booking);
        }
      }, 3000);

      // Stop polling after 45 seconds
      setTimeout(() => clearInterval(pollTimer), 45000);
    } catch {
      setMpesaStatus("Payment network error.");
      setPayingMpesa(false);
    }
  };

  const steps: BookingStatus[] = [
    "PENDING",
    "CONFIRMED",
    "PICKED_UP",
    "WASHING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ];

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Loading live order timeline...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex-1 max-w-md mx-auto p-6 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
          <Clock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Booking Not Found</h2>
        <p className="text-xs text-slate-300">{error || "Could not find this laundry order."}</p>
        <Link
          href="/book"
          className="px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-semibold"
        >
          Book a Pickup
        </Link>
      </div>
    );
  }

  const currentStepIndex = steps.indexOf(booking.status as BookingStatus);
  const currentMeta = STATUS_METADATA[booking.status as BookingStatus] || {
    label: booking.status,
    description: "",
  };

  return (
    <div className="flex-1 max-w-xl mx-auto px-4 py-6 w-full space-y-5">
      {/* Header & Status Card */}
      <GlassCard className="relative overflow-hidden space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono tracking-wider text-slate-400">
            ORDER #{booking.id.slice(0, 8).toUpperCase()}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              booking.status === "DELIVERED"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : booking.status === "CANCELLED"
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                : "bg-sky-500/20 text-sky-300 border border-sky-400/30 animate-pulse"
            }`}
          >
            {currentMeta.label}
          </span>
        </div>

        <div className="space-y-1">
          <h2 className="text-2xl font-black text-white">{currentMeta.label}</h2>
          <p className="text-xs text-slate-300 leading-relaxed">{currentMeta.description}</p>
        </div>

        {/* Live Status Tracker Timeline */}
        {booking.status !== "CANCELLED" && (
          <div className="pt-4 pb-2">
            <div className="relative flex items-center justify-between">
              {/* Timeline Connector Line */}
              <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/10 -translate-y-1/2 z-0" />
              <div
                className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-sky-500 to-indigo-500 -translate-y-1/2 z-0 transition-all duration-700"
                style={{
                  width: `${(Math.max(0, currentStepIndex) / (steps.length - 1)) * 100}%`,
                }}
              />

              {steps.map((step, idx) => {
                const isPassed = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <div key={step} className="relative z-10 flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                        isCurrent
                          ? "bg-sky-400 text-slate-950 ring-4 ring-sky-500/30 scale-125 shadow-lg shadow-sky-500/50"
                          : isPassed
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-500 border border-white/10"
                      }`}
                    >
                      {isPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-medium">
              <span>Booked</span>
              <span>Pickup</span>
              <span>Wash</span>
              <span>Delivered</span>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Post-Delivery Rating Prompt (Prominent when Delivered) */}
      {booking.status === "DELIVERED" && (
        <GlassCard className="border-emerald-500/40 bg-emerald-950/30 space-y-3">
          <div className="flex items-center gap-2 text-emerald-300">
            <PackageCheck className="w-5 h-5" />
            <h3 className="text-sm font-bold">Laundry Delivered!</h3>
          </div>
          <p className="text-xs text-slate-200">
            How was your laundry experience? Please leave a 1-5 star rating and feedback.
          </p>
          <Link
            href={`/rate/${booking.id}`}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 text-white font-bold text-xs tracking-wide shadow-md flex items-center justify-center gap-1.5"
          >
            <Star className="w-4 h-4 fill-white" />
            <span>Rate & Tip Cleaner</span>
          </Link>
        </GlassCard>
      )}

      {/* Payment Action Card (if unpaid) */}
      {booking.paymentStatus === "UNPAID" && (
        <GlassCard className="border-sky-500/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-white">Payment Outstanding</span>
            </div>
            <span className="text-sm font-extrabold text-white">
              KES {booking.total.toLocaleString()}
            </span>
          </div>

          {mpesaStatus && (
            <div className="p-2.5 rounded-xl bg-sky-500/15 border border-sky-400/30 text-xs text-sky-200">
              {mpesaStatus}
            </div>
          )}

          <button
            type="button"
            onClick={handleInitiateMpesa}
            disabled={payingMpesa}
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs tracking-wide transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
          >
            {payingMpesa ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>Pay KES {booking.total.toLocaleString()} via M-Pesa STK</span>
              </>
            )}
          </button>
        </GlassCard>
      )}

      {/* Booking Items & Price Snapshot Summary */}
      <GlassCard className="space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Order Items & Pricing Snapshot
        </h3>

        <div className="divide-y divide-white/10">
          {booking.items?.map((item: any) => (
            <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-white">{item.variant}</span>
                <span className="text-slate-400 ml-1.5 font-mono">x{item.qty}</span>
              </div>
              <span className="font-bold text-slate-200">
                KES {(item.qty * item.unitPriceSnapshot).toLocaleString()}
              </span>
            </div>
          ))}

          {booking.tipAmount > 0 && (
            <div className="py-2.5 flex items-center justify-between text-xs text-amber-300">
              <span>Cleaner Tip</span>
              <span className="font-bold">KES {booking.tipAmount.toLocaleString()}</span>
            </div>
          )}

          <div className="pt-3 flex items-center justify-between text-sm font-black text-white">
            <span>Total</span>
            <span className="text-sky-300">KES {booking.total.toLocaleString()}</span>
          </div>
        </div>
      </GlassCard>

      {/* Delivery Details Card */}
      <GlassCard className="space-y-2 text-xs">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
          Pickup Details
        </h3>
        <div className="flex items-start gap-2 text-slate-300">
          <Clock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <span>Window: {booking.pickupWindow}</span>
        </div>
        {booking.address && (
          <div className="flex items-start gap-2 text-slate-300">
            <MapPin className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-medium">{booking.address.addressText}</p>
              {booking.address.landmark && (
                <p className="text-slate-400">Landmark: {booking.address.landmark}</p>
              )}
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
