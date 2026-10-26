"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  User,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Phone,
  Eye,
  EyeOff,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  validateUsername,
  validatePasswordNist,
  normalizePhoneNumber,
} from "@/lib/validation";

export type AuthView =
  | "login"
  | "admin-stepup"
  | "signup-select"
  | "google-link-phone"
  | "signup-otp"
  | "signup-credentials"
  | "signup-agreements"
  | "forgot"
  | "forgot-otp"
  | "reset"
  | "reset-success";

export interface AuthCardProps {
  initialView?: AuthView;
  defaultMode?: "login" | "signin" | "signup";
  redirectUrl?: string;
  className?: string;
  onSuccess?: () => void;
  // Static props for isolated test harness
  staticState?: {
    adminMaskedPhone?: string;
    maskedDestination?: string;
    resendCooldown?: number;
    error?: string | null;
    infoMessage?: string | null;
  };
}

export function AuthCard({
  initialView,
  defaultMode = "login",
  redirectUrl = "/book",
  className = "",
  onSuccess,
  staticState,
}: AuthCardProps) {
  const router = useRouter();

  // Read initial view from URL query param if available (for test harness & direct deep links)
  const [view, setView] = useState<AuthView>(() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("view") as AuthView;
      if (param) return param;
    }
    return initialView || (defaultMode === "signup" ? "signup-select" : "login");
  });

  // Common UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(staticState?.error || null);
  const [infoMessage, setInfoMessage] = useState<string | null>(staticState?.infoMessage || null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Login Form State
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Admin Step-Up State
  const [adminMaskedPhone, setAdminMaskedPhone] = useState<string>(() => {
    if (staticState?.adminMaskedPhone) return staticState.adminMaskedPhone;
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("phone") || "+254 7•• ••• 789";
    }
    return "+254 7•• ••• 789";
  });

  // Signup State
  const [signupPhone, setSignupPhone] = useState("");
  const [maskedDestination, setMaskedDestination] = useState(
    staticState?.maskedDestination || "+254 7•• ••• 789"
  );
  const [verificationToken, setVerificationToken] = useState("");

  // Google Link Phone State
  const [googlePhone, setGooglePhone] = useState("");

  // Signup Credentials State (Step 2A)
  const [chosenUsername, setChosenUsername] = useState("");
  const [chosenPassword, setChosenPassword] = useState("");
  const [showChosenPassword, setShowChosenPassword] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

  // Agreements State (Step 2B)
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  // Optional Referral Code on Signup (Step 2A)
  const [referralCodeInput, setReferralCodeInput] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const urlCode = new URLSearchParams(window.location.search).get("ref");
      return (urlCode || "").trim().toUpperCase();
    }
    return "";
  });
  const [referralCodeValidated, setReferralCodeValidated] = useState<boolean | null>(null);
  const [referralCodeChecking, setReferralCodeChecking] = useState<boolean>(false);
  const [referralCodeMessage, setReferralCodeMessage] = useState<string | null>(null);
  const [showReferralInput, setShowReferralInput] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return Boolean(new URLSearchParams(window.location.search).get("ref"));
    }
    return false;
  });

  const handleValidateReferralCode = async (codeToTest?: string) => {
    const code = (codeToTest ?? referralCodeInput).trim().toUpperCase();
    if (!code) {
      setReferralCodeValidated(null);
      setReferralCodeMessage(null);
      return;
    }
    setReferralCodeChecking(true);
    setReferralCodeMessage(null);
    try {
      const res = await fetch(`/api/auth/referral/check?code=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (res.ok && json.valid) {
        setReferralCodeValidated(true);
        setReferralCodeMessage("Referral code applied! You will be attributed on sign up.");
      } else {
        setReferralCodeValidated(false);
        setReferralCodeMessage(json.error || "Invalid or inactive referral code.");
      }
    } catch {
      setReferralCodeValidated(false);
      setReferralCodeMessage("Unable to verify referral code.");
    } finally {
      setReferralCodeChecking(false);
    }
  };

  // OTP Verification State (6 Boxes)
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState<number>(staticState?.resendCooldown || 0);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Forgot / Reset Password State
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Card & Heading Refs for Focus Management & Stability
  const cardRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // --------------------------------------------------------------------------
  // Timer Countdown for OTP Resend Cooldown
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // --------------------------------------------------------------------------
  // Focus Management on View Change
  // --------------------------------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!cardRef.current) return;
      const firstInput = cardRef.current.querySelector<HTMLInputElement>(
        "input:not([type=hidden]):not([disabled])"
      );
      if (firstInput) {
        firstInput.focus();
      } else if (headingRef.current) {
        headingRef.current.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [view]);

  // --------------------------------------------------------------------------
  // Mobile Visual Viewport Handling: Keep active field visible without resizing
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const handleViewport = () => {
      const activeEl = document.activeElement;
      if (activeEl && cardRef.current?.contains(activeEl)) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };
    window.visualViewport.addEventListener("resize", handleViewport);
    window.visualViewport.addEventListener("scroll", handleViewport);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewport);
      window.visualViewport?.removeEventListener("scroll", handleViewport);
    };
  }, []);

  // --------------------------------------------------------------------------
  // Debounced Username Availability Check
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (view !== "signup-credentials" || !chosenUsername.trim()) {
      setUsernameAvailable(null);
      setUsernameError(null);
      setUsernameSuggestions([]);
      return;
    }

    const check = validateUsername(chosenUsername);
    if (!check.valid) {
      setUsernameAvailable(false);
      setUsernameError(check.error || null);
      setUsernameSuggestions([]);
      return;
    }

    setUsernameChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/check-username?username=${encodeURIComponent(check.cleanUsername!)}`
        );
        const data = await res.json();
        if (data.available) {
          setUsernameAvailable(true);
          setUsernameError(null);
          setUsernameSuggestions([]);
        } else {
          setUsernameAvailable(false);
          setUsernameError(data.error || "Username is not available.");
          setUsernameSuggestions(data.suggestions || []);
        }
      } catch {
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [chosenUsername, view]);

  // --------------------------------------------------------------------------
  // Google Identity Services Setup
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (view !== "signup-select") return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const initGoogle = () => {
      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredentialResponse,
        });
        const container = document.getElementById("google-signup-btn");
        if (container) {
          container.innerHTML = "";
          (window as any).google.accounts.id.renderButton(container, {
            theme: "filled_blue",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            width: "100%",
          });
        }
      }
    };

    if ((window as any).google?.accounts?.id) {
      initGoogle();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.body.appendChild(script);
    }
  }, [view]);

  // View Switch Helper with short cross-fade (opacity only)
  const switchView = useCallback((nextView: AuthView) => {
    setError(null);
    setInfoMessage(null);
    setIsTransitioning(true);
    setTimeout(() => {
      setView(nextView);
      setIsTransitioning(false);
    }, 80);
  }, []);

  const handleBack = () => {
    setError(null);
    setInfoMessage(null);
    if (view === "signup-agreements") {
      switchView("signup-credentials");
    } else if (view === "signup-credentials") {
      switchView("signup-otp");
    } else if (view === "signup-otp" || view === "google-link-phone") {
      switchView("signup-select");
    } else if (view === "forgot-otp" || view === "reset") {
      switchView("forgot");
    } else {
      switchView("login");
    }
  };

  // --------------------------------------------------------------------------
  // Handlers: Login & Admin Step-Up
  // --------------------------------------------------------------------------
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Invalid username or password.");
        return;
      }

      if (data.stepUpRequired) {
        setAdminMaskedPhone(data.maskedDestination || "+254 7•• ••• 789");
        setOtpDigits(["", "", "", "", "", ""]);
        setResendCooldown(60);
        switchView("admin-stepup");
        return;
      }

      const isAdmin = data.user?.role === "admin";
      const destination = isAdmin
        ? (data.redirect || data.redirectTo || "/admin")
        : (data.redirect || data.redirectTo || redirectUrl);

      if (isAdmin) {
        window.location.href = destination;
        return;
      }

      router.push(destination);
      onSuccess?.();
    } catch {
      setError("An error occurred during sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminStepupSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = otpDigits.join("");
    if (code.length !== 6) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/admin/verify-stepup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Invalid step-up verification code.");
        return;
      }

      const destination = data.redirectTo || data.redirect || "/admin";
      window.location.href = destination;
    } catch {
      setError("Failed to verify step-up authentication.");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Handlers: Signup (WhatsApp path)
  // --------------------------------------------------------------------------
  const handleSignupPhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const norm = normalizePhoneNumber(signupPhone);
    if (!norm.valid || !norm.e164) {
      setError(norm.error || "Please enter a valid phone number (e.g., 0712 345 678).");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: norm.e164 }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send verification code.");
        return;
      }

      setMaskedDestination(data.maskedDestination || norm.e164);
      setResendCooldown(data.retryAfter || 60);
      setOtpDigits(["", "", "", "", "", ""]);
      switchView("signup-otp");
    } catch {
      setError("Failed to send verification code. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Handlers: Google Auth
  // --------------------------------------------------------------------------
  const handleGoogleCredentialResponse = async (response: any) => {
    if (!response?.credential) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Google authentication failed.");
        return;
      }

      if (!data.phoneRequired) {
        router.push(data.redirectTo || redirectUrl);
        onSuccess?.();
        return;
      }

      switchView("google-link-phone");
    } catch {
      setError("Failed to verify Google identity.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLinkPhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const norm = normalizePhoneNumber(googlePhone);
    if (!norm.valid || !norm.e164) {
      setError(norm.error || "Please enter a valid phone number.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/google/link-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: norm.e164 }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send verification code.");
        return;
      }

      setMaskedDestination(data.maskedDestination || norm.e164);
      setResendCooldown(data.retryAfter || 60);
      setOtpDigits(["", "", "", "", "", ""]);
      switchView("signup-otp");
    } catch {
      setError("Failed to link phone. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Handlers: 6-Box OTP Inputs
  // --------------------------------------------------------------------------
  const handleOtpDigitChange = (index: number, value: string) => {
    const char = value.slice(-1).replace(/\D/g, "");
    const next = [...otpDigits];
    next[index] = char;
    setOtpDigits(next);
    setError(null);

    if (char && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    if (char && index === 5 && next.every((d) => d !== "")) {
      if (view === "admin-stepup") {
        setTimeout(() => handleAdminStepupSubmit(), 50);
      } else {
        setTimeout(() => triggerOtpVerify(next.join("")), 50);
      }
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setOtpDigits(next);
    setError(null);

    const targetIdx = Math.min(pasted.length, 5);
    otpInputRefs.current[targetIdx]?.focus();

    if (pasted.length === 6) {
      if (view === "admin-stepup") {
        setTimeout(() => handleAdminStepupSubmit(), 50);
      } else {
        setTimeout(() => triggerOtpVerify(pasted), 50);
      }
    }
  };

  const triggerOtpVerify = async (code: string) => {
    setError(null);
    setLoading(true);

    const isReset = view === "forgot-otp";
    const endpoint = isReset ? "/api/auth/forgot-password/verify" : "/api/auth/signup/otp/verify";
    const identifier = isReset ? forgotIdentifier.trim() : signupPhone || googlePhone;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, code }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Incorrect verification code.");
        return;
      }

      if (isReset) {
        setResetToken(data.resetToken);
        switchView("reset");
      } else {
        setVerificationToken(data.verificationToken);
        switchView("signup-credentials");
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join("");
    if (code.length !== 6) return;

    if (view === "admin-stepup") {
      handleAdminStepupSubmit(e);
    } else {
      triggerOtpVerify(code);
    }
  };

  // --------------------------------------------------------------------------
  // Handlers: Step 2A (Credentials -> Agreements)
  // --------------------------------------------------------------------------
  const handleProceedToAgreements = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const userCheck = validateUsername(chosenUsername);
    if (!userCheck.valid) {
      setError(userCheck.error || "Invalid username format.");
      return;
    }

    const passCheck = await validatePasswordNist(chosenPassword);
    if (!passCheck.valid) {
      setError(passCheck.error || "Password must be at least 10 characters long.");
      return;
    }

    switchView("signup-agreements");
  };

  // --------------------------------------------------------------------------
  // Handlers: Step 2B (Agreements -> Complete Registration)
  // --------------------------------------------------------------------------
  const handleFinalizeSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!termsAccepted) {
      setError("Please accept the Terms & Conditions and Privacy Policy to continue.");
      return;
    }

    const userCheck = validateUsername(chosenUsername);
    if (!userCheck.valid) {
      setError(userCheck.error || "Invalid username format.");
      switchView("signup-credentials");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationToken,
          username: userCheck.cleanUsername,
          password: chosenPassword,
          marketingConsent,
          referralCode: referralCodeInput ? referralCodeInput.trim().toUpperCase() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.suggestions) {
          setUsernameSuggestions(data.suggestions);
          switchView("signup-credentials");
        }
        setError(data.error || "Failed to create account.");
        return;
      }

      router.push(redirectUrl);
      onSuccess?.();
    } catch {
      setError("An error occurred during account creation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Handlers: Forgot & Reset Password
  // --------------------------------------------------------------------------
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!forgotIdentifier.trim()) {
      setError("Please enter your username or WhatsApp number.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() }),
      });

      const data = await res.json();
      setInfoMessage(data.message || "If an account exists, a verification code has been sent.");
      setResendCooldown(data.retryAfter || 60);
      setOtpDigits(["", "", "", "", "", ""]);
      switchView("forgot-otp");
    } catch {
      setError("Failed to process request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const passCheck = await validatePasswordNist(newPassword);
    if (!passCheck.valid) {
      setError(passCheck.error || "Password must be at least 10 characters long.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resetToken,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to reset password.");
        return;
      }

      switchView("reset-success");
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // VIEW CONTENT DEFINITIONS
  // ==========================================================================

  // Titles & Subtitles per View
  const getHeaderInfo = () => {
    switch (view) {
      case "login":
        return {
          title: "Sign In to Your Account",
          subtitle: "Enter your credentials to manage orders and pickups.",
        };
      case "admin-stepup":
        return {
          title: "Admin Verification",
          subtitle: `Enter the 6-digit administrator code sent to WhatsApp on ${adminMaskedPhone || "your phone"}.`,
        };
      case "signup-select":
        return {
          title: "Create an Account",
          subtitle: "Choose your preferred way to register.",
        };
      case "google-link-phone":
        return {
          title: "Link WhatsApp Number",
          subtitle: "WashFlow requires an active WhatsApp number for order notifications.",
        };
      case "signup-otp":
        return {
          title: "Verify Your WhatsApp",
          subtitle: `Enter the 6-digit code sent to WhatsApp on ${maskedDestination || "your phone"}.`,
        };
      case "signup-credentials":
        return {
          title: "Choose Username & Password",
          subtitle: "Step 1 of 2: Create a unique handle and strong password.",
        };
      case "signup-agreements":
        return {
          title: "Terms & Agreements",
          subtitle: "Step 2 of 2: Review service terms before completing registration.",
        };
      case "forgot":
        return {
          title: "Reset Password",
          subtitle: "Enter your username or phone number to receive a reset code.",
        };
      case "forgot-otp":
        return {
          title: "Verify Reset Code",
          subtitle: "Enter the 6-digit code sent to your WhatsApp.",
        };
      case "reset":
        return {
          title: "Set New Password",
          subtitle: "Enter a strong password (minimum 10 characters).",
        };
      case "reset-success":
        return {
          title: "Password Reset Successful",
          subtitle: "Your password has been changed. You can now sign in.",
        };
    }
  };

  const headerInfo = getHeaderInfo();

  return (
    <div
      ref={cardRef}
      className={`auth-card-shell relative bg-slate-900/95 border border-slate-800 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between overflow-hidden select-none ${className}`}
      style={{
        boxSizing: "border-box",
        width: "min(var(--auth-card-w, 470px), calc(100vw - 32px))",
        height: "var(--auth-card-h, clamp(480px, 50dvh, 560px))",
        minHeight: "var(--auth-card-h, clamp(480px, 50dvh, 560px))",
        maxHeight: "var(--auth-card-h, clamp(480px, 50dvh, 560px))",
      }}
    >
      {/* ==================================================================== */}
      {/* ROW 1: HEADER ROW (Fixed Height: 32px, Never shifts coordinates)    */}
      {/* ==================================================================== */}
      <div className="h-8 mb-3 flex items-center justify-between shrink-0">
        {view !== "login" ? (
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition cursor-pointer min-h-[44px] -ml-1 px-1 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
            Authentication
          </span>
        )}

        {view === "admin-stepup" ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
            <ShieldAlert className="w-3 h-3" /> Step-Up Required
          </span>
        ) : (
          <span className="w-1 h-1 opacity-0 pointer-events-none" aria-hidden="true" />
        )}
      </div>

      {/* ==================================================================== */}
      {/* ROW 2: FLEXIBLE BODY ROW (Title + Reserved Message Slot + Forms)     */}
      {/* ==================================================================== */}
      <div
        className={`flex-1 flex flex-col justify-between min-h-0 transition-opacity duration-150 motion-reduce:transition-none ${
          isTransitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        <div>
          {/* Title & Subtitle Block (Stable height slot) */}
          <div className="min-h-[48px] max-h-[48px] mb-2 shrink-0 flex flex-col justify-center">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-lg sm:text-xl font-bold text-white tracking-tight focus:outline-none"
            >
              {headerInfo.title}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1 break-words">
              {headerInfo.subtitle}
            </p>
          </div>

          {/* Reserved Fixed-Height Message Slot (40px, never pushes layout, CLS = 0) */}
          <div
            className="h-10 min-h-[40px] max-h-[40px] mb-2.5 shrink-0 flex items-center"
            aria-live="polite"
          >
            {error ? (
              <div
                role="alert"
                aria-live="assertive"
                className="w-full px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 overflow-hidden"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span className="truncate">{error}</span>
              </div>
            ) : infoMessage ? (
              <div
                role="status"
                aria-live="polite"
                className="w-full px-2.5 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs flex items-center gap-2 overflow-hidden"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-sky-400" />
                <span className="truncate">{infoMessage}</span>
              </div>
            ) : (view === "signup-otp" || view === "forgot-otp" || view === "admin-stepup") &&
              resendCooldown > 0 ? (
              <div
                role="status"
                aria-live="polite"
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 text-xs flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                <span>Resend code in {resendCooldown}s</span>
              </div>
            ) : (
              <div aria-hidden="true" className="w-full h-full" />
            )}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* VIEW: LOGIN                                                      */}
          {/* ---------------------------------------------------------------- */}
          {view === "login" && (
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Username or Phone Number
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    required
                    placeholder="e.g. joshua or 0712345678"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full h-11 pl-9 pr-3 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => switchView("forgot")}
                    className="text-xs text-sky-400 hover:text-sky-300 transition"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                  <input
                    id="login-password"
                    name="password"
                    type={showLoginPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full h-11 pl-9 pr-10 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white"
                    aria-label={showLoginPassword ? "Hide password" : "Show password"}
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>



              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 px-4 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 cursor-pointer disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* VIEW: SIGNUP SELECT                                              */}
          {/* ---------------------------------------------------------------- */}
          {view === "signup-select" && (
            <div className="space-y-3">
              <form onSubmit={handleSignupPhoneSubmit} className="space-y-2.5">
                <div>
                  <label
                    htmlFor="signup-phone"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Continue with WhatsApp Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                    <input
                      id="signup-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="0712 345 678"
                      required
                      value={signupPhone}
                      onChange={(e) => setSignupPhone(e.target.value)}
                      className="w-full h-11 pl-9 pr-3 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Continue with WhatsApp</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink mx-3 text-xs text-slate-500 font-medium">OR</span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              <div>
                <div id="google-signup-btn" className="w-full min-h-[44px]"></div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* VIEW: GOOGLE LINK PHONE                                          */}
          {/* ---------------------------------------------------------------- */}
          {view === "google-link-phone" && (
            <form onSubmit={handleGoogleLinkPhoneSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="google-phone"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  WhatsApp Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                  <input
                    id="google-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="0712 345 678"
                    required
                    value={googlePhone}
                    onChange={(e) => setGooglePhone(e.target.value)}
                    className="w-full h-11 pl-9 pr-3 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                  />
                </div>
              </div>



              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Send WhatsApp Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* VIEW: OTP VERIFICATION (signup-otp, forgot-otp, admin-stepup)    */}
          {/* ---------------------------------------------------------------- */}
          {(view === "signup-otp" || view === "forgot-otp" || view === "admin-stepup") && (
            <form onSubmit={handleVerifyOtpSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2 text-center">
                  6-Digit Security Code
                </label>
                <div className="flex justify-between gap-1.5 sm:gap-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      autoComplete="one-time-code"
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      className="w-10 sm:w-11 h-11 sm:h-12 text-center text-lg font-bold bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                    />
                  ))}
                </div>
              </div>



              <button
                type="submit"
                disabled={loading || otpDigits.join("").length !== 6}
                className="w-full h-11 px-4 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Verify & Continue</span>
                )}
              </button>

              {view !== "admin-stepup" && resendCooldown <= 0 && (
                <div className="text-center pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (view === "signup-otp") {
                        if (googlePhone) {
                          handleGoogleLinkPhoneSubmit({ preventDefault: () => {} } as any);
                        } else {
                          handleSignupPhoneSubmit({ preventDefault: () => {} } as any);
                        }
                      } else {
                        handleForgotSubmit({ preventDefault: () => {} } as any);
                      }
                    }}
                    className="text-xs font-medium text-sky-400 hover:text-sky-300 transition cursor-pointer"
                  >
                    Resend verification code
                  </button>
                </div>
              )}
            </form>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* VIEW: SIGNUP CREDENTIALS (Step 2A: Username & Password)          */}
          {/* ---------------------------------------------------------------- */}
          {view === "signup-credentials" && (
            <form onSubmit={handleProceedToAgreements} className="space-y-3">
              <div>
                <label
                  htmlFor="chosen-username"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Choose a Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                  <input
                    id="chosen-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    required
                    placeholder="e.g. joshua_k"
                    value={chosenUsername}
                    onChange={(e) => setChosenUsername(e.target.value)}
                    className="w-full h-11 pl-9 pr-9 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                  />
                  <div className="absolute right-3 top-3.5">
                    {usernameChecking && (
                      <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
                    )}
                    {!usernameChecking && usernameAvailable === true && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    {!usernameChecking && usernameAvailable === false && (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                  </div>
                </div>

                {usernameError && (
                  <p className="text-[11px] text-rose-400 mt-0.5 truncate">{usernameError}</p>
                )}

                {usernameSuggestions.length > 0 && (
                  <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
                    <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-0.5">
                      <Sparkles className="w-3 h-3 text-sky-400" /> Try:
                    </span>
                    <div className="flex gap-1 overflow-hidden">
                      {usernameSuggestions.slice(0, 3).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setChosenUsername(suggestion)}
                          className="text-[11px] px-2 py-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 transition truncate"
                        >
                          @{suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="chosen-password"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Create a Password (min. 10 characters)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                  <input
                    id="chosen-password"
                    name="password"
                    type={showChosenPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    placeholder="••••••••••••"
                    value={chosenPassword}
                    onChange={(e) => setChosenPassword(e.target.value)}
                    className="w-full h-11 pl-9 pr-10 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowChosenPassword(!showChosenPassword)}
                    className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white"
                    aria-label={showChosenPassword ? "Hide password" : "Show password"}
                  >
                    {showChosenPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Optional Referral Code (collapsible, validated server-side) */}
              <div className="pt-0.5">
                {!showReferralInput ? (
                  <button
                    type="button"
                    onClick={() => setShowReferralInput(true)}
                    className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 transition"
                  >
                    <span>Have a referral code?</span>
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="referral-code-input"
                        className="block text-xs font-medium text-slate-300"
                      >
                        Referral Code
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowReferralInput(false);
                          setReferralCodeInput("");
                          setReferralCodeValidated(null);
                          setReferralCodeMessage(null);
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-200"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        id="referral-code-input"
                        type="text"
                        placeholder="e.g. WF-7A9B2C"
                        value={referralCodeInput}
                        onChange={(e) => {
                          setReferralCodeInput(e.target.value.toUpperCase());
                          setReferralCodeValidated(null);
                          setReferralCodeMessage(null);
                        }}
                        className="w-full h-9 px-3 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white placeholder-slate-500 uppercase focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                      />
                      <button
                        type="button"
                        onClick={() => handleValidateReferralCode()}
                        disabled={referralCodeChecking || !referralCodeInput.trim()}
                        className="px-3 h-9 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition shrink-0"
                      >
                        {referralCodeChecking ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Apply"
                        )}
                      </button>
                    </div>

                    {referralCodeMessage && (
                      <p
                        className={`text-[11px] flex items-center gap-1 ${
                          referralCodeValidated
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {referralCodeValidated ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{referralCodeMessage}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || usernameAvailable === false}
                className="w-full h-11 px-4 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 cursor-pointer disabled:cursor-not-allowed mt-2"
              >
                <span>Continue to Agreements</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* VIEW: SIGNUP AGREEMENTS (Step 2B: Terms & Marketing Consent)      */}
          {/* ---------------------------------------------------------------- */}
          {view === "signup-agreements" && (
            <form onSubmit={handleFinalizeSignup} className="space-y-3.5">
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/60 space-y-3">
                {/* Required Terms Checkbox */}
                <div className="flex items-start gap-2.5">
                  <input
                    id="signup-terms"
                    name="termsConsent"
                    type="checkbox"
                    required
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-400 focus:ring-offset-slate-900 cursor-pointer shrink-0"
                  />
                  <label
                    htmlFor="signup-terms"
                    className="text-xs text-slate-300 leading-relaxed cursor-pointer select-none"
                  >
                    I agree to the{" "}
                    <Link
                      href="/prices#terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
                    >
                      Privacy Policy
                    </Link>
                    . (Required)
                  </label>
                </div>

                {/* Optional Marketing Checkbox (unticked by default) */}
                <div className="flex items-start gap-2.5">
                  <input
                    id="signup-marketing"
                    name="marketingConsent"
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-400 focus:ring-offset-slate-900 cursor-pointer shrink-0"
                  />
                  <label
                    htmlFor="signup-marketing"
                    className="text-xs text-slate-400 leading-relaxed cursor-pointer select-none"
                  >
                    Receive occasional laundry offers, discounts, and schedule updates via WhatsApp.
                    (Optional)
                  </label>
                </div>
              </div>



              <button
                type="submit"
                disabled={loading || !termsAccepted}
                className="w-full h-11 px-4 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 cursor-pointer disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Complete Registration</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* VIEW: FORGOT PASSWORD REQUEST                                    */}
          {/* ---------------------------------------------------------------- */}
          {view === "forgot" && (
            <form onSubmit={handleForgotSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="forgot-identifier"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Username or WhatsApp Number
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                  <input
                    id="forgot-identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    required
                    placeholder="e.g. joshua or 0712345678"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    className="w-full h-11 pl-9 pr-3 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                  />
                </div>
              </div>



              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 px-4 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Send Reset Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* VIEW: RESET PASSWORD                                             */}
          {/* ---------------------------------------------------------------- */}
          {view === "reset" && (
            <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="reset-new-password"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  New Password (min. 10 characters)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                  <input
                    id="reset-new-password"
                    name="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    placeholder="••••••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full h-11 pl-9 pr-10 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>



              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 px-4 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Update Password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* VIEW: RESET SUCCESS                                              */}
          {/* ---------------------------------------------------------------- */}
          {view === "reset-success" && (
            <div className="space-y-4 pt-2">
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-xs text-slate-300">
                  Your credentials have been securely updated.
                </p>
              </div>

              <button
                type="button"
                onClick={() => switchView("login")}
                className="w-full h-11 px-4 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 cursor-pointer"
              >
                <span>Proceed to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* ROW 3: FOOTER ROW (Fixed Height: 32px, Only View-Switch Link)        */}
      {/* ==================================================================== */}
      <div className="h-8 pt-2.5 border-t border-slate-800/80 shrink-0 flex items-center justify-center text-center mt-auto">
        {view === "login" ? (
          <span className="text-xs text-slate-400">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => switchView("signup-select")}
              className="font-semibold text-sky-400 hover:text-sky-300 transition cursor-pointer focus:outline-none focus:underline"
            >
              Sign Up
            </button>
          </span>
        ) : view === "signup-select" ? (
          <span className="text-xs text-slate-400">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => switchView("login")}
              className="font-semibold text-sky-400 hover:text-sky-300 transition cursor-pointer focus:outline-none focus:underline"
            >
              Sign In
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => switchView("login")}
            className="text-xs font-medium text-slate-400 hover:text-white transition cursor-pointer focus:outline-none focus:underline"
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
