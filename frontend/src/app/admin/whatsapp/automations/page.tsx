"use client";

import React, { useEffect, useState } from "react";
import {
  Zap,
  Check,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Lock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Send,
  Eye,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { WhatsAppNav } from "@/components/admin/whatsapp/whatsapp-nav";

interface TemplateRecord {
  id: string;
  name: string;
  description: string;
  recipientType: "customer" | "admin";
  priorityClass: "otp" | "transactional";
  enabled: boolean;
  template: string;
  version: number;
  charCount: number;
  lastSentAt: string | null;
  successRate: number | null;
  totalSent30d: number;
  isProtected: boolean;
  allowedVariables: Array<{
    tag: string;
    label: string;
    sensitive: boolean;
  }>;
}

export default function AdminWhatsAppAutomationsPage() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [editedTemplates, setEditedTemplates] = useState<Record<string, string>>({});
  const [editedEnabled, setEditedEnabled] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>("BOOKING_CONFIRMED");
  const [loading, setLoading] = useState(true);
  const [pageNotice, setPageNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Realistic Order Preview state
  const [realOrderPreview, setRealOrderPreview] = useState<{
    templateId: string;
    orderShortId: string;
    orderDate: string;
    rendered: string;
  } | null>(null);
  const [loadingRealPreview, setLoadingRealPreview] = useState(false);

  // Sending test check to admin number
  const [sendingCheckId, setSendingCheckId] = useState<string | null>(null);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/automations/templates");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.templates)) {
          setTemplates(data.templates);

          // Populate local edit caches
          const texts: Record<string, string> = {};
          const flags: Record<string, boolean> = {};
          data.templates.forEach((t: TemplateRecord) => {
            texts[t.id] = t.template;
            flags[t.id] = t.enabled;
          });
          setEditedTemplates(texts);
          setEditedEnabled(flags);
        }
      }
    } catch (err: any) {
      console.warn("Failed to load templates:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleTemplateTextChange = (id: string, val: string) => {
    setEditedTemplates((prev) => ({ ...prev, [id]: val }));
  };

  const handleToggleEnabled = (id: string, isProtected: boolean) => {
    if (isProtected) {
      alert("The OTP Verification automation is protected and cannot be disabled.");
      return;
    }
    setEditedEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const insertVariableToken = (id: string, tag: string) => {
    setEditedTemplates((prev) => {
      const current = prev[id] ?? "";
      return { ...prev, [id]: current + " " + tag };
    });
  };

  // Per-template save with optimistic concurrency check
  const handleSaveTemplate = async (tmpl: TemplateRecord) => {
    const newText = editedTemplates[tmpl.id];
    const newEnabled = editedEnabled[tmpl.id];

    setSavingId(tmpl.id);
    setPageNotice(null);

    try {
      const res = await fetch(`/api/admin/whatsapp/automations/templates/${tmpl.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: newText,
          enabled: newEnabled,
          currentVersion: tmpl.version,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Optimistic concurrency conflict
        setPageNotice({
          type: "error",
          text: data.error || "Conflict: Someone else saved this template. Please refresh to see changes.",
        });
        fetchTemplates();
        return;
      }

      if (res.ok && data.success) {
        setPageNotice({
          type: "success",
          text: `Template '${tmpl.name}' saved successfully (v${data.template.version}).`,
        });
        fetchTemplates();
      } else {
        setPageNotice({
          type: "error",
          text: data.error || "Failed to save template. Please review validation errors.",
        });
      }
    } catch {
      setPageNotice({ type: "error", text: "Network error saving template." });
    } finally {
      setSavingId(null);
    }
  };

  // Reset single template to code-defined default
  const handleResetTemplate = async (tmpl: TemplateRecord) => {
    if (!confirm(`Reset '${tmpl.name}' to the official system default template?`)) {
      return;
    }

    setResettingId(tmpl.id);
    setPageNotice(null);

    try {
      const res = await fetch(`/api/admin/whatsapp/automations/templates/${tmpl.id}/reset`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPageNotice({ type: "success", text: data.message });
        fetchTemplates();
      } else {
        setPageNotice({ type: "error", text: data.error || "Failed to reset template." });
      }
    } catch {
      setPageNotice({ type: "error", text: "Network error resetting template." });
    } finally {
      setResettingId(null);
    }
  };

  // Realistic Order Preview
  const handleLoadRealOrderPreview = async (tmplId: string) => {
    setLoadingRealPreview(true);
    setRealOrderPreview(null);
    const customTemplate = editedTemplates[tmplId];

    try {
      const query = new URLSearchParams({ templateId: tmplId });
      if (customTemplate) query.append("customTemplate", customTemplate);

      const res = await fetch(`/api/admin/whatsapp/automations/preview-order?${query.toString()}`);
      const data = await res.json();
      if (data.success && data.rendered) {
        setRealOrderPreview({
          templateId: tmplId,
          orderShortId: data.orderShortId,
          orderDate: data.orderDate,
          rendered: data.rendered,
        });
      } else {
        alert(data.message || "No orders available in the database for realistic preview.");
      }
    } catch {
      alert("Failed to load realistic order preview.");
    } finally {
      setLoadingRealPreview(false);
    }
  };

  // Send connectivity test check to admin's own number
  const handleSendCheckToMyPhone = async (tmplId: string) => {
    setSendingCheckId(tmplId);
    try {
      const res = await fetch("/api/admin/whatsapp/automations/send-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: tmplId,
          customTemplate: editedTemplates[tmplId],
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "Sample message delivered to your verified admin number.");
      } else {
        alert(data.message || "Failed to send check message.");
      }
    } catch {
      alert("Network error sending preview check.");
    } finally {
      setSendingCheckId(null);
    }
  };

  // Token Placeholder Preview (Honest: no realistic made-up customers)
  const renderTokenPlaceholderPreview = (templateText: string) => {
    if (!templateText) return "";
    return templateText
      .replace(/{{customerName}}/g, "[Customer Name]")
      .replace(/{{customerPhone}}/g, "[+254 7•• ••• •••]")
      .replace(/{{shortId}}/g, "[Order ID]")
      .replace(/{{pickupWindow}}/g, "[Scheduled Window]")
      .replace(/{{total}}/g, "[Total KES]")
      .replace(/{{subtotal}}/g, "[Subtotal KES]")
      .replace(/{{address}}/g, "[Pickup Address]")
      .replace(/{{landmark}}/g, "[Landmark]")
      .replace(/{{trackingUrl}}/g, "https://washflow.co.ke/track/[scoped-128bit-token]")
      .replace(/{{ratingUrl}}/g, "https://washflow.co.ke/rate/[scoped-128bit-token]")
      .replace(/{{adminUrl}}/g, "https://washflow.co.ke/admin")
      .replace(/{{code}}/g, "[6-Digit Code]")
      .replace(/{{expiryMinutes}}/g, "[5]")
      .replace(/{{points}}/g, "[Points]");
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      <WhatsAppNav />

      {/* Quiet Hours Delivery Policy Banner */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow">
        <div className="flex items-start sm:items-center gap-2.5">
          <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
          <span>
            <strong>Quiet Hours Active:</strong> Non-OTP messages between <strong>21:00–07:00 Africa/Nairobi</strong> wait in queue until morning rather than dropping. OTP messages bypass quiet hours.
          </span>
        </div>
        <span className="text-[11px] font-mono text-emerald-400 font-bold shrink-0">
          UTC+3 (Nairobi)
        </span>
      </div>

      {/* Notice Banner */}
      {pageNotice && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-lg ${
            pageNotice.type === "success"
              ? "bg-emerald-500/20 border border-emerald-400/40 text-emerald-200"
              : "bg-rose-500/20 border border-rose-500/40 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {pageNotice.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{pageNotice.text}</span>
          </div>
          <button onClick={() => setPageNotice(null)} className="text-[11px] underline opacity-80 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <span>Automations & Dispatch Templates</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real event-triggered WhatsApp workflows. Per-template optimistic concurrency, token previews, and quiet-hours delivery.
          </p>
        </div>
      </div>

      {/* Templates List */}
      <div className="space-y-4">
        {templates.map((tmpl) => {
          const isExpanded = expandedId === tmpl.id;
          const currentText = editedTemplates[tmpl.id] ?? tmpl.template;
          const currentEnabled = editedEnabled[tmpl.id] ?? tmpl.enabled;
          const isDirty = currentText !== tmpl.template || currentEnabled !== tmpl.enabled;
          const charCount = currentText.length;
          const isOverLength = charCount > 1024;

          return (
            <GlassCard
              key={tmpl.id}
              className={`p-5 transition-all ${
                tmpl.isProtected
                  ? "border-sky-500/30 bg-sky-950/10"
                  : isDirty
                  ? "border-amber-500/40 bg-amber-950/10"
                  : "border-white/10"
              }`}
            >
              {/* Header Row */}
              <div className="flex items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {/* Enabled Toggle */}
                  <button
                    onClick={() => handleToggleEnabled(tmpl.id, tmpl.isProtected)}
                    disabled={tmpl.isProtected}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-300 ${
                      currentEnabled ? "bg-emerald-500" : "bg-slate-700"
                    } ${tmpl.isProtected ? "cursor-not-allowed opacity-80" : "cursor-pointer"}`}
                    title={tmpl.isProtected ? "OTP automation cannot be disabled" : "Toggle automation"}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-300 ${
                        currentEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-bold text-white">{tmpl.name}</h2>
                      {tmpl.isProtected && (
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-extrabold uppercase tracking-wider border border-sky-500/30 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-sky-400" />
                          <span>Protected OTP</span>
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          tmpl.recipientType === "customer"
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                            : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        }`}
                      >
                        {tmpl.recipientType === "customer" ? "👤 Customer" : "🚨 Admin Alert"}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        v{tmpl.version}
                      </span>
                      {isDirty && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30 animate-pulse">
                          Unsaved changes
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">{tmpl.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : tmpl.id)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition"
                    title={isExpanded ? "Collapse" : "Expand template editor"}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-4 text-[11px] text-slate-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>Last sent: {tmpl.lastSentAt ? new Date(tmpl.lastSentAt).toLocaleDateString("en-KE", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                </span>
                <span>•</span>
                <span>
                  30d Success: <strong className={tmpl.successRate !== null && tmpl.successRate >= 95 ? "text-emerald-400" : "text-slate-300"}>{tmpl.successRate !== null ? `${tmpl.successRate}%` : "—"}</strong>
                </span>
                <span>•</span>
                <span>30d Volume: {tmpl.totalSent30d}</span>
              </div>

              {/* Expanded Template Editor & Preview */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                  {/* Sensitive Variables Warning */}
                  {currentText.includes("{{address}}") || currentText.includes("{{total}}") ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        <strong>Privacy Notice:</strong> This template contains sensitive variables (<code className="text-amber-200">&#123;&#123;address&#125;&#125;</code> or <code className="text-amber-200">&#123;&#123;total&#125;&#125;</code>). WhatsApp messages can reach a wrong or reassigned number. Default templates are kept minimal for data protection.
                      </span>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left: Template Editor */}
                    <div className="lg:col-span-7 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-200">
                          Template Body
                        </label>
                        <span
                          className={`text-[10px] font-mono ${
                            isOverLength ? "text-rose-400 font-bold" : "text-slate-400"
                          }`}
                        >
                          {charCount}/1,024 chars
                        </span>
                      </div>

                      {/* Variable Chips */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="text-[10px] text-slate-400 self-center mr-1">Insert:</span>
                        {tmpl.allowedVariables.map((v) => (
                          <button
                            key={v.tag}
                            type="button"
                            onClick={() => insertVariableToken(tmpl.id, v.tag)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition border ${
                              v.sensitive
                                ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/20"
                                : "bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-sky-500/20"
                            }`}
                            title={v.sensitive ? "Sensitive variable" : "Insert variable"}
                          >
                            + {v.label}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={currentText}
                        onChange={(e) => handleTemplateTextChange(tmpl.id, e.target.value)}
                        rows={7}
                        className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border text-white text-xs font-mono focus:outline-none leading-relaxed ${
                          isOverLength ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-emerald-400"
                        }`}
                      />

                      {/* Actions: Save per template & Reset per template */}
                      <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleResetTemplate(tmpl)}
                            disabled={resettingId === tmpl.id}
                            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{resettingId === tmpl.id ? "Resetting..." : "Reset to default"}</span>
                          </button>

                          <button
                            onClick={() => handleSendCheckToMyPhone(tmpl.id)}
                            disabled={sendingCheckId === tmpl.id}
                            className="px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 text-xs font-semibold transition flex items-center gap-1.5"
                            title="Sends check message only to admin's verified phone"
                          >
                            <Send className="w-3 h-3" />
                            <span>{sendingCheckId === tmpl.id ? "Sending..." : "Send check to my phone"}</span>
                          </button>
                        </div>

                        <button
                          onClick={() => handleSaveTemplate(tmpl)}
                          disabled={savingId === tmpl.id || isOverLength || !isDirty}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md ${
                            isDirty && !isOverLength
                              ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/25"
                              : "bg-white/10 text-slate-400 cursor-not-allowed"
                          }`}
                        >
                          <Check className="w-4 h-4" />
                          <span>{savingId === tmpl.id ? "Saving..." : "Save Template"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Right: Honest Token Preview & Real Order Preview */}
                    <div className="lg:col-span-5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Live Token Preview</span>
                        </div>
                        <button
                          onClick={() => handleLoadRealOrderPreview(tmpl.id)}
                          disabled={loadingRealPreview}
                          className="text-[11px] text-sky-400 hover:text-sky-300 font-bold underline flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Preview with a real order</span>
                        </button>
                      </div>

                      {/* WhatsApp Chat Bubble */}
                      <div className="p-4 rounded-2xl bg-[#0b141a] border border-[#202c33] text-white min-h-[170px] flex flex-col justify-between">
                        <div className="p-3 rounded-2xl rounded-tl-sm bg-[#005c4b] text-white text-xs leading-relaxed whitespace-pre-wrap font-sans shadow">
                          {renderTokenPlaceholderPreview(currentText)}
                          <div className="text-[9px] text-[#8696a0] text-right mt-1.5">
                            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-400 text-center pt-2 italic">
                          Honest preview with placeholder tokens. Sensitive data is never simulated.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>

      {/* Real Order Masked Preview Modal */}
      {realOrderPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg p-6 rounded-3xl bg-slate-900 border border-white/20 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-sky-400" />
                <span>Masked Real Order Preview</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">
                Order #{realOrderPreview.orderShortId}
              </span>
            </div>

            <p className="text-xs text-slate-300">
              Rendered using an existing database booking with PII and sensitive parameters masked. Visible only to logged-in administrator.
            </p>

            <div className="p-4 rounded-2xl bg-[#0b141a] border border-[#202c33] text-white">
              <div className="p-3.5 rounded-2xl rounded-tl-sm bg-[#005c4b] text-white text-xs leading-relaxed whitespace-pre-wrap font-sans shadow">
                {realOrderPreview.rendered}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setRealOrderPreview(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
