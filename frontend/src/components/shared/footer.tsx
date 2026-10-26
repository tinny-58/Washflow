"use client";

import React from "react";
import Link from "next/link";
import { Waves, ShieldCheck } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-slate-950/90 border-t border-white/10 backdrop-blur-xl mt-auto z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand Info */}
          <div className="space-y-3">
            <Link href="/" className="inline-flex items-center gap-2.5 group min-h-[44px]">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 via-sky-600 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform">
                <Waves className="w-5 h-5 text-white" />
              </div>
              <span className="font-black text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-sky-300 bg-clip-text text-transparent">
                OTF Washflow
              </span>
            </Link>
            <p className="text-xs text-slate-300 leading-relaxed font-normal">
              Fast, fresh & hygienic doorstep laundry care across Embu. Everyday clothes, bedding duvets & floor mats.
            </p>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold pt-1 min-h-[44px]">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Secure M-Pesa verified transactions</span>
            </div>
          </div>

          {/* Service Links */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Services & Pricing</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              <li>
                <Link href="/prices" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Live Price Catalog
                </Link>
              </li>
              <li>
                <Link href="/prices#category-basket" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Everyday Laundry Baskets
                </Link>
              </li>
              <li>
                <Link href="/prices#category-duvet" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Bedding & Duvets
                </Link>
              </li>
              <li>
                <Link href="/prices#category-mat" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Floor & Area Mats
                </Link>
              </li>
              <li>
                <Link href="/book" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Book Doorstep Pickup
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Links */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Company</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              <li>
                <Link href="/about" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  About WashFlow
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Frequently Asked Questions (FAQ)
                </Link>
              </li>
              <li>
                <Link href="/about#loyalty" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Rewards & Referral Program
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Contact & Support
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Pages */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Legal & Transparency</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              <li>
                <Link href="/terms" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Privacy Policy & Data Rights
                </Link>
              </li>
              <li>
                <Link href="/terms#rewards" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Program Rules & Vouchers
                </Link>
              </li>
              <li>
                <Link href="/terms#claims" className="hover:text-sky-300 transition-colors inline-flex items-center min-h-[44px] py-1">
                  Damaged / Lost Items Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© {currentYear} OTF Washflow. All rights reserved. Final order pricing confirmed at booking.</p>
          <div className="flex flex-wrap items-center gap-4 text-slate-300">
            <Link href="/terms" className="hover:text-white transition-colors min-h-[44px] inline-flex items-center">Terms</Link>
            <span className="text-slate-600">•</span>
            <Link href="/privacy" className="hover:text-white transition-colors min-h-[44px] inline-flex items-center">Privacy</Link>
            <span className="text-slate-600">•</span>
            <Link href="/faq" className="hover:text-white transition-colors min-h-[44px] inline-flex items-center">FAQ</Link>
            <span className="text-slate-600">•</span>
            <Link href="/contact" className="hover:text-white transition-colors min-h-[44px] inline-flex items-center">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
