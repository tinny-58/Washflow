import React from "react";

export function ServiceIllustration({
  category,
  variant,
  className = "w-full h-full",
}: {
  category: string;
  variant?: string;
  className?: string;
}) {
  const cat = category.toLowerCase();

  if (cat.includes("basket") || cat.includes("wear") || cat.includes("clothe")) {
    return (
      <svg
        viewBox="0 0 200 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="basketGrad" x1="20" y1="50" x2="180" y2="150" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0284c7" />
            <stop offset="1" stopColor="#4338ca" />
          </linearGradient>
          <linearGradient id="foldGrad1" x1="40" y1="30" x2="120" y2="70" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" />
            <stop offset="1" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="foldGrad2" x1="80" y1="20" x2="160" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#818cf8" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
        </defs>

        {/* Laundry Basket Shadow */}
        <ellipse cx="100" cy="148" rx="60" ry="8" fill="#020617" opacity="0.6" />

        {/* Folded Laundry Layers peeking out */}
        <path
          d="M50 65 C50 45, 90 45, 105 52 C120 40, 155 42, 155 65 Z"
          fill="url(#foldGrad2)"
          opacity="0.9"
        />
        <rect x="58" y="52" width="84" height="18" rx="7" fill="url(#foldGrad1)" />
        <rect x="70" y="42" width="60" height="14" rx="6" fill="#bae6fd" opacity="0.95" />

        {/* Basket Body */}
        <path
          d="M38 65 L52 140 C53 145, 57 148, 62 148 L138 148 C143 148, 147 145, 148 140 L162 65 Z"
          fill="url(#basketGrad)"
          stroke="#38bdf8"
          strokeWidth="2.5"
        />

        {/* Basket Ventilation Vents */}
        <g stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.5">
          <line x1="60" y1="85" x2="63" y2="105" />
          <line x1="80" y1="85" x2="82" y2="110" />
          <line x1="100" y1="85" x2="100" y2="112" />
          <line x1="120" y1="85" x2="118" y2="110" />
          <line x1="140" y1="85" x2="137" y2="105" />

          <line x1="68" y1="118" x2="71" y2="135" />
          <line x1="88" y1="120" x2="90" y2="138" />
          <line x1="108" y1="120" x2="107" y2="138" />
          <line x1="128" y1="118" x2="126" y2="135" />
        </g>

        {/* Basket Rim */}
        <rect x="34" y="62" width="132" height="7" rx="3.5" fill="#38bdf8" />

        {/* Freshness Sparkles */}
        <circle cx="165" cy="40" r="3" fill="#38bdf8" />
        <path d="M165 32 L165 48 M157 40 L173 40" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
        <circle cx="35" cy="48" r="2" fill="#818cf8" />
      </svg>
    );
  }

  if (cat.includes("duvet") || cat.includes("bed") || cat.includes("blanket")) {
    return (
      <svg
        viewBox="0 0 200 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="duvetGrad" x1="30" y1="40" x2="170" y2="140" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" />
            <stop offset="0.5" stopColor="#0284c7" />
            <stop offset="1" stopColor="#312e81" />
          </linearGradient>
          <linearGradient id="cloudGrad" x1="60" y1="30" x2="140" y2="90" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#bae6fd" />
          </linearGradient>
        </defs>

        {/* Shadow */}
        <ellipse cx="100" cy="145" rx="65" ry="8" fill="#020617" opacity="0.6" />

        {/* Plush Quilted Duvet Roll */}
        <rect
          x="36"
          y="68"
          width="128"
          height="68"
          rx="22"
          fill="url(#duvetGrad)"
          stroke="#38bdf8"
          strokeWidth="2.5"
        />

        {/* Quilted Stitch Pattern */}
        <g stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6">
          <line x1="65" y1="68" x2="65" y2="136" />
          <line x1="100" y1="68" x2="100" y2="136" />
          <line x1="135" y1="68" x2="135" y2="136" />
          <line x1="36" y1="102" x2="164" y2="102" />
        </g>

        {/* Soft Fluffy Top Fold */}
        <path
          d="M48 68 C48 48, 80 44, 100 52 C120 44, 152 48, 152 68 Z"
          fill="url(#cloudGrad)"
          stroke="#7dd3fc"
          strokeWidth="2"
        />

        {/* Feather & Steam Accents */}
        <path
          d="M92 28 C96 22, 104 22, 108 28 C112 34, 100 42, 100 42 C100 42, 88 34, 92 28 Z"
          fill="#38bdf8"
          opacity="0.8"
        />
        <circle cx="160" cy="50" r="2.5" fill="#38bdf8" />
        <circle cx="42" cy="56" r="2" fill="#7dd3fc" />
      </svg>
    );
  }

  // Default: Floor & Area Mat / Rug
  return (
    <svg
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="matGrad" x1="30" y1="50" x2="170" y2="130" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0f766e" />
          <stop offset="0.6" stopColor="#0284c7" />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
      </defs>

      {/* Floor Shadow */}
      <ellipse cx="100" cy="144" rx="72" ry="9" fill="#020617" opacity="0.6" />

      {/* Isometric/Perspective Mat */}
      <polygon
        points="52,60 148,60 168,136 32,136"
        fill="url(#matGrad)"
        stroke="#2dd4bf"
        strokeWidth="2.5"
      />

      {/* Decorative Texture Lines */}
      <polygon
        points="60,70 140,70 156,126 44,126"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        opacity="0.7"
      />

      {/* Mat Ribs */}
      <g stroke="#ffffff" strokeWidth="1.5" opacity="0.35">
        <line x1="56" y1="84" x2="144" y2="84" />
        <line x1="50" y1="98" x2="150" y2="98" />
        <line x1="44" y1="112" x2="156" y2="112" />
      </g>

      {/* Clean Fringes */}
      <g stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round">
        <line x1="32" y1="136" x2="28" y2="142" />
        <line x1="46" y1="136" x2="44" y2="143" />
        <line x1="60" y1="136" x2="59" y2="144" />
        <line x1="140" y1="136" x2="141" y2="144" />
        <line x1="154" y1="136" x2="156" y2="143" />
        <line x1="168" y1="136" x2="172" y2="142" />
      </g>

      {/* Rotary Clean Bubbles */}
      <circle cx="160" cy="45" r="5" fill="#38bdf8" opacity="0.8" />
      <circle cx="170" cy="38" r="3" fill="#2dd4bf" opacity="0.9" />
      <circle cx="38" cy="52" r="3" fill="#38bdf8" opacity="0.7" />
    </svg>
  );
}
