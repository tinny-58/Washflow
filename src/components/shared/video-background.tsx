"use client";

import React, { useEffect, useState } from "react";

export function VideoBackground() {
  const [shouldPlayVideo, setShouldPlayVideo] = useState(true);

  useEffect(() => {
    // 1. Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // 2. Check Save-Data header / connection api
    const nav = navigator as unknown as {
      connection?: { saveData?: boolean };
    };
    const saveDataEnabled = nav.connection?.saveData === true;

    if (prefersReducedMotion || saveDataEnabled) {
      setShouldPlayVideo(false);
    }
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-slate-950">
      {/* Fallback & Poster CSS Gradient Layer with animated bubbles / soft water shimmer */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 30%, rgba(14, 165, 233, 0.25) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(99, 102, 241, 0.2) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.95) 0%, #030712 100%)
          `,
        }}
      />

      {/* Video Loop Layer */}
      {shouldPlayVideo && (
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/posters/laundry-poster.jpg"
          className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-screen scale-105 filter blur-[1px]"
        >
          <source src="/videos/laundry-loop.webm" type="video/webm" />
          <source src="/videos/laundry-loop.mp4" type="video/mp4" />
        </video>
      )}

      {/* Dark Frosted Overlay Gradient for strict WCAG AA contrast */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/65 to-slate-950/90 backdrop-blur-[2px]" />
    </div>
  );
}
