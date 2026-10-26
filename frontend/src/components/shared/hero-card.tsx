"use client";

import React from "react";
import Image from "next/image";
import { SITE_HERO_CONFIG } from "@/lib/site-config";

// Fast & crisp base64 blur placeholder for instant pre-render
const BLUR_DATA_URL =
  "data:image/webp;base64,UklGRp4AAABXRUJQVlA4IJIAAADQAwCdASoQABoAPxFysFAsJqSisAgBg";

export function HeroCard() {
  return (
    <div className="hero-card relative w-full h-full rounded-3xl sm:rounded-[2.5rem] overflow-hidden border border-white/15 shadow-2xl bg-slate-950/80 backdrop-blur-xl flex flex-col justify-end p-6 sm:p-8 lg:p-10 xl:p-12 select-none">
      {/* 1. FULL-BLEED REALISTIC SERVICE PHOTO */}
      <Image
        src="/images/services/service-fast-delivery.webp"
        alt={SITE_HERO_CONFIG.imageAlt}
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 60vw"
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        className="object-cover object-[center_78%] transition-transform duration-700"
      />

      {/* 2. DARK GRADIENT OVERLAY - ENSURES WCAG AA (>= 4.5:1) CONTRAST OVER IMAGE */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/45 to-slate-950/20 pointer-events-none"
        aria-hidden="true"
      />

      {/* Subtle brand glow accent */}
      <div
        className="absolute -bottom-10 -left-10 w-80 h-80 rounded-full bg-sky-500/15 blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      {/* 3. HEADLINE & SUBLINE ANCHORED AT BOTTOM-LEFT WITH GENEROUS PADDING */}
      <div className="relative z-10 max-w-xl space-y-2">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-2xl">
          {SITE_HERO_CONFIG.headline}
        </h2>
        <p className="text-sm sm:text-base lg:text-lg text-slate-200/95 font-medium leading-relaxed drop-shadow-lg">
          {SITE_HERO_CONFIG.subline}
        </p>
      </div>
    </div>
  );
}
