"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Package, Truck, ArrowRight, PlusCircle } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export default function ClientTrackIndexPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/client/overview")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.activeOrder) {
          router.replace(`/client/track/${data.activeOrder.id}`);
          return;
        }

        // If no active order, check for any recent orders
        fetch("/api/client/orders")
          .then((r) => r.json())
          .then((orderData) => {
            if (orderData.success && Array.isArray(orderData.orders)) {
              setOrders(orderData.orders);
            }
          })
          .catch(() => {})
          .finally(() => setLoading(false));
      })
      .catch(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-24 text-center space-y-4">
        <div className="w-10 h-10 rounded-full border-2 border-sky-400 border-t-transparent animate-spin mx-auto" />
        <p className="text-xs text-slate-400">Finding your active order...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-sky-400">
          <Truck className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-extrabold text-white">Track Your Wash</h1>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          You don't have a wash currently in progress. Select a previous order or book your next wash.
        </p>
      </div>

      {orders.length > 0 ? (
        <GlassCard className="p-5 bg-slate-900/70 border border-white/10 rounded-2xl space-y-3">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Past Orders
          </h2>
          <div className="divide-y divide-white/5">
            {orders.slice(0, 5).map((o) => (
              <Link
                key={o.id}
                href={`/client/track/${o.id}`}
                className="py-3 flex items-center justify-between hover:bg-white/5 px-2 rounded-lg transition"
              >
                <div>
                  <span className="font-mono text-xs font-bold text-white block">
                    #{o.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(o.createdAt).toLocaleDateString()} &middot; {o.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-300">KES {o.total}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </Link>
            ))}
          </div>
        </GlassCard>
      ) : null}

      <div className="text-center">
        <Link
          href="/client/book"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-bold text-xs shadow-md shadow-sky-500/20"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Book a Wash Now</span>
        </Link>
      </div>
    </div>
  );
}
