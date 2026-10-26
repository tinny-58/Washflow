"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AuthCard } from "@/components/shared/auth-card";
import { HeroCard } from "@/components/shared/hero-card";
import { RefreshCw } from "lucide-react";

const ClientDashboardView = dynamic(
  () =>
    import("@/components/dashboard/client-dashboard-view").then(
      (mod) => mod.ClientDashboardView
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
      </div>
    ),
  }
);

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [urlView, setUrlView] = useState<any>(() => {
    if (typeof window !== "undefined") {
      const match = window.location.search.match(/[?&]view=([^&]+)/);
      return match ? match[1] : undefined;
    }
    return undefined;
  });
  const [checkingAuth, setCheckingAuth] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.location.search.includes("view=")) {
      return false;
    }
    return true;
  });

  const checkSession = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if ((data.authenticated || data.success) && data.user) {
        if (data.user.role === "admin") {
          window.location.href = "/admin";
          return;
        }
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  // While checking auth status
  if (checkingAuth) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh]">
        <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
      </div>
    );
  }

  // 1. WHEN LOGGED IN: Client finds the real page — the rich Dashboard page!
  if (isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col w-full h-full overflow-hidden">
        <ClientDashboardView onLogout={() => setIsAuthenticated(false)} />
      </div>
    );
  }

  // 2. WHEN NOT LOGGED IN: Single non-scrollable page with full height cards (>= 720px height)
  return (
    <div
      className="hero-section flex-1 w-full min-h-[calc(100vh-var(--nav-h))] min-h-[calc(100dvh-var(--nav-h))] flex flex-col justify-center px-4 sm:px-6 lg:px-8 xl:px-10 overflow-x-hidden overflow-y-auto box-border"
      style={{
        paddingTop: "var(--hero-gap)",
        paddingBottom: "var(--hero-gap)",
      }}
    >
      <div
        className="hero-grid w-full max-w-[1700px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(470px,0.85fr)] xl:grid-cols-[minmax(0,1.35fr)_minmax(470px,0.85fr)] gap-6 lg:gap-8 xl:gap-10 items-stretch my-auto"
        style={{
          minHeight: "var(--hero-card-min-h)",
          height: "100%",
        }}
      >
        {/* 1. LEFT HERO CARD: 24h Doorstep Delivery with full-bleed photo background */}
        <div className="w-full h-full flex flex-col justify-stretch">
          <HeroCard />
        </div>

        {/* 2. RIGHT AUTH CARD: Sign-in & Registration card, vertically centered in the grid row */}
        <div
          id="auth-section"
          className="w-full flex flex-col items-center justify-center self-center"
        >
          <AuthCard
            key={urlView || "default"}
            initialView={urlView}
            defaultMode="signin"
            onSuccess={() => setIsAuthenticated(true)}
          />
        </div>
      </div>
    </div>
  );
}
