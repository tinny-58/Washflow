import Link from "next/link";
import { Sparkles, ArrowRight, ShieldCheck, QrCode, Clock, Truck, Award } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-xl mx-auto w-full space-y-6">
      {/* Hero Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 text-xs font-semibold backdrop-blur-md">
        <Sparkles className="w-3.5 h-3.5" />
        <span>Nairobi&apos;s Fastest Laundry Pickup & Delivery</span>
      </div>

      {/* Main Title */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
          Spotless Laundry Delivered in <span className="text-sky-400">24 Hours</span>
        </h1>
        <p className="text-sm text-slate-300 max-w-md mx-auto">
          No sign-up hassle. Scan our poster or tap below, book in under 30 seconds, and we take care of the rest.
        </p>
      </div>

      {/* Primary CTA */}
      <div className="w-full space-y-3">
        <Link
          href="/book"
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold text-base tracking-wide shadow-xl shadow-sky-500/30 flex items-center justify-center gap-2 transition active:scale-95"
        >
          <span>Book a Laundry Pickup</span>
          <ArrowRight className="w-5 h-5" />
        </Link>

        <p className="text-[11px] text-center text-slate-400">
          ⚡ 30-second mobile booking • Pay via M-Pesa STK or on delivery
        </p>
      </div>

      {/* Value Proposition Cards */}
      <div className="grid grid-cols-2 gap-3 w-full">
        <GlassCard className="p-4 flex flex-col items-center text-center space-y-2">
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold text-white">Under 30s Booking</h3>
          <p className="text-[11px] text-slate-300 leading-snug">
            One-tap GPS pin, quick phone OTP, done.
          </p>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col items-center text-center space-y-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold text-white">Doorstep Pickup</h3>
          <p className="text-[11px] text-slate-300 leading-snug">
            Choose your window; our driver arrives on time.
          </p>
        </GlassCard>
      </div>

      {/* Poster QR Notice */}
      <GlassCard className="p-4 w-full flex items-center gap-3.5 border-white/20">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-sky-400 shrink-0">
          <QrCode className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h4 className="text-xs font-bold text-white">Found our QR Poster?</h4>
          <p className="text-[11px] text-slate-300">
            Scan any WashFlow poster around your building to order directly with auto-localized pickup.
          </p>
        </div>
      </GlassCard>

      {/* Trust & Guarantee */}
      <div className="flex items-center justify-center gap-4 text-xs text-slate-400 pt-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Hygienic Washing</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Award className="w-4 h-4 text-sky-400" />
          <span>Satisfaction Guaranteed</span>
        </div>
      </div>
    </div>
  );
}
