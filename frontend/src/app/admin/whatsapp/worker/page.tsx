"use client";

import React, { useEffect, useState } from "react";
import {
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  PowerOff,
  Send,
  Zap,
  RotateCcw,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Radio,
  Layers,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { ConnectionBadge } from "@/components/admin/whatsapp/connection-badge";
import { WhatsAppNav } from "@/components/admin/whatsapp/whatsapp-nav";

interface WorkerState {
  status: string;
  humanStatus?: string;
  nextStep?: string;
  qrCode: string | null;
  qrExpiresInSeconds?: number;
  user: {
    id: string;
    phone?: string;
    maskedPhone?: string;
    name?: string;
  } | null;
  connectedAt: string | null;
  lastError: string | null;
  circuitBreakerTripped?: boolean;
  pairingAttemptsRemaining?: number;
  reconnectAttempts?: number;
  deliveryRate24h: number | null;
  metrics: {
    sent24h: number;
    delivered24h: number;
    failed24h: number;
  };
  pacing: {
    minIntervalMs: number;
    maxPerMinute: number;
    active: boolean;
  };
  recentEvents: Array<{
    id: string;
    eventType: string;
    statusCode?: number;
    details?: string;
    createdAt: string;
  }>;
}

export default function AdminWhatsAppWorkerPage() {
  const [state, setState] = useState<WorkerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Live countdown for QR code
  const [countdown, setCountdown] = useState<number>(20);

  // Pairing code flow
  const [pairingModeTab, setPairingModeTab] = useState<"qr" | "code">("qr");
  const [pairingPhone, setPairingPhone] = useState("+254");
  const [generatedPairingCode, setGeneratedPairingCode] = useState<string | null>(null);
  const [requestingPairingCode, setRequestingPairingCode] = useState(false);

  // Disconnect Confirmation Modal
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // Connectivity check state
  const [checkingConnectivity, setCheckingConnectivity] = useState(false);
  const [checkResult, setCheckResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/worker/status");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.status) {
          setState(data.status);
          if (data.status.qrExpiresInSeconds !== undefined) {
            setCountdown(data.status.qrExpiresInSeconds);
          }
        }
      }
    } catch (err: any) {
      console.warn("Worker status check error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Poll status periodically (faster when pairing or connecting)
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  // 1-second interval for QR countdown animation
  useEffect(() => {
    if (state?.status !== "qr_ready") return;

    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [state?.status, state?.qrCode]);

  // Actions
  const handleConnect = async () => {
    setActionLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/whatsapp/worker/connect", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setState((prev) => prev ? { ...prev, ...data.status } : data.status);
        setNotice({ type: "success", text: "WhatsApp connection initiated." });
      } else {
        setNotice({ type: "error", text: data.error || "Failed to start connection." });
      }
    } catch {
      setNotice({ type: "error", text: "Network communication error." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async (clearAuth: boolean) => {
    setActionLoading(true);
    setShowDisconnectModal(false);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/whatsapp/worker/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearAuth }),
      });
      const data = await res.json();
      if (data.success) {
        fetchStatus();
        setNotice({ type: "success", text: data.message });
      } else {
        setNotice({ type: "error", text: data.error || "Failed to disconnect." });
      }
    } catch {
      setNotice({ type: "error", text: "Network error disconnecting WhatsApp." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestart = async () => {
    setActionLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/whatsapp/worker/restart", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        fetchStatus();
        setNotice({ type: "success", text: "Socket restarted." });
      } else {
        setNotice({ type: "error", text: data.error || "Failed to restart." });
      }
    } catch {
      setNotice({ type: "error", text: "Network error restarting worker." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetCircuitBreaker = async () => {
    setActionLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/whatsapp/worker/reset-circuit-breaker", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        fetchStatus();
        setNotice({ type: "success", text: "Anti-ban circuit breaker reset successfully." });
      } else {
        setNotice({ type: "error", text: data.error || "Failed to reset breaker." });
      }
    } catch {
      setNotice({ type: "error", text: "Network error." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestingPairingCode(true);
    setGeneratedPairingCode(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/whatsapp/worker/pairing-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: pairingPhone }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGeneratedPairingCode(data.code);
        fetchStatus();
      } else {
        setNotice({ type: "error", text: data.error || "Failed to generate pairing code." });
      }
    } catch {
      setNotice({ type: "error", text: "Network error requesting pairing code." });
    } finally {
      setRequestingPairingCode(false);
    }
  };

  const handleConnectivityCheck = async () => {
    setCheckingConnectivity(true);
    setCheckResult(null);

    try {
      const res = await fetch("/api/admin/whatsapp/worker/connectivity-check", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setCheckResult({ success: true, message: data.message });
      } else {
        setCheckResult({ success: false, message: data.error || "Connectivity check failed." });
      }
    } catch {
      setCheckResult({ success: false, message: "Network error sending connectivity check." });
    } finally {
      setCheckingConnectivity(false);
    }
  };

  if (loading && !state) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto p-4 animate-pulse">
        <div className="h-20 bg-slate-800/40 rounded-2xl border border-white/5" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-80 bg-slate-800/30 rounded-2xl" />
          <div className="lg:col-span-5 h-80 bg-slate-800/30 rounded-2xl" />
        </div>
      </div>
    );
  }

  const isConnected = state?.status === "connected";

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* WhatsApp Section Nav Tabs */}
      <WhatsAppNav />

      {/* Notice Banner */}
      {notice && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-lg ${
            notice.type === "success"
              ? "bg-emerald-500/20 border border-emerald-400/40 text-emerald-200"
              : "bg-rose-500/20 border border-rose-500/40 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{notice.text}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-[11px] underline opacity-80 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-white/10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/20 text-emerald-400 text-xs font-medium mb-2">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Dedicated Multi-Device WhatsApp Socket</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            WhatsApp Worker & Connection
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Live Baileys peer socket connection status, credential security, anti-ban protections, and sender health.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {state?.circuitBreakerTripped && (
            <button
              onClick={handleResetCircuitBreaker}
              disabled={actionLoading}
              className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-300 transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Breaker</span>
            </button>
          )}

          <button
            onClick={handleRestart}
            disabled={actionLoading}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5"
            title="Restart socket"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? "animate-spin text-sky-400" : ""}`} />
            <span>Restart</span>
          </button>

          {isConnected && (
            <button
              onClick={() => setShowDisconnectModal(true)}
              disabled={actionLoading}
              className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 transition flex items-center gap-1.5"
            >
              <PowerOff className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid: Worker Connection Card & Connectivity Check */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Worker Connection Card */}
        <GlassCard className="lg:col-span-7 p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                  isConnected
                    ? "bg-emerald-500/20 border border-emerald-400/40 text-emerald-400"
                    : state?.status === "qr_ready" || state?.status === "pairing"
                    ? "bg-amber-500/20 border border-amber-400/40 text-amber-400"
                    : "bg-slate-500/20 border border-slate-400/30 text-slate-400"
                }`}
              >
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2.5 flex-wrap">
                  <span>WhatsApp Sender Device</span>
                  <ConnectionBadge
                    status={state?.status || "disconnected"}
                    circuitBreakerTripped={state?.circuitBreakerTripped}
                  />
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {state?.humanStatus || "Direct Baileys peer socket for automated notifications"}
                </p>
              </div>
            </div>

            <button
              onClick={fetchStatus}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition border border-transparent hover:border-white/10"
              title="Refresh status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Connected View */}
          {isConnected && (
            <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-300 shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">
                    Authenticated Sender Online
                  </div>
                  <div className="text-lg font-black text-white font-mono">
                    {state?.user?.maskedPhone || (state?.user?.phone ? `+${state.user.phone}` : "Linked Phone")}
                  </div>
                  <div className="text-xs text-slate-400">
                    Device Name: {state?.user?.name || "WashFlow Operations"} • Ready for dispatches
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                  <span className="text-slate-400 block text-[10px]">Connected Since</span>
                  <span className="text-emerald-400 font-bold font-mono">
                    {state?.connectedAt
                      ? new Date(state.connectedAt).toLocaleDateString("en-KE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                  <span className="text-slate-400 block text-[10px]">Session Security</span>
                  <span className="text-slate-200 font-medium">PostgreSQL AES-256-GCM Encrypted</span>
                </div>
              </div>
            </div>
          )}

          {/* QR Code Scan View */}
          {state?.status === "qr_ready" && state.qrCode && (
            <div className="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <div className="p-3 bg-white rounded-2xl shadow-xl shrink-0 relative">
                <img
                  src={state.qrCode}
                  alt="WhatsApp Pairing QR Code"
                  className="w-48 h-48 rounded-lg"
                />
                <div className="absolute top-1 right-1 px-2 py-0.5 rounded-full bg-slate-900/90 text-amber-400 font-mono text-[10px] font-bold">
                  {countdown}s
                </div>
              </div>

              <div className="space-y-3 text-xs w-full">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold">
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Scan with WhatsApp</span>
                  </div>
                  <span className="text-[11px] text-amber-400 font-mono font-bold">
                    Refreshes in {countdown}s
                  </span>
                </div>

                <h4 className="text-white font-bold text-sm">How to link your WhatsApp:</h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                  <li>Open <strong>WhatsApp</strong> on your dedicated sender phone</li>
                  <li>Tap <strong>Settings / Linked Devices</strong></li>
                  <li>Tap <strong>Link a Device</strong> and scan this QR code</li>
                </ol>

                <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Pairing attempts remaining: {state.pairingAttemptsRemaining ?? 3}/3</span>
                  <button
                    onClick={handleConnect}
                    disabled={actionLoading}
                    className="text-sky-400 hover:text-sky-300 font-bold underline"
                  >
                    Refresh QR
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pairing Code Mode */}
          {state?.status === "pairing" && generatedPairingCode && (
            <div className="p-5 rounded-2xl bg-sky-500/10 border border-sky-500/20 space-y-4">
              <div className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                WhatsApp 8-Digit Pairing Code
              </div>
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-center">
                <span className="font-mono text-2xl font-black text-white tracking-widest">
                  {generatedPairingCode}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Open WhatsApp on your phone &gt; Linked Devices &gt; Link with phone number instead, and enter this code.
              </p>
            </div>
          )}

          {/* Circuit Breaker Tripped View */}
          {state?.circuitBreakerTripped && (
            <div className="p-5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-300">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span>Anti-Ban Circuit Breaker Tripped</span>
              </div>
              <p>
                Automatic reconnection was halted after repeated failures to protect your phone number against WhatsApp network blocks.
              </p>
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 font-mono text-[11px] text-rose-300/90">
                Reason: {state.lastError || "Connection timeout or rejection"}
              </div>
              <button
                onClick={handleResetCircuitBreaker}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition shadow-md"
              >
                Reset Circuit Breaker & Retry
              </button>
            </div>
          )}

          {/* Offline / Disconnected View */}
          {(!isConnected && state?.status !== "qr_ready" && state?.status !== "pairing") && (
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">
                  {state?.status === "needs_repairing" ? "Sender Needs Re-Pairing" : "WhatsApp Client Offline"}
                </div>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  {state?.status === "needs_repairing"
                    ? "The session was logged out. Scan a new QR code to re-link."
                    : "Start the connection process to link your dedicated WhatsApp phone number."}
                </p>
              </div>

              {/* Pairing Mode Tabs */}
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setPairingModeTab("qr")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    pairingModeTab === "qr"
                      ? "bg-white/10 text-white border border-white/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Scan QR Code
                </button>
                <button
                  onClick={() => setPairingModeTab("code")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    pairingModeTab === "code"
                      ? "bg-white/10 text-white border border-white/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Pairing Code (No Camera)
                </button>
              </div>

              {pairingModeTab === "qr" ? (
                <button
                  onClick={handleConnect}
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg transition inline-flex items-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  <span>{actionLoading ? "Starting Socket..." : "Start WhatsApp Connection"}</span>
                </button>
              ) : (
                <form onSubmit={handleRequestPairingCode} className="max-w-xs mx-auto space-y-2 pt-1">
                  <input
                    type="text"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    placeholder="+254712345678"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs text-center focus:outline-none focus:border-sky-400"
                    required
                  />
                  <button
                    type="submit"
                    disabled={requestingPairingCode}
                    className="w-full py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs transition"
                  >
                    {requestingPairingCode ? "Requesting..." : "Generate Pairing Code"}
                  </button>
                </form>
              )}
            </div>
          )}
        </GlassCard>

        {/* Connectivity Check Card */}
        <GlassCard className="lg:col-span-5 p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
              <Send className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-white">Send Connectivity Check</h2>
            </div>
            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              Verify that your connected WhatsApp phone is active and transmitting messages.
            </p>

            <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-slate-300 space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sky-300 font-bold text-[11px]">
                <ShieldCheck className="w-4 h-4" />
                <span>Audited System Check</span>
              </div>
              <p className="text-[11px] text-slate-300">
                For security, this check dispatches a fixed diagnostic message strictly to your own verified admin phone number.
              </p>
              <div className="text-[10px] text-slate-400">
                • Rate limited to 3 checks/hour<br />
                • Logged in audit trail with <code className="text-sky-300">purpose=system_check</code>
              </div>
            </div>

            {checkResult && (
              <div
                className={`p-3 rounded-xl text-xs font-medium mb-3 ${
                  checkResult.success
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                }`}
              >
                {checkResult.message}
              </div>
            )}

            <button
              onClick={handleConnectivityCheck}
              disabled={checkingConnectivity || !isConnected}
              className={`w-full py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 ${
                isConnected
                  ? "bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/25"
                  : "bg-white/10 text-slate-500 cursor-not-allowed"
              }`}
            >
              <Send className={`w-3.5 h-3.5 ${checkingConnectivity ? "animate-spin" : ""}`} />
              <span>
                {checkingConnectivity
                  ? "Transmitting check..."
                  : isConnected
                  ? "Send connectivity check"
                  : "Connect WhatsApp First"}
              </span>
            </button>
          </div>

          <div className="pt-3 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Pacing: Min 500ms / 15/min</span>
            <span className="text-emerald-400 font-medium">Anti-Ban Queue Active</span>
          </div>
        </GlassCard>
      </div>

      {/* Health Metrics & Recent Events */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard className="p-4 space-y-1">
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            24h Delivery Rate
          </span>
          <div className="text-xl font-black text-white font-mono">
            {state?.deliveryRate24h !== null && state?.deliveryRate24h !== undefined
              ? `${state.deliveryRate24h}%`
              : "—"}
          </div>
          <span className="text-[10px] text-slate-500">
            {state?.metrics?.delivered24h ?? 0} delivered of {((state?.metrics?.sent24h ?? 0) + (state?.metrics?.delivered24h ?? 0) + (state?.metrics?.failed24h ?? 0))}
          </span>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Reconnect Attempts
          </span>
          <div className="text-xl font-black text-white font-mono">
            {state?.reconnectAttempts ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">
            Consecutive reconnect tries
          </span>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Anti-Ban Pacing
          </span>
          <div className="text-xl font-black text-emerald-400 font-mono">
            15 / min max
          </div>
          <span className="text-[10px] text-slate-500">
            500ms sequential queue delay
          </span>
        </GlassCard>

        <GlassCard className="p-4 space-y-1">
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Pairing Quota
          </span>
          <div className="text-xl font-black text-white font-mono">
            {state?.pairingAttemptsRemaining ?? 3}/3 left
          </div>
          <span className="text-[10px] text-slate-500">
            Hourly QR rate limit window
          </span>
        </GlassCard>
      </div>

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-white/20 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <PowerOff className="w-5 h-5 text-rose-400" />
              <span>Disconnect WhatsApp Sender</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Choose how you want to disconnect WhatsApp:
            </p>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => handleDisconnect(false)}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-white">Pause Socket (Keep Saved Credentials)</div>
                  <div className="text-[11px] text-slate-400">Allows instant reconnection without scanning QR code again.</div>
                </div>
              </button>

              <button
                onClick={() => handleDisconnect(true)}
                className="w-full p-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-rose-300">Complete Logout & Wipe Credentials</div>
                  <div className="text-[11px] text-rose-400/80">Clears encrypted auth keys in PostgreSQL. You will need to scan QR code again.</div>
                </div>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowDisconnectModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
