import type { Metadata } from "next";
import "./globals.css";
import { VideoBackground } from "@/components/shared/video-background";
import { Navbar } from "@/components/shared/navbar";

export const metadata: Metadata = {
  title: "WashFlow | Fast, Crisp & Professional Laundry Service",
  description:
    "Scan, book in under 30 seconds, and get your clothes, duvets, and mats fresh and crisply delivered to your doorstep.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-sky-500 selection:text-white flex flex-col font-sans">
        {/* Full-bleed looping video background with WCAG AA frosted overlay */}
        <VideoBackground />

        {/* Global Navigation */}
        <Navbar />

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
