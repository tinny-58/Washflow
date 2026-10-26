"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  Phone,
  Clock,
  CreditCard,
  Banknote,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Tag,
  ArrowRight,
  ShieldCheck,
  Building,
  Home,
  Plus,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { LocationPicker, SelectedLocation } from "@/components/customer/location-picker";
import { CatalogSelector } from "@/components/customer/catalog-selector";
import { PriceCatalogItem, Voucher } from "@/lib/types";

interface SavedAddress {
  id: string;
  label: string;
  addressText: string;
  landmark?: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

function BookContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedVoucherCode = searchParams.get("voucher") || "";

  // User state
  const [user, setUser] = useState<{ id: string; name?: string; phone?: string } | null>(null);

  // Items & Cart
  const [selectedItems, setSelectedItems] = useState<{ catalogId: string; qty: number; item: PriceCatalogItem }[]>([]);
  const [cartTotal, setCartTotal] = useState<number>(0);

  // Pickup Schedule
  const [pickupWindow, setPickupWindow] = useState<string>("Morning (8:00 AM - 11:00 AM)");
  const [notes, setNotes] = useState<string>("");

  // Address
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState<boolean>(false);
  const [location, setLocation] = useState<SelectedLocation>({
    lat: -1.286389,
    lng: 36.817223,
    addressText: "",
    landmark: "",
    label: "Home",
  });

  // Vouchers
  const [availableVouchers, setAvailableVouchers] = useState<Voucher[]>([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string>("");

  // Payment choice
  const [paymentChoice, setPaymentChoice] = useState<"PAY_NOW" | "PAY_ON_DELIVERY">("PAY_NOW");
  const [mpesaPhone, setMpesaPhone] = useState<string>("");

  // Submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load user, saved addresses, and available vouchers
  useEffect(() => {
    // 1. Current user
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser(data.user);
          if (data.user.phone) {
            setMpesaPhone(data.user.phone);
          }
        }
      })
      .catch(() => {});

    // 2. Saved addresses
    fetch("/api/client/addresses")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.addresses)) {
          setSavedAddresses(data.addresses);
          if (data.addresses.length > 0) {
            const def = data.addresses.find((a: SavedAddress) => a.isDefault) || data.addresses[0];
            setSelectedAddressId(def.id);
            setUseNewAddress(false);
          } else {
            setUseNewAddress(true);
          }
        } else {
          setUseNewAddress(true);
        }
      })
      .catch(() => setUseNewAddress(true));

    // 3. Available vouchers
    fetch("/api/client/overview")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.availableVouchers)) {
          setAvailableVouchers(data.availableVouchers);
          if (preselectedVoucherCode) {
            const found = data.availableVouchers.find((v: Voucher) => v.code === preselectedVoucherCode);
            if (found) {
              setSelectedVoucherId(found.id);
            }
          }
        }
      })
      .catch(() => {});
  }, [preselectedVoucherCode]);

  // Compute discount
  const activeVoucher = availableVouchers.find((v) => v.id === selectedVoucherId);
  const cap = activeVoucher?.maxDiscountKes ?? activeVoucher?.discountCap ?? 300;
  const discountAmount = activeVoucher ? Math.min(cartTotal, cap) : 0;
  const netTotal = Math.max(0, cartTotal - discountAmount);

  const pickupWindows = [
    "Morning (8:00 AM - 11:00 AM)",
    "Midday (11:00 AM - 2:00 PM)",
    "Afternoon (2:00 PM - 5:00 PM)",
    "Evening (5:00 PM - 8:00 PM)",
  ];

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      setError("Please select at least one service or laundry basket.");
      return;
    }

    if (useNewAddress && !location.addressText.trim()) {
      setError("Please specify your apartment or street address.");
      return;
    }

    if (!useNewAddress && !selectedAddressId) {
      setError("Please select a saved address or pin a new location.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        items: selectedItems.map((i) => ({
          catalogId: i.catalogId,
          qty: i.qty,
        })),
        pickupWindow,
        notes: notes.trim() || undefined,
        paymentChoice,
        expectedSubtotal: cartTotal,
      };

      if (selectedVoucherId) {
        payload.voucherId = selectedVoucherId;
      }

      if (useNewAddress) {
        payload.newAddress = {
          label: location.label || "Home",
          lat: location.lat,
          lng: location.lng,
          addressText: location.addressText,
          landmark: location.landmark,
        };
      } else {
        payload.addressId = selectedAddressId;
      }

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create booking. Please try again.");
        setSubmitting(false);
        return;
      }

      const bookingId = data.booking?.id;

      // If user chose PAY_NOW and booking has an outstanding balance, trigger STK Push
      if (paymentChoice === "PAY_NOW" && netTotal > 0 && bookingId) {
        try {
          await fetch("/api/payments/mpesa/stk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId,
              phone: mpesaPhone || user?.phone,
              amount: netTotal,
              type: "service",
            }),
          });
        } catch {
          // STK push can be completed on the tracking page
        }
      }

      // Notify other components & redirect
      window.dispatchEvent(new CustomEvent("client-refresh"));
      router.push(`/client/track/${bookingId}`);
    } catch (err: any) {
      setError(err.message || "Network error submitting booking.");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Book a Wash
        </h1>
        <p className="text-sm text-slate-300">
          Select your laundry baskets or specialty items, pick a pickup window, and let us handle the rest.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleBookingSubmit} className="space-y-6">
        {/* 1. SERVICE CATALOG SELECTION */}
        <GlassCard className="p-6 bg-slate-900/70 border border-white/10 rounded-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <h2 className="text-base font-bold text-white">1. Select Laundry Services</h2>
              <p className="text-xs text-slate-400">Choose baskets or individual pieces</p>
            </div>
            {selectedItems.length > 0 && (
              <span className="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
                {selectedItems.reduce((acc, i) => acc + i.qty, 0)} items selected
              </span>
            )}
          </div>

          <CatalogSelector
            onItemsChange={(items, total) => {
              setSelectedItems(items);
              setCartTotal(total);
            }}
          />
        </GlassCard>

        {/* 2. PICKUP WINDOW */}
        <GlassCard className="p-6 bg-slate-900/70 border border-white/10 rounded-2xl space-y-4">
          <div className="pb-3 border-b border-white/10">
            <h2 className="text-base font-bold text-white">2. Pickup Schedule</h2>
            <p className="text-xs text-slate-400">When should our rider collect your laundry?</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pickupWindows.map((win) => {
              const selected = pickupWindow === win;
              return (
                <button
                  type="button"
                  key={win}
                  onClick={() => setPickupWindow(win)}
                  className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition ${
                    selected
                      ? "bg-sky-500/15 border-sky-500/60 text-white shadow-md shadow-sky-500/10 ring-1 ring-sky-400"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Clock className={`w-4 h-4 ${selected ? "text-sky-400" : "text-slate-400"}`} />
                    <span className="text-xs font-semibold">{win}</span>
                  </div>
                  {selected && <CheckCircle2 className="w-4 h-4 text-sky-400" />}
                </button>
              );
            })}
          </div>
        </GlassCard>

        {/* 3. LOCATION & ADDRESS */}
        <GlassCard className="p-6 bg-slate-900/70 border border-white/10 rounded-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <h2 className="text-base font-bold text-white">3. Pickup & Delivery Address</h2>
              <p className="text-xs text-slate-400">Choose a saved location or pin a new one</p>
            </div>

            {savedAddresses.length > 0 && (
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setUseNewAddress(false)}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    !useNewAddress ? "bg-sky-500 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Saved Pins
                </button>
                <button
                  type="button"
                  onClick={() => setUseNewAddress(true)}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    useNewAddress ? "bg-sky-500 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Pin New
                </button>
              </div>
            )}
          </div>

          {!useNewAddress && savedAddresses.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {savedAddresses.map((addr) => {
                const isSelected = selectedAddressId === addr.id;
                return (
                  <button
                    type="button"
                    key={addr.id}
                    onClick={() => setSelectedAddressId(addr.id)}
                    className={`p-3.5 rounded-xl border text-left transition flex items-start justify-between gap-3 ${
                      isSelected
                        ? "bg-sky-500/15 border-sky-500/60 shadow-md ring-1 ring-sky-400"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <MapPin className={`w-3.5 h-3.5 ${isSelected ? "text-sky-400" : "text-slate-400"}`} />
                        <span className="text-xs font-bold text-white">{addr.label}</span>
                        {addr.isDefault && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-medium">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 truncate">{addr.addressText}</p>
                      {addr.landmark && (
                        <p className="text-[11px] text-slate-400 truncate">Near: {addr.landmark}</p>
                      )}
                    </div>

                    {isSelected && <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <LocationPicker
              initialLocation={location}
              onLocationChange={(loc) => setLocation(loc)}
            />
          )}
        </GlassCard>

        {/* 4. VOUCHERS & DISCOUNTS */}
        <GlassCard className="p-6 bg-slate-900/70 border border-white/10 rounded-2xl space-y-4">
          <div className="pb-3 border-b border-white/10">
            <h2 className="text-base font-bold text-white">4. Rewards & Voucher</h2>
            <p className="text-xs text-slate-400">Apply a free wash voucher to this order</p>
          </div>

          {availableVouchers.length > 0 ? (
            <div className="space-y-3">
              <label className="text-xs text-slate-300 font-medium block">
                Select from your available vouchers:
              </label>
              <select
                value={selectedVoucherId}
                onChange={(e) => setSelectedVoucherId(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                <option value="">No voucher applied</option>
                {availableVouchers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} - Free Wash ({v.source.toUpperCase()}, capped at KES {v.discountCap})
                  </option>
                ))}
              </select>

              {activeVoucher && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-400" />
                    <span>
                      Voucher <strong>{activeVoucher.code}</strong> applied! You save KES {discountAmount}.
                    </span>
                  </div>
                  <span className="font-bold font-mono">- KES {discountAmount}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400 flex items-center gap-3">
              <Tag className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                No free wash vouchers currently available. Invite 5 friends or complete 7 washes to earn vouchers!
              </span>
            </div>
          )}
        </GlassCard>

        {/* 5. NOTES & INSTRUCTIONS */}
        <GlassCard className="p-6 bg-slate-900/70 border border-white/10 rounded-2xl space-y-3">
          <div className="pb-2 border-b border-white/10">
            <h2 className="text-base font-bold text-white">5. Instructions (Optional)</h2>
            <p className="text-xs text-slate-400">Gate codes, fabric care instructions, or pickup notes</p>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Leave with security guard at Gate B; Cold wash for delicate items..."
            className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </GlassCard>

        {/* 6. PAYMENT CHOICE & TOTAL */}
        <GlassCard className="p-6 bg-slate-900/70 border border-white/10 rounded-2xl space-y-6">
          <div className="pb-3 border-b border-white/10">
            <h2 className="text-base font-bold text-white">6. Payment & Confirmation</h2>
            <p className="text-xs text-slate-400">Choose how and when you prefer to pay</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentChoice("PAY_NOW")}
              className={`p-4 rounded-xl border text-left transition flex items-start gap-3 ${
                paymentChoice === "PAY_NOW"
                  ? "bg-sky-500/15 border-sky-500/60 shadow-md ring-1 ring-sky-400"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <CreditCard className={`w-5 h-5 shrink-0 ${paymentChoice === "PAY_NOW" ? "text-sky-400" : "text-slate-400"}`} />
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">M-Pesa STK Push Now</span>
                <p className="text-[11px] text-slate-400">
                  Instant prompt sent to your phone upon booking confirmation
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentChoice("PAY_ON_DELIVERY")}
              className={`p-4 rounded-xl border text-left transition flex items-start gap-3 ${
                paymentChoice === "PAY_ON_DELIVERY"
                  ? "bg-sky-500/15 border-sky-500/60 shadow-md ring-1 ring-sky-400"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <Banknote className={`w-5 h-5 shrink-0 ${paymentChoice === "PAY_ON_DELIVERY" ? "text-sky-400" : "text-slate-400"}`} />
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">Pay on Delivery</span>
                <p className="text-[11px] text-slate-400">
                  Inspect your clean, folded clothes first, then pay via M-Pesa
                </p>
              </div>
            </button>
          </div>

          {paymentChoice === "PAY_NOW" && (
            <div className="space-y-1.5 p-3.5 rounded-xl bg-white/5 border border-white/10">
              <label className="text-[11px] text-slate-300 font-semibold block">
                M-Pesa Phone Number for STK Prompt:
              </label>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-sky-400" />
                <input
                  type="text"
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="07XX XXX XXX or 2547XXXXXXXX"
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
            </div>
          )}

          {/* Pricing summary */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Catalog Subtotal</span>
              <span className="font-mono text-white">KES {cartTotal.toLocaleString()}</span>
            </div>

            {discountAmount > 0 && (
              <div className="flex justify-between text-xs text-emerald-400">
                <span>Voucher Discount</span>
                <span className="font-mono font-bold">- KES {discountAmount.toLocaleString()}</span>
              </div>
            )}

            <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-white/10">
              <span>Net Payable</span>
              <span className="font-mono text-base text-sky-400">KES {netTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || selectedItems.length === 0}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-xl shadow-sky-500/25 transition active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {submitting ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <>
                <span>Confirm & Schedule Wash</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </GlassCard>
      </form>
    </div>
  );
}

export default function ClientBookPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading booking form...</div>}>
      <BookContent />
    </Suspense>
  );
}
