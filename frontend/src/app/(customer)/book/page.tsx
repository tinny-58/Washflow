"use client";

import React, { useEffect, useState, use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  Phone,
  User,
  ShieldCheck,
  Clock,
  CreditCard,
  Banknote,
  CheckCircle2,
  AlertCircle,
  QrCode,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { AuthCard } from "@/components/shared/auth-card";
import { LocationPicker, SelectedLocation } from "@/components/customer/location-picker";
import { CatalogSelector } from "@/components/customer/catalog-selector";
import { StickyCtaBar } from "@/components/customer/sticky-cta-bar";
import { PriceCatalogItem } from "@/lib/types";

function BookContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const posterSrc = searchParams.get("src") || null;
  const preselectedItemId = searchParams.get("item") || null;

  // Session state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name?: string;
    username?: string;
    phone?: string;
    email?: string;
  } | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);

  // Booking details state
  const [selectedItems, setSelectedItems] = useState<{ catalogId: string; qty: number; item: PriceCatalogItem }[]>([]);
  const [cartTotal, setCartTotal] = useState<number>(0);
  const [catalogVersion, setCatalogVersion] = useState<number>(1);
  const [priceChangeNotice, setPriceChangeNotice] = useState<{ oldTotal: number; newTotal: number } | null>(null);
  const [pickupWindow, setPickupWindow] = useState<string>("Morning (8:00 AM - 11:00 AM)");
  const [notes, setNotes] = useState<string>("");
  const [paymentChoice, setPaymentChoice] = useState<"PAY_NOW" | "PAY_ON_DELIVERY">("PAY_NOW");
  const [location, setLocation] = useState<SelectedLocation>({
    lat: -1.286389,
    lng: 36.817223,
    addressText: "",
    landmark: "",
    label: "Home",
  });

  const [bookingLoading, setBookingLoading] = useState<boolean>(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Check existing session
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setIsAuthenticated(true);
          setCurrentUser(data.user);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAuth(false));
  }, []);

  // Create Booking handler
  const handleCreateBooking = async (forceConfirmPrice = false) => {
    if (selectedItems.length === 0) {
      setBookingError("Please select at least one item from the catalog.");
      return;
    }

    if (!location.addressText.trim()) {
      setBookingError("Please enter your Apartment or Street address.");
      return;
    }

    setBookingLoading(true);
    setBookingError(null);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newAddress: {
            label: location.label,
            lat: location.lat,
            lng: location.lng,
            addressText: location.addressText,
            landmark: location.landmark,
          },
          items: selectedItems.map((i) => ({
            catalogId: i.catalogId,
            qty: i.qty,
          })),
          pickupWindow,
          notes,
          paymentChoice,
          posterSrc,
          catalogVersion,
          expectedSubtotal: cartTotal,
          confirmPriceChange: forceConfirmPrice,
        }),
      });

      const data = await res.json();

      // Catch price changes (409 Conflict)
      if (res.status === 409 && data.error === "PRICE_CHANGED") {
        setPriceChangeNotice({
          oldTotal: data.oldSubtotal,
          newTotal: data.newSubtotal,
        });
        setCartTotal(data.newSubtotal);
        if (data.catalogVersion) {
          setCatalogVersion(data.catalogVersion);
        }
        setBookingLoading(false);
        return;
      }

      if (!res.ok) {
        setBookingError(data.error || "Failed to create booking.");
        return;
      }

      const finalBookingId = data.booking?.id || data.bookingId;
      router.push(`/track/${finalBookingId}?new=true`);
    } catch {
      setBookingError("Failed to submit booking. Please check your network connection.");
    } finally {
      setBookingLoading(false);
    }
  };

  const pickupWindows = [
    "Morning (8:00 AM - 11:00 AM)",
    "Midday (11:00 AM - 2:00 PM)",
    "Afternoon (2:00 PM - 5:00 PM)",
    "Evening (5:00 PM - 8:00 PM)",
  ];

  if (loadingAuth) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 pb-28 max-w-xl mx-auto px-4 py-6 w-full space-y-5">
      {/* Poster Tracking Banner */}
      {posterSrc && (
        <div className="p-3 rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center gap-2.5 text-xs text-sky-200">
          <QrCode className="w-4 h-4 text-sky-400 shrink-0" />
          <span>
            Scanned from <strong>{posterSrc}</strong> poster. Welcome to WashFlow!
          </span>
        </div>
      )}

      {/* Customer Authentication (If not authenticated) */}
      {!isAuthenticated ? (
        <div className="space-y-4">
          <AuthCard
            redirectUrl="/book"
            defaultMode={posterSrc ? "signup" : "login"}
            onSuccess={async () => {
              try {
                const res = await fetch("/api/auth/me");
                const data = await res.json();
                if (data.authenticated && data.user) {
                  if (data.user.role === "admin") {
                    router.push("/admin");
                    return;
                  }
                  if (data.user.role === "client") {
                    router.push("/client");
                    return;
                  }
                  setIsAuthenticated(true);
                  setCurrentUser(data.user);
                }
              } catch (e) {
                console.error("Failed to refresh user:", e);
              }
            }}
          />
        </div>
      ) : (
        /* Authenticated Booking Form */
        <div className="space-y-5">
          {/* Welcome User Banner */}
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-lg font-bold text-white">Book Laundry Pickup</h2>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span>
                  Logged in as <strong>{currentUser?.name || currentUser?.username}</strong>{" "}
                  {currentUser?.phone ? `(${currentUser.phone})` : ""}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    setIsAuthenticated(false);
                    setCurrentUser(null);
                  }}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Verified
            </div>
          </div>

          {bookingError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{bookingError}</span>
            </div>
          )}

          {/* Stale Price Change Notice Modal / Box */}
          {priceChangeNotice && (
            <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white text-sm">Catalog Price Updated</h4>
                  <p className="mt-0.5 text-slate-200">
                    The price for your selected laundry items changed from{" "}
                    <span className="line-through font-mono">KES {priceChangeNotice.oldTotal.toLocaleString()}</span> to{" "}
                    <strong className="text-white font-mono">KES {priceChangeNotice.newTotal.toLocaleString()}</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPriceChangeNotice(null);
                  handleCreateBooking(true);
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition"
              >
                Confirm Updated Price & Place Booking
              </button>
            </div>
          )}

          {/* 1. Location Picker Card */}
          <GlassCard>
            <LocationPicker onLocationChange={setLocation} />
          </GlassCard>

          {/* 2. Catalog Selector Card */}
          <GlassCard>
            <CatalogSelector
              preselectedItemId={preselectedItemId}
              onItemsChange={(items, total, ver) => {
                setSelectedItems(items);
                setCartTotal(total);
                if (ver) setCatalogVersion(ver);
              }}
            />
          </GlassCard>

          {/* 3. Pickup Window & Preferences Card */}
          <GlassCard className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mb-2">
                <Clock className="w-4 h-4 text-sky-400" />
                Select Preferred Pickup Window
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {pickupWindows.map((win) => (
                  <button
                    key={win}
                    type="button"
                    onClick={() => setPickupWindow(win)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-medium text-left transition ${
                      pickupWindow === win
                        ? "bg-sky-500/25 border-sky-400 text-white font-semibold shadow-sm"
                        : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {win}
                  </button>
                ))}
              </div>
            </div>

            {/* Special Instructions Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Special Care Notes / Gate Access
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Ring bell 4B; please separate white shirts"
                className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-400"
              />
            </div>

            {/* Payment Choice */}
            <div>
              <label className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mb-2">
                <CreditCard className="w-4 h-4 text-sky-400" />
                Payment Option
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentChoice("PAY_NOW")}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                    paymentChoice === "PAY_NOW"
                      ? "bg-emerald-500/20 border-emerald-400 text-white shadow-sm"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">M-Pesa STK Push</div>
                    <div className="text-[10px] text-slate-400">Instant on phone</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentChoice("PAY_ON_DELIVERY")}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                    paymentChoice === "PAY_ON_DELIVERY"
                      ? "bg-sky-500/20 border-sky-400 text-white shadow-sm"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <Banknote className="w-5 h-5 text-sky-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">Pay on Delivery</div>
                    <div className="text-[10px] text-slate-400">Cash or M-Pesa</div>
                  </div>
                </button>
              </div>
            </div>
          </GlassCard>

          {/* Sticky Total & Action Bar */}
          <StickyCtaBar
            total={cartTotal}
            itemCount={selectedItems.reduce((sum, i) => sum + i.qty, 0)}
            buttonText={paymentChoice === "PAY_NOW" ? "Pay & Book" : "Confirm Booking"}
            disabled={selectedItems.length === 0 || !location.addressText.trim()}
            loading={bookingLoading}
            onAction={handleCreateBooking}
          />
        </div>
      )}
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
        </div>
      }
    >
      <BookContent />
    </Suspense>
  );
}
