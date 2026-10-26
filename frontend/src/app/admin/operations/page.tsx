"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Filter,
  List,
  Map as MapIcon,
  Phone,
  MapPin,
  Clock,
  MessageSquare,
  Zap,
  Download,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Search,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { MapView } from "@/components/admin/map-view";

const STATUSES = [
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

function maskPhone(phone?: string): string {
  if (!phone) return "No phone registered";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "••••";
  const prefix = phone.startsWith("+") ? phone.slice(0, 4) : digits.slice(0, 3);
  const suffix = digits.slice(-3);
  return `${prefix} ••• ••• ${suffix}`;
}

export default function AdminOperationsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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
      console.error("Failed to fetch operations bookings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 15000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  const handleConfirmAndWhatsApp = async (bookingId: string) => {
    setConfirmingId(bookingId);
    try {
      const res = await fetch(`/api/admin/whatsapp/bookings/${bookingId}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchBookings();
      } else {
        alert(data.error || "Failed to confirm booking.");
      }
    } catch {
      alert("Network error confirming booking.");
    } finally {
      setConfirmingId(null);
    }
  };

  const filteredBookings = bookings.filter((b) => {
    const matchesStatus = selectedStatus === "ALL" || b.status === selectedStatus;
    const matchesSearch =
      !searchQuery.trim() ||
      (b.customerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.addressText || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-sky-400" />
            <span>Orders & Live Map</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Geographic pickup cluster dispatching, live order pipeline, and status updates
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/10">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === "list"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List View</span>
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === "map"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Live Map</span>
            </button>
          </div>

          <button
            onClick={fetchBookings}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition"
            title="Refresh Orders"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by customer, street, or ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {STATUSES.map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex-shrink-0 ${
                selectedStatus === st
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "bg-white/5 text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Display: Map vs Grid */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 text-xs">Loading operational orders...</div>
      ) : viewMode === "map" ? (
        <div className="h-[620px] w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative">
          <MapView bookings={filteredBookings} />
        </div>
      ) : filteredBookings.length === 0 ? (
        <GlassCard className="p-16 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm font-semibold text-white">No orders matching this filter</p>
          <p className="text-xs text-slate-400">
            {searchQuery ? "Try refining your search terms." : "All active queues are clear."}
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

                <div className="text-xs text-slate-300 space-y-1">
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
                    <span>Pickup: {booking.pickupWindow || "Flexible"}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Order Total:</span>
                  <span className="font-bold text-white">KES {booking.total?.toLocaleString() ?? 0}</span>
                </div>
              </div>

              {booking.status === "PENDING" && (
                <div className="pt-2 border-t border-white/10">
                  <button
                    onClick={() => handleConfirmAndWhatsApp(booking.id)}
                    disabled={confirmingId === booking.id}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{confirmingId === booking.id ? "Confirming..." : "Confirm & Send WhatsApp"}</span>
                  </button>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
