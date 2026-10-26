import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Phone,
  MessageSquare,
  Mail,
  Clock,
  MapPin,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

export const metadata: Metadata = {
  title: "Contact & Support | OTF Washflow",
  description:
    "Get in touch with OTF Washflow. Reach our Embu dispatch and customer care team via WhatsApp, phone, or email for laundry orders, pickups, and inquiries.",
  openGraph: {
    title: "Contact OTF Washflow | Doorstep Laundry Customer Care",
    description:
      "Support and inquiries for doorstep laundry pickup and delivery in Embu, Kenya.",
    url: "/contact",
    type: "website",
  },
};

export default function ContactPage() {
  const businessPhone = process.env.NEXT_PUBLIC_OTF_BUSINESS_PHONE || "+254700000000";
  const businessWaDigits = businessPhone.replace(/\D/g, "");

  return (
    <div className="w-full flex-1 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-12 sm:pt-16 sm:pb-16 border-b border-white/10 bg-gradient-to-b from-slate-900/60 via-slate-950/80 to-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-400/30 text-sky-300 text-xs font-semibold backdrop-blur-md">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            <span>Customer Care & Dispatch Support</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            How can we help you?
          </h1>

          <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
            Need to reschedule a pickup, ask about catalog prices, or track an active laundry order?
            Our OTF Washflow Embu support team is ready to assist.
          </p>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-10">
        {/* Contact Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* WhatsApp Support */}
          <GlassCard className="p-6 space-y-4 flex flex-col justify-between border-white/10 hover:border-emerald-500/40 transition">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-base font-bold text-white">WhatsApp Care (@otfwashflow)</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Fastest support channel for location pins, order status changes, and quick inquiries.
              </p>
            </div>
            <a
              href={`https://wa.me/${businessWaDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 min-h-[44px]"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat with OTF Washflow</span>
            </a>
          </GlassCard>

          {/* Telephone Support */}
          <GlassCard className="p-6 space-y-4 flex flex-col justify-between border-white/10 hover:border-sky-500/40 transition">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <Phone className="w-5 h-5 text-sky-400" />
              </div>
              <h3 className="text-base font-bold text-white">Telephone Support</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Direct verbal communication with our dispatch controllers during operational hours.
              </p>
            </div>
            <a
              href={`tel:${businessPhone}`}
              className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition flex items-center justify-center gap-2 min-h-[44px]"
            >
              <Phone className="w-4 h-4" />
              <span>Call Dispatch ({businessPhone})</span>
            </a>
          </GlassCard>

          {/* Email Support */}
          <GlassCard className="p-6 space-y-4 flex flex-col justify-between border-white/10 hover:border-indigo-500/40 transition">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <Mail className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-base font-bold text-white">Email Inquiries</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                For corporate billing, receipts, business partnership inquiries, and feedback.
              </p>
            </div>
            <a
              href="mailto:support@washflow.co.ke"
              className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition flex items-center justify-center gap-2 min-h-[44px]"
            >
              <Mail className="w-4 h-4" />
              <span>support@washflow.co.ke</span>
            </a>
          </GlassCard>
        </div>

        {/* Operating Hours & Dispatch Notice */}
        <section className="p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>Operating Hours</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Monday through Saturday: <strong>7:00 AM – 8:00 PM EAT</strong>. Sunday:{" "}
              <strong>8:00 AM – 6:00 PM EAT</strong>. Orders booked online outside operating hours
              are scheduled for the next morning window.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span>Coverage Area (Embu Hub)</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Direct doorstep collection and delivery serving Embu Town, Majengo, Dallas, Blue Valley,
              Kangaru, Kamiu, and greater Embu County.
            </p>
          </div>
        </section>

        {/* Quick Help & FAQ Callout */}
        <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Looking for answers to common questions?</span>
            </div>
            <p className="text-xs text-slate-300 max-w-xl">
              Check our FAQ for instant answers regarding delivery windows, washing processes,
              pricing snapshots, and damaged item policies.
            </p>
          </div>

          <Link
            href="/faq"
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-white whitespace-nowrap transition min-h-[44px] flex items-center justify-center"
          >
            Visit FAQ Page
          </Link>
        </div>

        {/* Action Link */}
        <div className="text-center pt-2">
          <Link
            href="/book"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 transition min-h-[44px]"
          >
            <span>Schedule Doorstep Pickup</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
