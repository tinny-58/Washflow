import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import QRCode from "qrcode";
import fs from "fs";
import path from "path";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const OUTPUT_DIR = path.resolve(process.cwd(), "public/qrcodes");

interface PosterLocation {
  id: string;
  name: string;
  description: string;
}

const defaultPosters: PosterLocation[] = [
  {
    id: "poster-nairobi-cbd",
    name: "Nairobi CBD - Moi Avenue Hub",
    description: "Main commercial street poster near bus terminal",
  },
  {
    id: "poster-westlands",
    name: "Westlands - Sarit Centre Vicinity",
    description: "Apartment complex bulletin and commercial hub",
  },
  {
    id: "poster-kilimani",
    name: "Kilimani - Yaya Centre Area",
    description: "High-density residential and expat apartments",
  },
  {
    id: "poster-kileleshwa",
    name: "Kileleshwa - Kasuku Centre",
    description: "Residential residential estate entry gates",
  },
  {
    id: "poster-ngong-rd",
    name: "Ngong Road - Junction Mall",
    description: "Suburban apartment clusters and gym lobby",
  },
  {
    id: "poster-thika-rd",
    name: "Thika Road - Garden City",
    description: "Student hostels and modern residential blocks",
  },
  {
    id: "poster-roysambu",
    name: "Roysambu - TRM Walkway",
    description: "High foot-traffic pedestrian overpass",
  },
  {
    id: "poster-south-b",
    name: "South B - Plainsview Gate",
    description: "Neighborhood estate gate and laundromat alternative poster",
  },
];

async function generateQRCodes() {
  console.log("📸 Generating WashFlow Poster QR Codes...\n");
  console.log(`Base URL: ${APP_URL}`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const manifest: {
    generatedAt: string;
    posters: { id: string; name: string; url: string; svgFile: string; pngFile: string }[];
  } = {
    generatedAt: new Date().toISOString(),
    posters: [],
  };

  for (const poster of defaultPosters) {
    const targetUrl = `${APP_URL}/book?src=${poster.id}`;
    const svgPath = path.join(OUTPUT_DIR, `${poster.id}.svg`);
    const pngPath = path.join(OUTPUT_DIR, `${poster.id}.png`);

    // Generate high-resolution SVG
    await QRCode.toFile(svgPath, targetUrl, {
      type: "svg",
      width: 600,
      margin: 2,
      color: {
        dark: "#0f172a", // Slate 900
        light: "#ffffff",
      },
    });

    // Generate PNG
    await QRCode.toFile(pngPath, targetUrl, {
      type: "png",
      width: 600,
      margin: 2,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });

    manifest.posters.push({
      id: poster.id,
      name: poster.name,
      url: targetUrl,
      svgFile: `/qrcodes/${poster.id}.svg`,
      pngFile: `/qrcodes/${poster.id}.png`,
    });

    console.log(`✅ [${poster.id}] -> ${targetUrl}`);
    console.log(`   Location: ${poster.name}`);
    console.log(`   Files: ${poster.id}.svg, ${poster.id}.png\n`);
  }

  // Save manifest JSON
  const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`🎉 Successfully generated ${defaultPosters.length} poster QR codes in:`);
  console.log(`   ${OUTPUT_DIR}`);
  console.log(`   Manifest saved to: ${manifestPath}`);
}

generateQRCodes().catch((err) => {
  console.error("❌ Failed to generate QR codes:", err);
  process.exit(1);
});
