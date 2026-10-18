"use client";

import React, { useEffect, useState } from "react";
import {
  Sparkles,
  Phone,
  MessageSquare,
  MapPin,
  Clock,
  Download,
  AlertCircle,
  CheckCircle2,
  Filter,
  DollarSign,
  Package,
  Layers,
  Heart,
  Ban,
  Check,
  Map as MapIcon,
  List,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { SoundNotifierToggle, playBookingChime } from "@/components/admin/sound-notifier";
import { MapView } from "@/components/admin/map-view";

export default function AdminDashboardPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    totalOrders: 0,
    activeQueueCount: 0,
    deliveredCount: 0,
    grossRevenue: 0,
    totalTips: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [newOrderNotice, setNewOrderNotice] = useState<string | null>(null);

  const fetchBookings = async () => {
    try {
      const res = await fetch(`/api/admin/bookings?status=${selectedStatus}`);
      const data = await res.json();
      if (data.success) {
        setBookings(data.bookings);
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error("Failed to load admin bookings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [selectedStatus]);

  // Connect to SSE for real-time order notifications
  useEffect(() => {
    const eventSource = new EventSource("/api/admin/sse");

    eventSource.addEventListener("NEW_BOOKING", (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (soundEnabled) {
          playBookingChime();
        }
        setNewOrderNotice(`New Order #${payload.booking?.id?.slice(0, 8)} received!`);
        setTimeout(() => setNewOrderNotice(null), 6000);
        fetchBookings();
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    });

    eventSource.addEventListener("STATUS_UPDATED", () => {
      fetchBookings();
    });

    eventSource.addEventListener("PAYMENT_RECEIVED", () => {
      fetchBookings();
    });

    return () => {
      eventSource.close();
    };
  }, [soundEnabled]);

  // One-tap status transition handler
  const handleTransitionStatus = async (bookingId: string, nextStatus: string) => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        fetchBookings();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update status");
      }
    } catch {
      alert("Network error updating status");
    }
  };

  // Block/Unblock customer handler
  const handleToggleBlockCustomer = async (customerId: string, currentBlocked: boolean) => {
    const confirmMsg = currentBlocked
      ? "Unblock this customer to allow new bookings?"
      : "Block this customer from placing future bookings?";
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/admin/customers/${customerId}/block`, {
        method: "POST",
      });
      if (res.ok) {
        fetchBookings();
      }
    } catch {
      alert("Failed to toggle customer block status");
    }
  };

  const statuses = [
    "ALL",
    "PENDING",
    "CONFIRMED",
    "PICKED_UP",
    "WASHING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ];

  return (
    <div className="space-y-6">
      {/* Live Notice Banner */}
      {newOrderNotice && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-sky-500/20 border border-emerald-400/50 flex items-center justify-between text-white text-xs font-bold animate-pulse shadow-lg">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>🚨 {newOrderNotice}</span>
          </div>
          <button
            onClick={() => setNewOrderNotice(null)}
            className="text-slate-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <GlassCard className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Gross Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black text-white">
            KES {metrics.grossRevenue.toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-400 font-medium">Delivered & Paid Orders</div>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Active Queue</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-black text-white">{metrics.activeQueueCount}</div>
          <div className="text-[10px] text-sky-400 font-medium">Pending & In-Wash Orders</div>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Completed Orders</span>
            <Package className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-black text-white">{metrics.deliveredCount}</div>
          <div className="text-[10px] text-indigo-400 font-medium">Spotless Deliveries</div>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Cleaner Tips</span>
            <Heart className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-black text-white">
            KES {metrics.totalTips.toLocaleString()}
          </div>
          <div className="text-[10px] text-amber-400 font-medium">100% Direct Staff Gratuity</div>
        </GlassCard>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {statuses.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setSelectedStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedStatus === st
                  ? "bg-sky-500 text-white shadow-sm shadow-sky-500/25"
                  : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* View Toggle & Controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* List vs Map Toggle */}
          <div className="p-1 rounded-xl bg-slate-900 border border-white/10 flex items-center">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg text-xs font-medium transition ${
                viewMode === "list" ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={`p-1.5 rounded-lg text-xs font-medium transition ${
                viewMode === "map" ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
              }`}
              title="Map View"
            >
              <MapIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Sound Toggle */}
          <SoundNotifierToggle
            soundEnabled={soundEnabled}
            onToggleSound={() => setSoundEnabled(!soundEnabled)}
          />

          {/* Export CSV */}
          <a
            href="/api/admin/export"
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5"
            download
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Main View: Map or List */}
      {viewMode === "map" ? (
        <MapView
          bookings={bookings.map((b) => ({
            id: b.id,
            status: b.status,
            total: b.total,
            pickupWindow: b.pickupWindow,
            customerName: b.customerName,
            customerPhone: b.customerPhone,
            address: {
              lat: b.lat,
              lng: b.lng,
              addressText: b.addressText,
              landmark: b.landmark,
            },
          }))}
          onStatusChange={handleTransitionStatus}
        />
      ) : (
        /* Orders List */
        <div className="space-y-3">
          {bookings.length === 0 ? (
            <GlassCard className="py-12 text-center text-slate-400 text-xs">
              No bookings found in this status category.
            </GlassCard>
          ) : (
            bookings.map((b) => {
              const cleanPhone = b.customerPhone?.replace(/\+/g, "") || "";
              return (
                <GlassCard key={b.id} className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-sky-300">
                        #{b.id.slice(0, 8).toUpperCase()}
                      </span>
                      {b.posterSrc && (
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-semibold text-slate-300">
                          {b.posterSrc}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">
                        {new Date(b.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          b.status === "DELIVERED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : b.status === "CANCELLED"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "bg-sky-500/20 text-sky-300 border border-sky-400/30 animate-pulse"
                        }`}
                      >
                        {b.status}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.paymentStatus === "PAID"
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {b.paymentStatus}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Customer info & shortcuts */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">{b.customerName}</span>
                        {b.customerBlocked && (
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                            BLOCKED
                          </span>
                        )}
                      </div>
                      <div className="text-slate-300">{b.customerPhone}</div>

                      {/* Call & WhatsApp Shortcuts */}
                      <div className="flex items-center gap-2 pt-1">
                        <a
                          href={`tel:${b.customerPhone}`}
                          className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-[11px] font-semibold flex items-center gap-1 transition"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>

                        <a
                          href={`https://wa.me/${cleanPhone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 transition"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </a>

                        <button
                          type="button"
                          onClick={() =>
                            handleToggleBlockCustomer(b.customerId, b.customerBlocked)
                          }
                          className={`p-1 rounded-lg border text-[11px] transition ${
                            b.customerBlocked
                              ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                          }`}
                          title={b.customerBlocked ? "Unblock customer" : "Block customer"}
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Address & Window */}
                    <div className="space-y-1 text-slate-300">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                        <span className="font-medium text-white">{b.addressText}</span>
                      </div>
                      {b.landmark && (
                        <div className="text-[11px] text-slate-400 pl-5">Near: {b.landmark}</div>
                      )}
                      <div className="flex items-center gap-1.5 pl-5 text-[11px] text-sky-300">
                        <Clock className="w-3 h-3" />
                        <span>{b.pickupWindow}</span>
                      </div>
                      {b.notes && (
                        <div className="text-[11px] text-amber-200/90 pl-5 italic">
                          Note: &quot;{b.notes}&quot;
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pricing & One-Tap Status Transitions */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-white/10">
                    <div className="text-xs">
                      <span className="text-slate-400">Total: </span>
                      <span className="font-black text-white text-sm">
                        KES {b.total.toLocaleString()}
                      </span>
                      {b.tipAmount > 0 && (
                        <span className="text-amber-400 ml-2 font-semibold">
                          (+KES {b.tipAmount} tip)
                        </span>
                      )}
                    </div>

                    {/* Next Allowed Transitions Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {b.nextAllowedTransitions?.map((nextSt: string) => (
                        <button
                          key={nextSt}
                          type="button"
                          onClick={() => handleTransitionStatus(b.id, nextSt)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 shadow-sm ${
                            nextSt === "CANCELLED"
                              ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                              : nextSt === "DELIVERED"
                              ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-emerald-500/20"
                              : "bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/20"
                          }`}
                        >
                          <span>Move to {nextSt.replace(/_/g, " ")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
