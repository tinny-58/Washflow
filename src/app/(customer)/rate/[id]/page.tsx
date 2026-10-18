"use client";

import React, { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Star, Heart, Sparkles, CheckCircle2, ArrowRight } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export default function RateAndTipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: bookingId } = use(params);
  const router = useRouter();

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
      // 1. Submit Rating
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          stars,
          comment,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to submit rating.");
        setSubmitting(false);
        return;
      }

      // 2. Submit Tip if selected (non-zero)
      const finalTip = customTip ? parseInt(customTip, 10) : selectedTip || 0;
      if (finalTip > 0) {
        await fetch("/api/payments/mpesa/stk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId,
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
          href={`/track/${bookingId}`}
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
        <h2 className="text-2xl font-extrabold text-white">Rate Your Experience</h2>
        <p className="text-xs text-slate-300">
          How fresh, clean, and crisp was your delivered laundry?
        </p>
      </div>

      <GlassCard>
        <form onSubmit={handleSubmit} className="space-y-5">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {errorMessage}
            </div>
          )}

          {/* 1-5 Star Selection */}
          <div className="flex items-center justify-center gap-2 py-2">
            {[1, 2, 3, 4, 5].map((val) => {
              const active = (hoverStars || stars) >= val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setStars(val)}
                  onMouseEnter={() => setHoverStars(val)}
                  onMouseLeave={() => setHoverStars(0)}
                  className="p-1.5 transition-transform hover:scale-125 focus:outline-none"
                >
                  <Star
                    className={`w-9 h-9 transition-colors ${
                      active
                        ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                        : "text-slate-600"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="text-center text-xs font-bold text-amber-300">
            {stars === 5 && "⭐ Outstanding service & crisp folding!"}
            {stars === 4 && "⭐ Great job, very clean!"}
            {stars === 3 && "⭐ Good, standard wash."}
            {stars <= 2 && "Needs improvement."}
          </div>

          {/* Review Comments */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Add a Comment (Optional)
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. My white shirts came out spotless and smell amazing!"
              className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-400 resize-none"
            />
          </div>

          {/* Tip Cleaner Section - Prominently displayed when stars >= 4 */}
          {stars >= 4 && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="flex items-center gap-2 text-amber-300">
                <Heart className="w-4 h-4 fill-amber-300" />
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  Tip Your Laundry Washer & Driver
                </h4>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug">
                100% of tips go directly to the team who washed and delivered your clothes.
              </p>

              {/* Preset Tip Buttons */}
              <div className="grid grid-cols-4 gap-1.5">
                {tipPresets.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setSelectedTip(amt);
                      setCustomTip("");
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      selectedTip === amt && !customTip
                        ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md"
                        : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    +{amt}
                  </button>
                ))}
              </div>

              {/* Custom Tip Input & Skip option */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="10"
                  placeholder="Custom amount (KES)"
                  value={customTip}
                  onChange={(e) => {
                    setCustomTip(e.target.value);
                    setSelectedTip(null);
                  }}
                  className="flex-1 px-3 py-1.5 rounded-xl glass-input text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTip(0);
                    setCustomTip("");
                  }}
                  className="px-3 py-1.5 rounded-xl text-[11px] text-slate-400 hover:text-slate-200 transition"
                >
                  Skip Tip
                </button>
              </div>
            </div>
          )}

          {/* Submit Rating & Tip Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            {submitting ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <>
                <span>Submit Feedback & Complete</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </GlassCard>
    </div>
  );
}
