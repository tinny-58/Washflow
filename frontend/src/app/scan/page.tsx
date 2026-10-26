"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  QrCode,
  ShieldCheck,
  Phone,
  User,
  Lock,
  ArrowRight,
  MessageSquare,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  MapPin,
  ExternalLink,
  ChevronRight,
  AtSign,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

// Human-readable poster location names
const posterLocations: Record<string, { name: string; area: string; landmark: string }> = {
  "poster-nairobi-cbd": {
    name: "Nairobi CBD Hub",
    area: "Central Business District",
    landmark: "Moi Avenue / Kencom Vicinity",
  },
  "poster-westlands": {
    name: "Westlands Premier Hub",
    area: "Westlands",
    landmark: "Sarit Centre & Apartment Towers",
  },
  "poster-kilimani": {
    name: "Kilimani Residential Gate",
    area: "Kilimani",
    landmark: "Yaya Centre & Chania Avenue",
  },
  "poster-kileleshwa": {
    name: "Kileleshwa Estate Station",
    area: "Kileleshwa",
    landmark: "Kasuku Centre Vicinity",
  },
  "poster-ngong-rd": {
    name: "Ngong Road Urban Station",
    area: "Ngong Road",
    landmark: "Junction Mall & Adams Arcade",
  },
  "poster-thika-rd": {
    name: "Thika Road Express Station",
    area: "Thika Road",
    landmark: "Garden City Mall & Roysambu",
  },
};

function ScanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const posterSrc = searchParams.get("src") || "poster-kilimani";

  const posterInfo = posterLocations[posterSrc] || {
    name: "Nairobi Poster Location",
    area: "Nairobi Residential Gate",
    landmark: "Poster QR Hub #01",
  };

  // Flow steps:
  // 1. "permission" -> Asks permission to open website
  // 2. "phone" -> Enters phone number, sends WhatsApp OTP
  // 3. "otp" -> Enters 6-digit WhatsApp OTP
  // 4. "credentials" -> Sets up username and password for future login
  // 5. "login" -> Alternative for returning customers with username & password
  const [step, setStep] = useState<"permission" | "phone" | "otp" | "credentials" | "login">("permission");

  // Form states
  const [phone, setPhone] = useState<string>("");
  const [otpCode, setOtpCode] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [referralCode, setReferralCode] = useState<string>(searchParams.get("ref") || "");

  // Returning customer login states
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");

  // UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState<number>(0);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);

  // Countdown timer for OTP
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  // 1. Handle Permission Grant
  const handleGrantPermission = () => {
    setPermissionGranted(true);
    setStep("phone");
    setError(null);
  };

  // 2. Handle Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.trim().length < 9) {
      setError("Please enter a valid mobile number (e.g., 0712 345 678).");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), name: name.trim() || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send WhatsApp verification code.");
        setLoading(false);
        return;
      }

      setStep("otp");
      setSuccessMsg(`WhatsApp code sent to ${data.phone || phone}`);
      setResendTimer(60);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Verify OTP and advance to Username & Password setup
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setError("Please enter the 6-digit code received on WhatsApp.");
      return;
    }
    setError(null);
    setStep("credentials");
  };

  // 4. Handle Complete Registration (Saves Username, Password, Name with verified OTP)
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (!username || username.trim().length < 3) {
      setError("Username must be at least 3 characters long.");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setError("Username can only contain letters, numbers, and underscores.");
      return;
    }

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/customer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          code: otpCode.trim(),
          name: name.trim(),
          username: username.trim(),
          password,
          referralCode: referralCode.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to complete registration.");
        setLoading(false);
        return;
      }

      setSuccessMsg("Registration successful! Welcome to WashFlow.");
      setTimeout(() => {
        router.push(`/book?src=${encodeURIComponent(posterSrc)}`);
      }, 800);
    } catch {
      setError("Network error during registration.");
      setLoading(false);
    }
  };

  // 5. Handle Returning Customer Login
  const handleCustomerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier || !loginPassword) {
      setError("Please enter your username/phone and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: loginIdentifier.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid username/phone or password.");
        setLoading(false);
        return;
      }

      setSuccessMsg("Welcome back!");
      setTimeout(() => {
        router.push(`/book?src=${encodeURIComponent(posterSrc)}`);
      }, 600);
    } catch {
      setError("Login network error.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[85vh] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-lg space-y-6">
        {/* Poster Location Banner */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Poster Scan Detected
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-sky-400" />
                <span>{posterInfo.name}</span>
              </h3>
              <p className="text-[11px] text-slate-300">{posterInfo.landmark}</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20 text-xs font-mono">
            {posterSrc}
          </span>
        </div>

        {/* STEP 1: PERMISSION SCREEN */}
        {step === "permission" && (
          <GlassCard className="p-6 sm:p-8 border-white/20 shadow-2xl relative overflow-hidden space-y-6 text-center">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-400 via-sky-500 to-indigo-600" />

            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-sky-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Sparkles className="w-8 h-8 text-white" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white tracking-tight">
                Open WashFlow Portal?
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
                You scanned the physical poster at <span className="text-white font-semibold">{posterInfo.name}</span>.
                WashFlow requires your permission to open the laundry portal on your device and connect with WhatsApp.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-left space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2 text-white font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>What happens next:</span>
              </div>
              <ul className="space-y-1.5 pl-6 list-disc text-slate-300 text-[11px]">
                <li>We verify your mobile number with a quick WhatsApp code.</li>
                <li>You choose a username and password for future logins.</li>
                <li>Your laundry is picked up from your doorstep in 24h.</li>
              </ul>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleGrantPermission}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-600 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white font-black text-sm tracking-wide shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transition active:scale-[0.99]"
              >
                <span>Allow & Open Website</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <Link
                href="/"
                className="block text-xs text-slate-400 hover:text-slate-200 transition py-1"
              >
                Cancel and return to home
              </Link>
            </div>
          </GlassCard>
        )}

        {/* STEP 2: PHONE INPUT */}
        {step === "phone" && (
          <GlassCard className="p-6 sm:p-8 border-white/20 shadow-2xl relative overflow-hidden space-y-6">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-sky-500" />

            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px] font-black">
                    1
                  </span>
                  Step 1 of 2: WhatsApp Phone Verification
                </span>
                <span className="text-xs text-slate-400">Poster Customer</span>
              </div>
              <h2 className="text-xl font-black text-white">Enter Your Phone Number</h2>
              <p className="text-xs text-slate-300 mt-1">
                We will send a 6-digit confirmation code directly to your WhatsApp.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Full Name (Optional for now)
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Brian Otieno"
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl glass-input text-sm text-white placeholder-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  WhatsApp Mobile Number <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-emerald-400" />
                  <input
                    type="tel"
                    required
                    autoFocus
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0712 345 678 or +254..."
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl glass-input text-sm text-white placeholder-slate-400 font-medium"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Kenyan format: e.g. 0712345678, 0110123456, or +254...
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    <span>Send WhatsApp Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-4 border-t border-white/10 text-center">
              <button
                type="button"
                onClick={() => {
                  setStep("login");
                  setError(null);
                }}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold"
              >
                Already have a WashFlow username & password? Sign in here →
              </button>
            </div>
          </GlassCard>
        )}

        {/* STEP 3: OTP VERIFICATION */}
        {step === "otp" && (
          <GlassCard className="p-6 sm:p-8 border-white/20 shadow-2xl relative overflow-hidden space-y-6">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-sky-500" />

            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px] font-black">
                    1b
                  </span>
                  Verify WhatsApp Code
                </span>
                <button
                  type="button"
                  onClick={() => setStep("phone")}
                  className="text-xs text-sky-400 hover:underline"
                >
                  Edit Phone ({phone})
                </button>
              </div>
              <h2 className="text-xl font-black text-white">Enter Verification Code</h2>
              <p className="text-xs text-slate-300 mt-1">
                We sent a 6-digit OTP code to WhatsApp on <span className="text-emerald-400 font-semibold">{phone}</span>.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  6-Digit OTP Code
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3.5 w-4 h-4 text-sky-400" />
                  <input
                    type="text"
                    maxLength={6}
                    required
                    autoFocus
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl glass-input text-base text-white tracking-widest font-mono text-center placeholder-slate-500 font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={otpCode.length !== 6}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                <span>Confirm Code & Set Up Profile</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="text-center pt-2">
                {resendTimer > 0 ? (
                  <p className="text-xs text-slate-400">
                    Resend WhatsApp code in{" "}
                    <span className="font-semibold text-slate-200">{resendTimer}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="text-xs text-emerald-400 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Didn&apos;t receive code? Resend via WhatsApp</span>
                  </button>
                )}
              </div>
            </form>
          </GlassCard>
        )}

        {/* STEP 4: SETUP USERNAME AND PASSWORD FOR FUTURE LOGIN */}
        {step === "credentials" && (
          <GlassCard className="p-6 sm:p-8 border-white/20 shadow-2xl relative overflow-hidden space-y-6">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-400" />

            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-[11px] font-black">
                    2
                  </span>
                  Step 2 of 2: Set Username & Password
                </span>
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Phone Verified
                </span>
              </div>
              <h2 className="text-xl font-black text-white">Create Your Future Login</h2>
              <p className="text-xs text-slate-300 mt-1">
                Choose a unique username and password so you can sign in anytime from your phone, laptop, or any poster QR.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleCompleteRegistration} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Your Full Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Brian Otieno"
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl glass-input text-sm text-white placeholder-slate-400 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Choose Username <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <AtSign className="absolute left-3.5 top-3.5 w-4 h-4 text-sky-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="e.g. brian_o"
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl glass-input text-sm text-white placeholder-slate-400 font-mono font-medium"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Letters, numbers, and underscores only. Min 3 characters.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Create Password <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl glass-input text-sm text-white placeholder-slate-400 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Confirm Password <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl glass-input text-sm text-white placeholder-slate-400 font-medium"
                  />
                </div>
              </div>

              {/* Referral Code */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Referral Code (Optional)
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold">+50 Welcome Points</span>
                </div>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="e.g. WF-JOHN482"
                  className="w-full px-3 py-2 rounded-lg glass-input text-xs text-white placeholder-slate-500 font-mono uppercase tracking-wider"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-600 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white font-black text-sm tracking-wide shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Complete Registration & Book Laundry</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </GlassCard>
        )}

        {/* RETURNING CUSTOMER LOGIN FORM */}
        {step === "login" && (
          <GlassCard className="p-6 sm:p-8 border-white/20 shadow-2xl relative overflow-hidden space-y-6">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-400 to-indigo-600" />

            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <span className="text-xs font-bold text-sky-400">Returning Customer</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setError(null);
                  }}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  New customer? Register via WhatsApp →
                </button>
              </div>
              <h2 className="text-xl font-black text-white">Sign In to WashFlow</h2>
              <p className="text-xs text-slate-300 mt-1">
                Enter your username or phone number and password to continue.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleCustomerLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Username or Mobile Phone
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="e.g. brian_o or 0712 345 678"
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl glass-input text-sm text-white placeholder-slate-400 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl glass-input text-sm text-white placeholder-slate-400 font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign In & Continue Booking</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setError(null);
                  }}
                  className="text-xs text-slate-400 hover:text-emerald-400 transition"
                >
                  Forgot password? Sign in with WhatsApp OTP instead →
                </button>
              </div>
            </form>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center text-slate-300">
          <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
        </div>
      }
    >
      <ScanContent />
    </Suspense>
  );
}
