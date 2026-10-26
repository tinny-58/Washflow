import { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  Clock,
  Sparkles,
  MapPin,
  Calendar,
  Gift,
  Users,
  Award,
  ArrowRight,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export const metadata: Metadata = {
  title: "About WashFlow | Fast, Crisp & Professional Laundry in Nairobi",
  description:
    "WashFlow is Nairobi's reliable doorstep laundry service. Individual garment washing, transparent catalog pricing, on-time pickup and delivery, and privacy-first customer care.",
  openGraph: {
    title: "About WashFlow Kenya | Professional Doorstep Laundry",
    description:
      "Individual drum wash cycles, eco-friendly detergents, and 24-hour doorstep delivery across Nairobi.",
    url: "/about",
    type: "website",
  },
};

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

async function getProgramRules() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/catalog`, {
      next: { tags: ["catalog"], revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.programSettings?.programActive === false || data.programRules?.programActive === false) {
        return null;
      }
      return {
        programActive: true,
        standardMilestonePoints: 500,
        exclusiveMilestonePoints: 1000,
        standardRewardCapKes: 300,
        exclusiveRewardCapKes: 450,
        loyaltyPointsPerWash: 10,
        loyaltyRedemptionThreshold: 100,
        minOrderValueKes: 300,
        voucherValidityDays: 90,
      };
    }
  } catch {
    // Fallback if backend offline during static compile
  }
  return {
    programActive: true,
    standardMilestonePoints: 500,
    exclusiveMilestonePoints: 1000,
    standardRewardCapKes: 300,
    exclusiveRewardCapKes: 450,
    loyaltyPointsPerWash: 10,
    loyaltyRedemptionThreshold: 100,
    minOrderValueKes: 300,
    voucherValidityDays: 90,
  };
}

export default async function AboutPage() {
  const program = await getProgramRules();

  return (
    <div className="w-full flex-1 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-12 sm:pt-16 sm:pb-16 border-b border-white/10 bg-gradient-to-b from-slate-900/60 via-slate-950/80 to-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-400/30 text-sky-300 text-xs font-semibold backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Nairobi Doorstep Laundry Service</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Fresh clothes delivered to your door.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300">
              Simple, transparent, on time.
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
            WashFlow delivers professional laundry, duvet, and area mat cleaning directly to homes,
            apartments, and offices across Nairobi. Every customer load is washed individually in
            sanitized drums with upfront catalog pricing.
          </p>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-16">
        {/* Our 4 Commitments */}
        <div className="space-y-6">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Our Promise</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Four fundamental commitments we make on every single booking.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassCard className="p-5 space-y-3 border-white/10 hover:border-sky-500/40 transition">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">Garment Care</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Every customer order is washed separately in dedicated machines. Clothes from
                different households are never mixed.
              </p>
            </GlassCard>

            <GlassCard className="p-5 space-y-3 border-white/10 hover:border-sky-500/40 transition">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">24-Hour Return</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Everyday wash-and-fold baskets are collected, cleaned, tumble-dried, and returned to
                your doorstep within 24 hours.
              </p>
            </GlassCard>

            <GlassCard className="p-5 space-y-3 border-white/10 hover:border-sky-500/40 transition">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">Catalog Truth</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                No hidden surcharges. Every price shown on our website matches our authoritative
                catalog and is verified on the server at checkout.
              </p>
            </GlassCard>

            <GlassCard className="p-5 space-y-3 border-white/10 hover:border-sky-500/40 transition">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">Privacy First</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Your phone number and doorstep coordinates are never disclosed. Used solely for your
                scheduled pickups and order updates.
              </p>
            </GlassCard>
          </div>
        </div>

        {/* How We Work: 4 Steps */}
        <div className="space-y-8">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              How It Works
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              From doorstep pickup to clean return in 4 straightforward steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative rounded-2xl bg-slate-900/60 border border-white/10 p-5 space-y-3">
              <div className="w-8 h-8 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono font-bold text-xs flex items-center justify-center">
                01
              </div>
              <h3 className="text-sm font-bold text-white">Book Online</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Select your basket size, duvets, or floor mats. Pick your preferred morning,
                midday, afternoon, or evening window.
              </p>
            </div>

            <div className="relative rounded-2xl bg-slate-900/60 border border-white/10 p-5 space-y-3">
              <div className="w-8 h-8 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono font-bold text-xs flex items-center justify-center">
                02
              </div>
              <h3 className="text-sm font-bold text-white">Doorstep Pickup</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Our rider arrives with a sanitized laundry bag to collect your items from your
                apartment or house.
              </p>
            </div>

            <div className="relative rounded-2xl bg-slate-900/60 border border-white/10 p-5 space-y-3">
              <div className="w-8 h-8 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono font-bold text-xs flex items-center justify-center">
                03
              </div>
              <h3 className="text-sm font-bold text-white">Wash & Fold</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Washed individually, tumble-dried, steam-sanitized, and neatly folded into labeled,
                weather-protected bundles.
              </p>
            </div>

            <div className="relative rounded-2xl bg-slate-900/60 border border-white/10 p-5 space-y-3">
              <div className="w-8 h-8 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono font-bold text-xs flex items-center justify-center">
                04
              </div>
              <h3 className="text-sm font-bold text-white">Delivery & M-Pesa</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Delivered back fresh to your door. You pay seamlessly via M-Pesa push prompt once
                your clean laundry is received.
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Rewards & Loyalty Section (Anchored: #loyalty) */}
        {program && (
          <div
            id="loyalty"
            className="scroll-mt-24 rounded-3xl bg-gradient-to-b from-sky-950/40 to-slate-900/80 border border-sky-500/20 p-6 sm:p-10 space-y-8"
          >
            <div className="text-center max-w-xl mx-auto space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-300 text-xs font-semibold">
                <Gift className="w-3.5 h-3.5" />
                <span>Transparent Rewards Program</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Earn Free Washes with Friends & Loyalty
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Real, automatic rewards that credit directly to your account. No confusing points,
                no hidden expiration tricks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Referral Card */}
              <div className="rounded-2xl bg-slate-900/90 border border-white/10 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">
                    100 Points / Qualified Referral
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-white">Refer Friends & Earn Milestones</h3>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1">
                    Share your personal link. When a friend signs up, receives their first delivery, and pays via M-Pesa (min KES {program.minOrderValueKes}), you earn <strong className="text-white">100 referral points</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Standard Reward (500 pts):</span>
                    <strong className="text-white font-mono">
                      Choice of Small Basket, Duvet, or Mat (KES {program.standardRewardCapKes})
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Exclusive Reward (1,000 pts):</span>
                    <strong className="text-amber-400 font-mono">
                      Large Basket up to 15 kg (KES {program.exclusiveRewardCapKes})
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Voucher Validity:</span>
                    <span>{program.voucherValidityDays} days from issuance</span>
                  </div>
                </div>
              </div>

              {/* Loyalty Card */}
              <div className="rounded-2xl bg-slate-900/90 border border-white/10 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <Award className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    +10 Loyalty Points / Paid Wash
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-white">Continuous Loyalty Points</h3>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1">
                    Wash regularly with WashFlow and earn without extra effort. Earn <strong className="text-white">+{program.loyaltyPointsPerWash} points</strong> on every paid order. Reach <strong className="text-white">{program.loyaltyRedemptionThreshold} loyalty points</strong> for a free Small Basket wash!
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Loyalty Redemption:</span>
                    <strong className="text-white font-mono">
                      100 pts = Free Small Basket (KES {program.standardRewardCapKes})
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Order Tracking:</span>
                    <span>Tracked in real time on your Client Portal</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Terms & Conditions:</span>
                    <Link href="/terms" className="text-sky-400 hover:underline">
                      View full program rules
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Operating Hours & Service Area */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlassCard className="p-6 space-y-4 border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Service Area</h3>
                <p className="text-xs text-slate-400">Direct doorstep coverage in Nairobi</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              We currently serve residences and apartments across Nairobi, including Kilimani,
              Kileleshwa, Lavington, Westlands, Riverside, Parklands, South B, South C, and
              surrounding central neighborhoods.
            </p>
          </GlassCard>

          <GlassCard className="p-6 space-y-4 border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Operating Hours</h3>
                <p className="text-xs text-slate-400">Convenient morning to evening windows</p>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span>Monday – Saturday:</span>
                <strong className="text-white font-mono">7:00 AM – 8:00 PM</strong>
              </div>
              <div className="flex justify-between">
                <span>Sunday:</span>
                <strong className="text-white font-mono">8:00 AM – 6:00 PM</strong>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Call to Action Banner */}
        <div className="text-center rounded-3xl bg-slate-900 border border-white/10 p-8 sm:p-12 space-y-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Ready for crisp, hassle-free laundry?
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
            Book your first wash in under two minutes. Select your basket, pick a convenient pickup
            slot, and leave the washing to us.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/book"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition min-h-[44px]"
            >
              <span>Book a Pickup Now</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/prices"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition text-center min-h-[44px] flex items-center justify-center"
            >
              Explore Price Catalog
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
