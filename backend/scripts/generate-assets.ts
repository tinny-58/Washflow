import fs from "fs";
import path from "path";

// Generate an elegant SVG poster with gradient, soap bubbles, and water ripple graphics
const posterSvg = `
<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="40%" stop-color="#090d16" />
      <stop offset="100%" stop-color="#020617" />
    </radialGradient>
    <radialGradient id="bubble1" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="rgba(56, 189, 248, 0.4)" />
      <stop offset="50%" stop-color="rgba(14, 165, 233, 0.15)" />
      <stop offset="100%" stop-color="rgba(99, 102, 241, 0)" />
    </radialGradient>
    <radialGradient id="bubble2" cx="30%" cy="30%" r="70%">
      <stop offset="0%" stop-color="rgba(129, 140, 248, 0.35)" />
      <stop offset="60%" stop-color="rgba(79, 70, 229, 0.1)" />
      <stop offset="100%" stop-color="rgba(15, 23, 42, 0)" />
    </radialGradient>
    <filter id="blurFilter" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="60" />
    </filter>
  </defs>

  <rect width="100%" height="100%" fill="url(#bgGrad)" />

  <!-- Ambient glowing spheres representing laundry bubbles and soft water -->
  <circle cx="300" cy="400" r="350" fill="url(#bubble1)" filter="url(#blurFilter)" />
  <circle cx="1600" cy="700" r="450" fill="url(#bubble2)" filter="url(#blurFilter)" />
  <circle cx="960" cy="540" r="280" fill="rgba(14, 165, 233, 0.1)" filter="url(#blurFilter)" />

  <!-- Soft geometric ripple lines -->
  <ellipse cx="960" cy="540" rx="600" ry="250" fill="none" stroke="rgba(56, 189, 248, 0.08)" stroke-width="2" />
  <ellipse cx="960" cy="540" rx="800" ry="350" fill="none" stroke="rgba(99, 102, 241, 0.05)" stroke-width="1.5" />
</svg>
`.trim();

fs.writeFileSync(path.resolve(process.cwd(), "public/posters/laundry-poster.svg"), posterSvg);
fs.writeFileSync(path.resolve(process.cwd(), "public/posters/laundry-poster.jpg"), posterSvg);

// Minimal valid webm container byte stream to prevent 404s
const minimalWebmHeader = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01,
  0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65,
  0x62, 0x6d, 0x42, 0x87, 0x81, 0x02, 0x42, 0x85, 0x81, 0x02, 0x18, 0x53, 0x80,
  0x67, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f,
]);

fs.writeFileSync(path.resolve(process.cwd(), "public/videos/laundry-loop.webm"), minimalWebmHeader);
fs.writeFileSync(path.resolve(process.cwd(), "public/videos/laundry-loop.mp4"), minimalWebmHeader);

console.log("✅ Generated poster and video placeholder assets.");
