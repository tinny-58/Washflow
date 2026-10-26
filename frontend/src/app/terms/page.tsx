import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  FileText,
  ArrowLeft,
  ShieldCheck,
  Gift,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Terms & Conditions | WashFlow Kenya",
  description:
    "WashFlow Kenya customer service terms, catalog pricing rules, M-Pesa payment policies, rewards program rules, and damaged/lost items procedures.",
  openGraph: {
    title: "WashFlow Kenya | Terms & Conditions",
    description: "Operational guidelines, transparent pricing rules, and item care policies.",
    url: "/terms",
    type: "website",
  },
};

export default function TermsPage() {
  return (
    <div className="w-full flex-1 pb-16 flex flex-col justify-between">
      <div>
        {/* Navigation / Back Bar */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition py-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </Link>
        </div>

        {/* Header Section */}
        <section className="pt-6 pb-10 border-b border-white/10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-400/30 text-sky-300 text-xs font-semibold backdrop-blur-md">
              <FileText className="w-4 h-4 text-sky-400" />
              <span>Service Agreement</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Terms & Conditions
            </h1>
            <p className="max-w-xl mx-auto text-xs sm:text-sm text-slate-300">
              Clear, transparent operational standards for doorstep laundry pickup, washing, and delivery in Nairobi.
            </p>
          </div>
        </section>

        {/* Terms Content Body */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8 text-slate-300 text-xs sm:text-sm leading-relaxed">
          {/* Section 1 */}
          <section className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
            <h2 className="text-base font-bold text-white">1. Service Scope & Booking</h2>
            <p>
              WashFlow provides on-demand doorstep laundry collection, washing, tumble-drying, steam pressing, and delivery across Nairobi. By scheduling a pickup online or creating an account, you agree to these Terms and Conditions.
            </p>
          </section>

          {/* Section 2 */}
          <section className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
            <h2 className="text-base font-bold text-white">2. Unit Pricing & Catalog Transparency</h2>
            <p>
              Prices listed on our live catalog are fixed by service tier (Everyday Basket loads, Duvet dimensions, and Floor Mat sizes). Final order amounts are confirmed upon digital booking and verified during dispatch inspection. No surprise fees or scale adjustments are introduced without customer consent.
            </p>
          </section>

          {/* Section 3 */}
          <section className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
            <h2 className="text-base font-bold text-white">3. Payments via M-Pesa</h2>
            <p>
              All transactions are conducted in Kenyan Shillings (KES) securely via Safaricom M-Pesa (Daraja API). Customers may complete payment upon delivery inspection or via instant STK push at booking. An official receipt is automatically generated and confirmed via WhatsApp.
            </p>
          </section>

          {/* Section 4: Program Rules & Vouchers (Anchored: #rewards) */}
          <section id="rewards" className="scroll-mt-32 p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-sky-500/20 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-white/10">
              <Gift className="w-5 h-5 text-amber-400" />
              <h2 className="text-base sm:text-lg font-bold text-white">4. Referral Program, Loyalty Points & Reward Vouchers</h2>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <div>
                <h3 className="font-bold text-white mb-1">4.1 Referral Qualification & Points Award</h3>
                <p>
                  Existing clients (&quot;Referrers&quot;) earn <strong>100 referral points</strong> for each new client (&quot;Referee&quot;) they invite, strictly upon meeting all qualification conditions: (a) the referee must be a genuinely new customer with no prior account, phone number, or booking in the WashFlow database; (b) the referee must complete their first laundry order through to verified <strong>DELIVERED</strong> status; (c) payment must be successfully settled and reconciled via verified M-Pesa callback for an amount of at least the minimum qualifying order value (currently <strong>KES 300</strong>); and (d) the order must not be cancelled, refunded, or disputed. Attribution is permanently locked upon initial account creation.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-white mb-1">4.2 Milestone Thresholds & Reward Caps</h3>
                <p>
                  Referral points accumulate toward distinct milestone tiers:
                </p>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-slate-300">
                  <li>
                    <strong>Standard Milestone (500 Points / 5 Qualified Referrals):</strong> Entitles the referrer to choose one free laundry line from an eligible catalog set: Small Basket (up to 7 kg), Single / 3x5 Duvet, or Small Doormat / Bath Mat, capped at <strong>KES 300</strong>.
                  </li>
                  <li>
                    <strong>Exclusive Milestone (1,000 Points / 10 Qualified Referrals):</strong> Entitles the referrer to one free Large Basket (up to 15 kg), capped at <strong>KES 450</strong>.
                  </li>
                </ul>
                <p className="mt-1">
                  Rewards reference authoritative price catalog IDs. Any excess weight, specialty items, or additional laundry lines beyond the promotional item are billed at standard catalog rates. Vouchers cannot be combined with other discount codes or stacked on a single booking.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-white mb-1">4.3 Loyalty Points Program</h3>
                <p>
                  Clients earn <strong>10 loyalty points</strong> on every completed, paid laundry order. Loyalty points are awarded solely on the paid cash portion of an order; washes covered entirely by a reward voucher earn 0 loyalty points. Accumulating <strong>100 loyalty points</strong> entitles the client to redeem one free Small Basket wash (capped at KES 300).
                </p>
              </div>

              <div>
                <h3 className="font-bold text-white mb-1">4.4 Administrative Review & Fraud Prevention</h3>
                <p>
                  To preserve fair play, all milestone reward entitlements undergo an administrative review and security check before a redeemable voucher is generated. WashFlow employs automated fraud detection: matching M-Pesa phone numbers, duplicate device or browser fingerprints, delivery address proximity, velocity anomalies, and circular referral rings are strictly prohibited. Referrals flagged for fraud or self-referral will be voided without compensation.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-white mb-1">4.5 Reversals & Order Cancellations</h3>
                <p>
                  In the event a qualifying order is subsequently refunded, cancelled, or disputed, associated referral and loyalty points will be reversed via negative ledger entries. Any pending reward entitlement will be voided. If a voucher has already been approved or redeemed on a reversed order, the client&apos;s account will be flagged for administrative dispute resolution.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-white mb-1">4.6 Voucher Validity, Non-Transferability & Expiry</h3>
                <p>
                  Issued reward vouchers are valid for <strong>90 days</strong> from the date of administrative approval. Expired vouchers cannot be reissued or reinstated. Loyalty points remain active for 12 months of account activity; inactivity exceeding 12 months may result in points expiration following advance notice. Referral points do not expire. Vouchers and points have zero cash redemption value, are non-transferable, and cannot be bartered or sold.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-white mb-1">4.7 Tax & Accounting Disclaimer</h3>
                <p>
                  Promotional points, milestone entitlements, and vouchers constitute non-cash promotional discounts offered at WashFlow&apos;s sole discretion. Participants are solely responsible for determining any personal tax liabilities that may arise in connection with receipt or redemption of promotional discounts under the laws of Kenya.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5: Damaged / Lost Items Policy (Anchored: #claims) */}
          <section id="claims" className="scroll-mt-32 p-6 rounded-2xl bg-slate-900/60 border border-amber-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-bold text-white">5. Damaged / Lost Items Policy</h2>
            </div>
            <p>
              WashFlow handles each individual drum load with high standards of care. In the rare event an item is misplaced or damaged during washing or transit:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>Claims must be reported to customer support via WhatsApp or email within <strong>24 hours of delivery</strong>.</li>
              <li>Customers must inspect garments upon delivery before accepting handoff from the courier.</li>
              <li>Verified claims are reviewed within 48 hours and compensated in accordance with fair depreciated market value up to KES 5,000 per order or through service credit vouchers.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
            <h2 className="text-base font-bold text-white">6. Governing Law</h2>
            <p>
              These terms are governed by and construed in accordance with the laws of the Republic of Kenya.
            </p>
          </section>
        </div>
      </div>

      {/* Cross-Link Bar */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="text-xs text-slate-300">
            <p className="font-bold text-white">Questions about our policies?</p>
            <p className="text-slate-400">Our support desk is happy to clarify any operational terms.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/privacy"
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition"
            >
              Privacy Policy
            </Link>
            <Link
              href="/contact"
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition flex items-center gap-1.5"
            >
              <span>Contact Support</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
