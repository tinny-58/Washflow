import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  Tag,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ShoppingBag,
  Layers,
  Bed,
  CreditCard,
  Truck,
  MessageSquare,
  PackageCheck,
  Info,
} from "lucide-react";
import { ServiceIllustration } from "@/components/shared/service-illustrations";

export const metadata: Metadata = {
  title: "Service Prices & Laundry Catalog | WashFlow Kenya",
  description:
    "Transparent pricing for laundry baskets, duvets, and floor mats in Nairobi. Everyday wash & fold from KES 300. Book doorstep pickup online.",
  openGraph: {
    title: "WashFlow Service Prices & Laundry Catalog | Nairobi",
    description:
      "Everyday laundry baskets from KES 300, duvets from KES 300, and floor mats from KES 300. Transparent pricing with M-Pesa verified checkout.",
    url: "/prices",
    type: "website",
  },
};

interface CatalogItem {
  id: string;
  category: string;
  variant: string;
  price: number;
  description?: string | null;
  sizeLabel?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  badge?: string | null;
  displayOrder?: number;
  categoryDescription?: string | null;
  updatedAt?: string;
}

interface CategorySummary {
  id: string;
  label: string;
  description?: string | null;
  count: number;
}

// Fallback dataset ensures static site generation / next build succeeds even if backend is offline during build
const FALLBACK_ITEMS: CatalogItem[] = [
  {
    id: "0178e6e3-8ee2-463b-8c35-786e19d7f298",
    category: "basket",
    variant: "Small Basket (Up to 7kg - Everyday Wear)",
    price: 300,
    sizeLabel: "Up to 7 kg",
    badge: "Popular",
    description: "Standard wash, dry & fold for clothes, undergarments & shirts",
    categoryDescription: "Everyday wearable clothes washed individually, tumble-dried and folded crisp.",
    displayOrder: 1,
  },
  {
    id: "c9aa0a06-7caf-47b5-be1f-28d472cf302d",
    category: "basket",
    variant: "Large Basket (Up to 15kg - Family Load)",
    price: 450,
    sizeLabel: "Up to 15 kg",
    description: "Heavy wash, dry & crisp fold for full family laundry load",
    categoryDescription: "Everyday wearable clothes washed individually, tumble-dried and folded crisp.",
    displayOrder: 2,
  },
  {
    id: "53995cd0-f32f-4302-8eb0-627f0a554dc3",
    category: "duvet",
    variant: "Single / 3x5 Duvet",
    price: 300,
    sizeLabel: "3x5 ft bed",
    description: "Deep sanitary fiber wash and tumble-dry for 3x5 beds",
    categoryDescription: "Thermal fiber wash and anti-allergen steam sanitization for all bed sizes.",
    displayOrder: 3,
  },
  {
    id: "d752b391-1e24-424b-bb69-6f1b0840ca95",
    category: "duvet",
    variant: "Medium / 4x6 Duvet",
    price: 450,
    sizeLabel: "4x6 ft bed",
    badge: "Popular",
    description: "Deep fiber wash, stain spot-treatment, anti-allergen steam",
    categoryDescription: "Thermal fiber wash and anti-allergen steam sanitization for all bed sizes.",
    displayOrder: 4,
  },
  {
    id: "41ed3361-f0bf-439e-8bb1-f91e0c5b6492",
    category: "duvet",
    variant: "Queen / 5x6 Duvet",
    price: 550,
    sizeLabel: "5x6 ft bed",
    description: "Large capacity drum wash and plush softness rinse",
    categoryDescription: "Thermal fiber wash and anti-allergen steam sanitization for all bed sizes.",
    displayOrder: 5,
  },
  {
    id: "062dd0bc-0f4e-4d86-8c7e-7126b48d2af6",
    category: "duvet",
    variant: "King / 6x6 Duvet",
    price: 650,
    sizeLabel: "6x6 ft bed",
    description: "Extra-large jumbo wash and dual-cycle warm air fluff",
    categoryDescription: "Thermal fiber wash and anti-allergen steam sanitization for all bed sizes.",
    displayOrder: 6,
  },
  {
    id: "686258fa-7783-41d4-92f4-d72334629fa1",
    category: "mat",
    variant: "Small Doormat / Bath Mat",
    price: 300,
    sizeLabel: "Up to 2x3 ft",
    description: "High-pressure scrub, disinfection, and quick-dry",
    categoryDescription: "Rotary shampoo and power extraction for entrance, bathroom and area rugs.",
    displayOrder: 7,
  },
  {
    id: "5eb4927d-c3a4-4736-bf03-0d8b7be35f35",
    category: "mat",
    variant: "Medium Floor Mat (Up to 4x4 ft)",
    price: 450,
    sizeLabel: "Up to 4x4 ft",
    description: "Deep carpet shampoo, fiber conditioning, odor neutralizer",
    categoryDescription: "Rotary shampoo and power extraction for entrance, bathroom and area rugs.",
    displayOrder: 8,
  },
  {
    id: "98e1df95-83ac-4464-bdfd-d709dce853b3",
    category: "mat",
    variant: "Large Area Mat (Up to 6x9 ft)",
    price: 600,
    sizeLabel: "Up to 6x9 ft",
    description: "Heavy-duty power wash, rinse, vacuum extraction & grooming",
    categoryDescription: "Rotary shampoo and power extraction for entrance, bathroom and area rugs.",
    displayOrder: 9,
  },
];

async function getLiveCatalog(): Promise<{
  items: CatalogItem[];
  categories: CategorySummary[];
  lastUpdated: string;
  catalogVersion: number;
}> {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";

  try {
    const res = await fetch(`${backendUrl}/api/catalog`, {
      next: { tags: ["catalog"], revalidate: 60 },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        return {
          items: data.items,
          categories: data.categories || [],
          lastUpdated: data.lastUpdated || new Date().toISOString(),
          catalogVersion: data.catalogVersion || 1,
        };
      }
    }
  } catch (err) {
    console.warn("Live catalog fetch skipped or backend offline during build; using fallback.", err);
  }

  // Derive categories from fallback
  const catMap = new Map<string, CategorySummary>();
  for (const item of FALLBACK_ITEMS) {
    if (!catMap.has(item.category)) {
      let label = item.category.charAt(0).toUpperCase() + item.category.slice(1);
      if (item.category === "basket") label = "Baskets (Everyday)";
      else if (item.category === "duvet") label = "Duvets & Bedding";
      else if (item.category === "mat") label = "Floor & Area Mats";
      else if (!label.endsWith("s")) label += "s";

      catMap.set(item.category, {
        id: item.category,
        label,
        description: item.categoryDescription,
        count: 1,
      });
    } else {
      catMap.get(item.category)!.count += 1;
    }
  }

  return {
    items: FALLBACK_ITEMS,
    categories: Array.from(catMap.values()),
    lastUpdated: new Date().toISOString(),
    catalogVersion: 1,
  };
}

export default async function PricesPage() {
  const { items, categories, lastUpdated, catalogVersion } = await getLiveCatalog();

  const formattedUpdateDate = new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(new Date(lastUpdated));

  // Dynamic JSON-LD structured data generated directly from live catalog items
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "WashFlow Kenya Laundry Price Catalog",
    description: "Doorstep laundry prices for everyday baskets, duvets, and floor mats in Nairobi.",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: item.variant,
        description: item.description,
        offers: {
          "@type": "Offer",
          price: item.price,
          priceCurrency: "KES",
          availability: "https://schema.org/InStock",
        },
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="w-full flex-1 pb-16">
        {/* HERO SECTION */}
        <section className="relative overflow-hidden pt-10 pb-12 sm:pt-14 sm:pb-16 border-b border-white/10 bg-gradient-to-b from-slate-900/60 via-slate-950/80 to-slate-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-400/30 text-sky-300 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Single Source of Truth Catalog</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
              Transparent, Unit-Based Laundry Pricing
            </h1>

            <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-300 leading-relaxed font-medium">
              Every garment and textile is washed individually in sealed, sanitized drums. No hidden scales, no mixed laundry, and instant booking from your phone.
            </p>

            {/* Informational Price Note & Version Timestamp */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>Prices last updated: <strong>{formattedUpdateDate}</strong></span>
              </span>
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                <Info className="w-3.5 h-3.5 text-emerald-400" />
                <span>Final order price confirmed securely at booking</span>
              </span>
            </div>
          </div>
        </section>

        {/* DYNAMIC CATEGORY TABS / ANCHORS */}
        <section className="sticky top-16 sm:top-18 z-30 w-full bg-slate-950/90 backdrop-blur-xl border-b border-white/10 py-3">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 hidden sm:inline">
                Categories:
              </span>
              {categories.map((cat) => (
                <a
                  key={cat.id}
                  href={`#category-${cat.id}`}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-sky-500/20 hover:text-sky-300 border border-white/10 hover:border-sky-400/40 text-xs font-bold text-slate-200 transition-all shrink-0 flex items-center gap-2"
                >
                  {cat.id === "basket" && <ShoppingBag className="w-3.5 h-3.5 text-sky-400" />}
                  {cat.id === "duvet" && <Bed className="w-3.5 h-3.5 text-indigo-400" />}
                  {cat.id === "mat" && <Layers className="w-3.5 h-3.5 text-teal-400" />}
                  {!["basket", "duvet", "mat"].includes(cat.id) && <Tag className="w-3.5 h-3.5 text-amber-400" />}
                  <span>{cat.label}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300">
                    {cat.count}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* CATALOG SECTIONS */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-16">
          {categories.map((category) => {
            const categoryItems = items.filter(
              (item) => item.category.toLowerCase() === category.id.toLowerCase()
            );

            return (
              <section
                key={category.id}
                id={`category-${category.id}`}
                className="scroll-mt-36 space-y-6 relative"
              >
                {/* Fallback anchor for plural category shortcuts */}
                <span
                  id={category.id === "basket" ? "baskets" : category.id === "duvet" ? "duvets" : category.id === "mat" ? "mats" : undefined}
                  className="absolute -top-36 invisible pointer-events-none"
                  aria-hidden="true"
                />
                {/* Category Header */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-4 border-b border-white/10">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
                      <span>{category.label}</span>
                    </h2>
                    {category.description && (
                      <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-medium">
                        {category.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-sky-400 font-semibold shrink-0">
                    {categoryItems.length} {categoryItems.length === 1 ? "tier" : "sizes"} available
                  </span>
                </div>

                {/* Item Cards Grid in Admin-Defined Display Order */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="group relative rounded-3xl bg-slate-900/70 border border-white/15 p-6 shadow-xl backdrop-blur-md hover:border-sky-400/50 hover:bg-slate-900/90 transition-all duration-300 flex flex-col justify-between space-y-5"
                    >
                      {/* Optional Badge */}
                      {item.badge && (
                        <div className="absolute top-4 right-4 z-10 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-black uppercase tracking-wider shadow-md">
                          {item.badge}
                        </div>
                      )}

                      <div className="space-y-4">
                        {/* Visual: Uploaded Image or Code-Drawn Brand Illustration */}
                        <div className="relative w-full h-44 rounded-2xl bg-slate-950/80 border border-white/10 overflow-hidden flex items-center justify-center p-3 group-hover:scale-[1.02] transition-transform duration-300">
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.imageAlt || item.variant}
                              fill
                              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                              className="object-cover object-center"
                              loading="lazy"
                            />
                          ) : (
                            <ServiceIllustration
                              category={item.category}
                              variant={item.variant}
                              className="w-full h-full max-h-36 drop-shadow-md"
                            />
                          )}
                        </div>

                        {/* Title & Size Dimensions */}
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
                              {item.variant}
                            </h3>
                          </div>

                          {item.sizeLabel && (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-sky-300 text-[11px] font-semibold">
                              <span>{item.sizeLabel}</span>
                            </div>
                          )}

                          {item.description && (
                            <p className="text-xs text-slate-300 leading-relaxed pt-1">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Price & Booking Call to Action */}
                      <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            Unit Price
                          </p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white">
                              KES {item.price.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <Link
                          href={`/book?item=${item.id}&cat=${item.category}&ver=${catalogVersion}`}
                          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs tracking-wide shadow-md shadow-sky-500/20 flex items-center gap-1.5 transition active:scale-95"
                        >
                          <span>Book Now</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {/* "HOW IT WORKS" VISUAL STEPPER */}
          <section className="pt-10 border-t border-white/10 space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                How WashFlow Works
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
                Hassle-free doorstep service from pickup to delivery.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 relative">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <h3 className="text-sm font-bold text-white">1. Book Online</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Select your laundry items and choose your preferred pickup window in under 30 seconds.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 relative">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">
                  2
                </div>
                <h3 className="text-sm font-bold text-white">2. Doorstep Pickup</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  A verified WashFlow rider arrives at your doorstep or reception to collect your laundry.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 relative">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-sm">
                  3
                </div>
                <h3 className="text-sm font-bold text-white">3. Hygienic Wash</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Garments are sorted and washed individually in sanitized drums, tumble-dried, and folded crisp.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 relative">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                  4
                </div>
                <h3 className="text-sm font-bold text-white">4. Fresh Delivery</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Returned clean and fresh to your doorstep. Inspect your items and pay securely via M-Pesa.
                </p>
              </div>
            </div>
          </section>

          {/* VERIFIED TRUST CUES */}
          <section className="p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-white/10 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>The WashFlow Service Standards</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="flex items-start gap-3">
                <CreditCard className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-white">Secure M-Pesa Verification</p>
                  <p className="text-slate-400 mt-0.5">Pay conveniently on delivery or via instant STK push.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MessageSquare className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-white">WhatsApp Notifications</p>
                  <p className="text-slate-400 mt-0.5">Receive real-time automated updates at each care stage.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Truck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-white">Live Courier Tracking</p>
                  <p className="text-slate-400 mt-0.5">Track your order progress and rider arrival in real time.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <PackageCheck className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-white">Individual Load Care</p>
                  <p className="text-slate-400 mt-0.5">Loads are never mixed across households. Always separate.</p>
                </div>
              </div>
            </div>
          </section>

          {/* FOOTER CALL TO ACTION */}
          <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-sky-900/40 via-indigo-900/30 to-slate-900/80 border border-sky-400/30 text-center space-y-4">
            <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Ready for Clean, Fresh Laundry?
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto">
              Book your collection now. Select your items and pick a window in seconds.
            </p>
            <div className="pt-2">
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-sky-500/25 transition active:scale-95"
              >
                <span>Schedule a Doorstep Pickup</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
