import type { Metadata, Viewport } from "next";
import "./globals.css";
import { VideoBackground } from "@/components/shared/video-background";
import { Navbar } from "@/components/shared/navbar";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://washflow.co.ke"),
  title: {
    default: "WashFlow Kenya | Fast, Crisp & Professional Laundry Service",
    template: "%s | WashFlow Kenya",
  },
  description:
    "Professional doorstep laundry, duvet, and floor mat cleaning in Nairobi. Transparent catalog pricing, secure M-Pesa payments, and live order tracking.",
  openGraph: {
    title: "WashFlow Kenya | Professional Doorstep Laundry Service",
    description:
      "Everyday laundry baskets, duvets, and area mats washed, sanitized, and delivered fresh across Nairobi.",
    url: "/",
    siteName: "WashFlow Kenya",
    locale: "en_KE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WashFlow Kenya | Professional Doorstep Laundry",
    description: "Doorstep pickup and delivery for everyday baskets, duvets, and mats.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-sky-500 selection:text-white flex flex-col font-sans">
        {/* Full-bleed dark gradient background visual */}
        <VideoBackground />

        {/* Global Navigation */}
        <Navbar />

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-h-0">{children}</main>
      </body>
    </html>
  );
}
