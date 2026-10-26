"use client";

import React, { useState, useEffect, useRef } from "react";

interface SlideData {
  id: number;
  type: "image" | "video";
  title: string;
  subtitle: string;
  mediaSrc: string;
  poster?: string;
  secondaryVideo?: string;
}

// 4 Realistic Kenyan Service Photos + 1 Video Summary showing washing & street delivery
const CAROUSEL_SLIDES: SlideData[] = [
  {
    id: 1,
    type: "image",
    title: "Commercial Wash & Care",
    subtitle: "Gentle sorting, eco-detergents & folded crisp.",
    mediaSrc: "/images/services/service-wash-fold.jpg",
  },
  {
    id: 2,
    type: "image",
    title: "High-Heat Steam Pressing",
    subtitle: "Executive wrinkle-free steam finish on hangers.",
    mediaSrc: "/images/services/service-steam-iron.jpg",
  },
  {
    id: 3,
    type: "image",
    title: "Deep Mat & Carpet Wash",
    subtitle: "Rotary foam mud & stain extraction for home & vehicle mats.",
    mediaSrc: "/images/services/service-mat-carpet.jpg",
  },
  {
    id: 4,
    type: "image",
    title: "24h Doorstep Delivery",
    subtitle: "Sealed tamper-evident return across Nairobi within 24 hours.",
    mediaSrc: "/images/services/service-fast-delivery.png",
  },
  {
    id: 5,
    type: "video",
    title: "Washing & Street Delivery in Motion",
    subtitle: "From commercial washing & steam pressing to express delivery across Nairobi.",
    mediaSrc: "/videos/quick-wash-press.mp4",
    secondaryVideo: "/videos/street-cruising-delivery.mp4",
    poster: "/posters/kenya-laundry-worker.jpg",
  },
];

export function LandingCarousel() {
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [videoScene, setVideoScene] = useState<"wash" | "delivery">("wash");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const current = CAROUSEL_SLIDES[currentSlide];

  // Auto-loop continuously without stopping
  useEffect(() => {
    // 5.5s for photo slides, 9s for the combined video summary (washing + street delivery)
    const duration = current.type === "video" ? 9500 : 5500;

    // If on video slide, split into 2 scenes: washing (first half) then street delivery (second half)
    let sceneTimer: NodeJS.Timeout | null = null;
    if (current.type === "video") {
      setVideoScene("wash");
      sceneTimer = setTimeout(() => {
        setVideoScene("delivery");
      }, 4800);
    }

    const nextTimer = setTimeout(() => {
      setCurrentSlide((curr) => (curr + 1) % CAROUSEL_SLIDES.length);
    }, duration);

    return () => {
      clearTimeout(nextTimer);
      if (sceneTimer) clearTimeout(sceneTimer);
    };
  }, [currentSlide, current.type]);

  // Sync video element when looping into slide 5 or changing scenes
  useEffect(() => {
    if (current.type === "video" && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [currentSlide, current.type, videoScene]);

  return (
    <div className="relative w-full h-full min-h-0 rounded-3xl sm:rounded-[2.5rem] overflow-hidden border border-white/20 shadow-2xl bg-slate-950/70 backdrop-blur-xl flex flex-col justify-end p-5 sm:p-7 lg:p-8 transition-all select-none">
      {/* 1. VISUAL LAYER: High-Resolution Realistic Service Photo OR Video (Washing & Street Delivery) */}
      {current.type === "image" ? (
        <img
          key={current.mediaSrc}
          src={current.mediaSrc}
          alt={current.title}
          className="absolute inset-0 w-full h-full object-cover object-center transition-all duration-1000 animate-ken-burns scale-105 -z-20 opacity-90"
        />
      ) : (
        <video
          ref={videoRef}
          key={videoScene === "wash" ? current.mediaSrc : current.secondaryVideo}
          autoPlay
          muted
          loop
          playsInline
          poster={current.poster}
          className="absolute inset-0 w-full h-full object-cover object-center -z-20 opacity-90 transition-opacity duration-700"
        >
          <source
            src={videoScene === "wash" ? current.mediaSrc : current.secondaryVideo}
            type="video/mp4"
          />
        </video>
      )}

      {/* Subtle bottom-weighted dark gradient - leaves image open & clear, while keeping text sharp */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/30 to-transparent -z-10" />

      {/* 2. MINIMALIST TYPOGRAPHY AT THE BOTTOM: Lets the Image & Video Visualize the Service */}
      <div className="space-y-1.5 pb-1 max-w-xl z-10">
        {current.type === "video" && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-semibold backdrop-blur-md mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>
              {videoScene === "wash"
                ? "Process 1: High-Speed Commercial Wash"
                : "Process 2: Street Delivery Cruising"}
            </span>
          </div>
        )}

        <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-2xl">
          {current.title}
        </h2>
        <p className="text-sm sm:text-base lg:text-lg text-slate-200/90 font-medium leading-relaxed drop-shadow-lg">
          {current.subtitle}
        </p>
      </div>
    </div>
  );
}
