import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  ArrowLeft,
  Lock,
  Eye,
  Database,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy & Data Rights | WashFlow Kenya",
  description:
    "WashFlow Kenya customer privacy policy in compliance with the Kenya Data Protection Act 2019. Transparent data collection, WhatsApp OTP, and account rights.",
  openGraph: {
    title: "WashFlow Kenya | Privacy Policy & Data Rights",
    description: "First-party privacy standards, Kenya DPA 2019 compliance, and user rights.",
    url: "/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
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
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-semibold backdrop-blur-md">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Kenya DPA 2019 Compliant</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Privacy Policy & Data Rights
            </h1>
            <p className="max-w-xl mx-auto text-xs sm:text-sm text-slate-300">
              How WashFlow collects, uses, and protects your personal data in accordance with statutory Kenyan data protection principles.
            </p>
          </div>
        </section>

        {/* Privacy Content Body */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8 text-slate-300 text-xs sm:text-sm leading-relaxed">
          {/* Section 1 */}
          <section className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
            <h2 className="text-base font-bold text-white">1. Information We Collect</h2>
            <p>
              To fulfill doorstep laundry orders and provide real-time dispatch updates, WashFlow collects minimal necessary personal details:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li><strong>Contact Information:</strong> Your phone number is collected to dispatch WhatsApp one-time passwords (OTP), automated order tracking links, and rider arrival notifications.</li>
              <li><strong>Location Data:</strong> Delivery addresses and apartment details provided during booking to navigate courier pickups and drop-offs.</li>
              <li><strong>Credentials:</strong> Usernames and passwords. Passwords are never stored in plaintext and are hashed using Argon2id.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
            <h2 className="text-base font-bold text-white">2. How Your Data is Used</h2>
            <p>
              Your personal information is used exclusively for operating our laundry service: scheduling couriers, processing M-Pesa payments, and sending order notifications. We do not sell, rent, or trade customer data to advertising networks or third-party marketers.
            </p>
          </section>

          {/* Section 3 */}
          <section className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
            <h2 className="text-base font-bold text-white">3. Essential Cookies & Security</h2>
            <p>
              WashFlow uses strictly necessary first-party session cookies (<code>wf_session</code> or <code>__Host-wf_session</code>) configured with <code>httpOnly</code>, <code>SameSite</code>, and <code>Secure</code> flags. We do not deploy third-party cross-site behavioral tracking scripts.
            </p>
          </section>

          {/* Section 4 */}
          <section className="p-6 rounded-2xl bg-slate-900/60 border border-emerald-500/20 space-y-2">
            <h2 className="text-base font-bold text-white">4. Your Statutory Data Rights (Kenya DPA 2019)</h2>
            <p>
              Under Section 26 of the Kenya Data Protection Act 2019, you have the right to be informed of how your data is used, access your personal data, request correction of inaccurate records, and request deletion of your account. You can manage saved addresses and account settings anytime in your client dashboard, or by contacting our team at <code>support@washflow.co.ke</code>.
            </p>
          </section>
        </div>
      </div>

      {/* Cross-Link Bar */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="text-xs text-slate-300">
            <p className="font-bold text-white">Need to exercise your data rights?</p>
            <p className="text-slate-400">Contact our data protection team or manage settings in your client portal.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/terms"
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition"
            >
              Terms & Conditions
            </Link>
            <Link
              href="/contact"
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition flex items-center gap-1.5"
            >
              <span>Contact Team</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
