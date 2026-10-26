"use client";

import React, { useEffect, useState, use, useRef } from "react";
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
  CreditCard,
  ShieldCheck,
  Star,
  RefreshCw,
  Tag,
  Receipt,
  Phone,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

const TRACKING_STAGES = [
  { key: "PENDING", label: "Booked", desc: "Awaiting pickup confirmation" },
  { key: "CONFIRMED", label: "Confirmed", desc: "Rider assigned for pickup" },
  { key: "PICKED_UP", label: "Collected", desc: "Arrived at wash hub" },
  { key: "IN_WASH", label: "Washing & Drying", desc: "Garments in sanitation cycle" },
  { key: "WASHED", label: "Folded & Ready", desc: "Packaged for delivery" },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery", desc: "Rider heading to your address" },
  { key: "DELIVERED", label: "Delivered", desc: "Successfully completed" },
];

export default function ClientTrackOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: bookingId } = use(params);

  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // M-Pesa STK payment state
  const [payingMpesa, setPayingMpesa] = useState<boolean>(false);
  const [mpesaStatus, setMpesaStatus] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);

  const loadBooking = async () => {
    try {
      const res = await fetch(`/api/client/orders/${bookingId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Order not found or unauthorized.");
        } else {
          setError("Failed to fetch order tracking details.");
        }
        return;
      }
      const data = await res.json();
      if (data.success && data.order) {
        setBooking(data.order);
      }
    } catch {
      setError("Network error fetching tracking data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBooking();

    // Listen to client-scoped SSE
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/client/sse");
      es.addEventListener("booking_updated", (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.id === bookingId || payload.bookingId === bookingId) {
            loadBooking();
          }
        } catch {
          loadBooking();
        }
      });
      es.addEventListener("payment_confirmed", (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.bookingId === bookingId) {
            loadBooking();
          }
        } catch {
          loadBooking();
        }
      });
    } catch {
      // Fallback
    }

    const interval = setInterval(loadBooking, 15000);

    return () => {
      if (es) es.close();
      clearInterval(interval);
    };
  }, [bookingId]);

  // Leaflet map initialization during OUT_FOR_DELIVERY
  useEffect(() => {
    if (!booking || booking.status !== "OUT_FOR_DELIVERY" || !mapContainerRef.current) return;

    let isMounted = true;

    async function initMap() {
      const L = (await import("leaflet")).default;

      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (!isMounted || !mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const destLat = booking.address?.lat || -1.286389;
      const destLng = booking.address?.lng || 36.817223;

      const map = L.map(mapContainerRef.current).setView([destLat, destLng], 14);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OSM</a>',
      }).addTo(map);

      // Destination Marker
      const homeIcon = L.divIcon({
        className: "custom-pin",
        html: `<div style="background-color:#0284c7;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.4);border:2px solid white;">🏠</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      L.marker([destLat, destLng], { icon: homeIcon })
        .addTo(map)
        .bindPopup(`<b>Delivery Destination</b><br>${booking.address?.addressText || ""}`)
        .openPopup();
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [booking]);

  const handleInitiateMpesa = async () => {
    if (!booking) return;
    setPayingMpesa(true);
    setMpesaStatus("Sending M-Pesa STK push prompt to your phone...");

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
      if (res.ok) {
        setMpesaStatus("Prompt sent! Please check your phone and enter your M-Pesa PIN.");
        setTimeout(() => loadBooking(), 6000);
      } else {
        setMpesaStatus(data.error || "Failed to trigger M-Pesa STK. Please try again.");
      }
    } catch {
      setMpesaStatus("Network error triggering M-Pesa.");
    } finally {
      setPayingMpesa(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
        <div className="h-48 rounded-2xl bg-white/5 border border-white/10" />
        <div className="h-64 rounded-2xl bg-white/5 border border-white/10" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-white">Order Not Found</h2>
        <p className="text-xs text-slate-400">
          {error || "The requested order could not be located or does not belong to your account."}
        </p>
        <Link
          href="/client/orders"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
        >
          <span>Return to My Orders</span>
        </Link>
      </div>
    );
  }

  const currentStageIdx = TRACKING_STAGES.findIndex((s) => s.key === booking.status);
  const activeIdx = currentStageIdx >= 0 ? currentStageIdx : 0;
  const isCancelled = booking.status === "CANCELLED";
  const isDelivered = booking.status === "DELIVERED";
  const isOutForDelivery = booking.status === "OUT_FOR_DELIVERY";

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/client/orders"
              className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1"
            >
              <span>My Orders</span>
              <span>/</span>
            </Link>
            <span className="text-xs text-sky-400 font-bold font-mono">
              #{booking.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1">
            Live Order Tracking
          </h1>
        </div>

        <button
          type="button"
          onClick={loadBooking}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold transition flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* Progress Timeline Card */}
      <GlassCard className="p-6 bg-slate-900/70 border border-white/10 rounded-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-medium">Current Status</span>
              <h2 className="text-base font-extrabold text-white">
                {isCancelled
                  ? "Order Cancelled"
                  : TRACKING_STAGES[activeIdx]?.label || booking.status}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${
                booking.paymentStatus === "PAID"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}
            >
              {booking.paymentStatus === "PAID" ? "M-Pesa Confirmed" : "Payment Pending"}
            </span>
          </div>
        </div>

        {/* Multi-step progress bar */}
        {!isCancelled && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {TRACKING_STAGES.map((stage, idx) => {
                const isPassed = idx < activeIdx;
                const isCurrent = idx === activeIdx;

                return (
                  <div
                    key={stage.key}
                    className={`p-3 rounded-xl border text-center transition ${
                      isCurrent
                        ? "bg-sky-500/20 border-sky-500/60 ring-1 ring-sky-400 shadow-md"
                        : isPassed
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : "bg-white/[0.02] border-white/5 opacity-50"
                    }`}
                  >
                    <div className="flex items-center justify-center mb-1.5">
                      {isPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : isCurrent ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500">0{idx + 1}</span>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-bold block leading-tight ${
                        isCurrent ? "text-sky-300" : isPassed ? "text-white" : "text-slate-400"
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-slate-300 bg-sky-950/40 border border-sky-500/20 p-3 rounded-xl flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                <strong>Next: </strong>
                {TRACKING_STAGES[activeIdx]?.desc || "Our team is processing your request."}
              </span>
            </p>
          </div>
        )}
      </GlassCard>

      {/* Live Map only during OUT_FOR_DELIVERY */}
      {isOutForDelivery && (
        <GlassCard className="p-6 bg-slate-900/70 border border-sky-500/30 rounded-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Rider En Route</h3>
                <p className="text-xs text-slate-400">Your laundry is out for immediate delivery</p>
              </div>
            </div>
          </div>

          <div
            ref={mapContainerRef}
            className="w-full h-64 rounded-xl overflow-hidden border border-white/10 shadow-inner"
          />
        </GlassCard>
      )}

      {/* Payment Action if unpaid */}
      {booking.paymentStatus !== "PAID" && !isCancelled && (
        <GlassCard className="p-6 bg-slate-900/70 border border-sky-500/30 rounded-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-sky-400" />
              <h3 className="text-sm font-bold text-white">Complete Payment</h3>
            </div>
            <span className="font-mono text-base font-extrabold text-white">
              KES {booking.total.toLocaleString()}
            </span>
          </div>

          <p className="text-xs text-slate-300">
            You can pay right now via M-Pesa STK push. A prompt will be sent directly to your phone.
          </p>

          {mpesaStatus && (
            <div className="p-3 rounded-xl bg-sky-500/15 border border-sky-400/30 text-xs text-sky-200">
              {mpesaStatus}
            </div>
          )}

          <button
            type="button"
            onClick={handleInitiateMpesa}
            disabled={payingMpesa}
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/25 transition active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {payingMpesa ? (
              <div className="w-4 h-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>Send M-Pesa STK Prompt (KES {booking.total.toLocaleString()})</span>
              </>
            )}
          </button>
        </GlassCard>
      )}

      {/* Order Details & Items Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Logistics & Address */}
        <GlassCard className="p-5 bg-slate-900/70 border border-white/10 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white pb-2 border-b border-white/10">
            Delivery Information
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-2.5 text-slate-300">
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Address</span>
                <p className="font-medium">{booking.address?.addressText || "Home Location"}</p>
                {booking.address?.landmark && (
                  <p className="text-[11px] text-slate-400">Near: {booking.address.landmark}</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-slate-300">
              <Clock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Pickup Window</span>
                <p className="font-medium">{booking.pickupWindow}</p>
              </div>
            </div>

            {booking.notes && (
              <div className="flex items-start gap-2.5 text-slate-300 pt-2 border-t border-white/5">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Special Notes</span>
                  <p className="text-slate-200">{booking.notes}</p>
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Pricing & Voucher Summary */}
        <GlassCard className="p-5 bg-slate-900/70 border border-white/10 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white pb-2 border-b border-white/10">
            Payment Breakdown
          </h3>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Catalog Subtotal</span>
              <span className="font-mono text-white">KES {booking.subtotal.toLocaleString()}</span>
            </div>

            {booking.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span className="flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Free Wash Voucher</span>
                </span>
                <span className="font-mono font-bold">- KES {booking.discountAmount.toLocaleString()}</span>
              </div>
            )}

            <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-white/10">
              <span>Total Amount</span>
              <span className="font-mono text-sky-400">KES {booking.total.toLocaleString()}</span>
            </div>

            <div className="pt-3">
              {isDelivered && (
                <Link
                  href={`/client/payments?receipt=${booking.id}`}
                  className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white flex items-center justify-center gap-2 transition"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Download / Print Receipt</span>
                </Link>
              )}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
