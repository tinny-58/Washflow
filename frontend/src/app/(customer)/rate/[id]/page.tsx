"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import { Star, Heart, Sparkles, CheckCircle2, ArrowRight, Lock } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export default function RateAndTipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: routeIdentifier } = use(params);

  const [stars, setStars] = useState<number>(5);
  const [hoverStars, setHoverStars] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [selectedTip, setSelectedTip] = useState<number | null>(100);
  const [customTip, setCustomTip] = useState<string>("");

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tipPresets = [50, 100, 200, 500];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const isScopedToken = /^[a-f0-9]{64}$/i.test(routeIdentifier);

      let res: Response;
      if (isScopedToken) {
        // Submit via 128-bit unguessable scoped token (which immediately revokes upon submission)
        res = await fetch(`/api/rate/${routeIdentifier}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stars,
            comment: comment.trim() || undefined,
          }),
        });
      } else {
        // Submit via authenticated customer endpoint
        res = await fetch("/api/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: routeIdentifier,
            stars,
            comment: comment.trim() || undefined,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to submit rating.");
        setSubmitting(false);
        return;
      }

      // 2. Submit Tip if selected (non-zero)
      const finalTip = customTip ? parseInt(customTip, 10) : selectedTip || 0;
      if (finalTip > 0 && !isScopedToken) {
        await fetch("/api/payments/mpesa/stk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: routeIdentifier,
            amount: finalTip,
            type: "tip",
          }),
        }).catch((err) => console.error("Tip STK error:", err));
      }

      setSubmitted(true);
    } catch {
      setErrorMessage("Network error submitting rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex-1 max-w-md mx-auto px-4 py-12 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center animate-bounce">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-white">Thank You So Much!</h2>
        <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
          Your feedback and cleaner appreciation keep our team delivering the highest quality laundry standard in Kenya.
        </p>
        <Link
          href={`/track/${routeIdentifier}`}
          className="px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg transition"
        >
          Return to Order
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-md mx-auto px-4 py-8 w-full space-y-5">
      <div className="text-center space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Laundry Delivered</span>
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">How did we do?</h1>
        <p className="text-xs text-slate-400">
          Rate your WashFlow laundry wash and delivery experience
        </p>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Star Rating Card */}
        <GlassCard className="p-6 text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((val) => {
              const active = hoverStars ? val <= hoverStars : val <= stars;
              return (
                <button
                  type="button"
                  key={val}
                  onClick={() => setStars(val)}
                  onMouseEnter={() => setHoverStars(val)}
                  onMouseLeave={() => setHoverStars(0)}
                  className="p-1.5 text-amber-400 transition transform hover:scale-110 active:scale-95"
                >
                  <Star
                    className={`w-8 h-8 ${
                      active ? "fill-amber-400 text-amber-400" : "text-slate-600"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <p className="text-xs font-semibold text-slate-300">
            {stars === 5 && "Outstanding! Crisp, fresh & right on time."}
            {stars === 4 && "Great job! Very satisfied."}
            {stars === 3 && "Average service."}
            {stars === 2 && "Could have been better."}
            {stars === 1 && "Disappointing experience."}
          </p>

          <textarea
            rows={3}
            placeholder="Share feedback on washing quality, packaging, or driver friendliness (optional)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </GlassCard>

        {/* Cleaner Tip Card (for logged-in clients) */}
        {!/^[a-f0-9]{64}$/i.test(routeIdentifier) && (
          <GlassCard className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-white">
              <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                Appreciate Your Washer & Driver
              </h3>
            </div>
            <p className="text-[11px] text-slate-400">
              100% of cleaner tips go directly to the WashFlow operations team who serviced your order.
            </p>

            <div className="grid grid-cols-4 gap-2">
              {tipPresets.map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => {
                    setSelectedTip(amt);
                    setCustomTip("");
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition border ${
                    selectedTip === amt && !customTip
                      ? "bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/20"
                      : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                  }`}
                >
                  KES {amt}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedTip(null);
                  setCustomTip("");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedTip === null && !customTip
                    ? "bg-white/15 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                No tip
              </button>
              <input
                type="number"
                placeholder="Custom KES..."
                value={customTip}
                onChange={(e) => {
                  setCustomTip(e.target.value);
                  setSelectedTip(null);
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </GlassCard>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white font-bold text-xs tracking-wide transition shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <>
              <span>Submit Review</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
