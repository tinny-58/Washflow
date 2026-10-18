"use client";

import React, { useEffect, useState, use } from "react";
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
import { LocationPicker, SelectedLocation } from "@/components/customer/location-picker";
import { CatalogSelector } from "@/components/customer/catalog-selector";
import { StickyCtaBar } from "@/components/customer/sticky-cta-bar";
import { PriceCatalogItem } from "@/db/schema";

export default function BookPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const posterSrc = searchParams.get("src") || null;

  // Session state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);

  // OTP flow state
  const [phoneInput, setPhoneInput] = useState<string>("");
  const [nameInput, setNameInput] = useState<string>("");
  const [honeypot, setHoneypot] = useState<string>(""); // Bot protection
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState<string>("");
  const [otpLoading, setOtpLoading] = useState<boolean>(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  // Booking details state
  const [selectedItems, setSelectedItems] = useState<{ catalogId: string; qty: number; item: PriceCatalogItem }[]>([]);
  const [cartTotal, setCartTotal] = useState<number>(0);
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

  // Send OTP handler
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    setOtpError(null);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneInput,
          website: honeypot, // Honeypot check
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Failed to send code. Please try again.");
        return;
      }

      setOtpSent(true);
      if (data.devCode) {
        setDevCode(data.devCode);
        setOtpCode(data.devCode); // Auto-fill for ultra-smooth demo
      }
    } catch {
      setOtpError("Network error. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  // Verify OTP handler
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    setOtpError(null);

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneInput,
          code: otpCode,
          name: nameInput || "Valued Customer",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Verification failed.");
        return;
      }

      setIsAuthenticated(true);
      setCurrentUser(data.user);
    } catch {
      setOtpError("Verification failed. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  // Create Booking handler
  const handleCreateBooking = async () => {
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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setBookingError(data.error || "Failed to create booking.");
        return;
      }

      // Navigate to tracking or payment
      router.push(`/track/${data.bookingId}?new=true`);
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

      {/* Customer Quick Registration (If not authenticated) */}
      {!isAuthenticated ? (
        <GlassCard className="space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-extrabold text-white">Quick 30-Second Verification</h2>
            <p className="text-xs text-slate-300">
              Enter your mobile number to receive a one-time login code.
            </p>
          </div>

          {otpError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{otpError}</span>
            </div>
          )}

          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Full Name (Optional)
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="e.g. Jane Wanjiku"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Phone Number <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="0712 345 678"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Honeypot field (hidden from real users) */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                style={{ display: "none" }}
                tabIndex={-1}
                autoComplete="off"
              />

              <button
                type="submit"
                disabled={otpLoading || !phoneInput.trim()}
                className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20"
              >
                {otpLoading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <span>Send Verification Code</span>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              {devCode && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs text-center font-mono">
                  🔑 Demo Code: <strong>{devCode}</strong>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Enter 6-Digit Code sent to {phoneInput}
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full py-3 text-center tracking-widest text-xl font-bold rounded-xl glass-input text-white"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 transition"
                >
                  Change Number
                </button>
                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length !== 6}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {otpLoading ? (
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <span>Confirm & Continue</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </GlassCard>
      ) : (
        /* Authenticated Booking Form */
        <div className="space-y-5">
          {/* Welcome User Banner */}
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-lg font-bold text-white">Book Laundry Pickup</h2>
              <p className="text-xs text-slate-300">
                Logged in as <strong>{currentUser?.name}</strong> ({currentUser?.phone})
              </p>
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

          {/* 1. Location Picker Card */}
          <GlassCard>
            <LocationPicker onLocationChange={setLocation} />
          </GlassCard>

          {/* 2. Catalog Selector Card */}
          <GlassCard>
            <CatalogSelector
              onItemsChange={(items, total) => {
                setSelectedItems(items);
                setCartTotal(total);
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
