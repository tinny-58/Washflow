import React from "react";

export function VideoBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-slate-950 select-none">
      {/* High-Resolution Static Laundry Specialist Visual */}
      <div
        className="absolute inset-0 bg-cover bg-[center_top] sm:bg-[60%_center] lg:bg-[65%_center] transition-all duration-1000 animate-ken-burns scale-105 opacity-80 filter brightness-90 contrast-105"
        style={{
          backgroundImage: `url('/posters/kenya-laundry-worker.jpg')`,
        }}
      />

      {/* Dark Linear Gradient Overlays - makes the cards & text prominently and sharply visible */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/70 to-slate-950/90" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/60 to-slate-950/90" />

      {/* Subtle Fresh Laundry Glow Orbs */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
}
