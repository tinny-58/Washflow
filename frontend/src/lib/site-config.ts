/**
 * WashFlow Site & Content Configuration
 *
 * NOTE: The promises below are customer-facing commitments.
 * They must strictly reflect real operational turnaround, delivery windows,
 * and packaging capabilities across Nairobi.
 */

export interface HeroContentConfig {
  headline: string;
  subline: string;
  badge?: string;
  imageAlt: string;
  turnaroundHours: number;
  coverageArea: string;
  packagingType: string;
}

export const SITE_HERO_CONFIG: HeroContentConfig = {
  // Primary customer promises:
  headline: "24h Doorstep Delivery",
  subline: "Sealed tamper-evident return across Embu within 24 hours.",
  badge: "Fast & Crisp Laundry Embu",
  imageAlt: "", // Marked decorative because adjacent text fully describes the service
  turnaroundHours: 24,
  coverageArea: "Embu",
  packagingType: "Sealed tamper-evident return packaging",
};
