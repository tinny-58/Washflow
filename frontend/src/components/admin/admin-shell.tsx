"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Bell,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { UserSession } from "@/lib/types";
import { SoundNotifierToggle } from "./sound-notifier";
import {
  AdminSidebar,
  SidebarDataProvider,
  useSidebarContext,
} from "./admin-sidebar";

interface AdminShellProps {
  session: UserSession;
  initialCollapsed?: boolean;
  children: React.ReactNode;
}

function AdminShellInner({
  session,
  initialCollapsed = false,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { summary, refresh } = useSidebarContext();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  // Dynamic breadcrumbs & page title
  const getPageInfo = () => {
    if (pathname === "/admin") return { title: "Operations Overview", section: "Overview" };
    if (pathname.startsWith("/admin/operations") || pathname.startsWith("/admin/orders"))
      return { title: "Orders & Live Map", section: "Operations" };
    if (pathname.startsWith("/admin/deliveries"))
      return { title: "Deliveries & Logistics", section: "Operations" };
    if (pathname.startsWith("/admin/transactions") || pathname.startsWith("/admin/payments"))
      return { title: "Transactions & Finance", section: "Finance" };
    if (pathname.startsWith("/admin/catalog"))
      return { title: "Service Price Catalog", section: "Finance" };
    if (pathname.startsWith("/admin/rewards"))
      return { title: "Referrals & Loyalty", section: "Customers" };
    if (pathname.startsWith("/admin/customers/traffic"))
      return { title: "Traffic & Activity", section: "Customers" };
    if (pathname.startsWith("/admin/customers"))
      return { title: "Customer Directory", section: "Customers" };
    if (pathname.startsWith("/admin/whatsapp/worker"))
      return { title: "WhatsApp Worker & Sender", section: "WhatsApp" };
    if (pathname.startsWith("/admin/whatsapp/automations"))
      return { title: "Automations & Templates", section: "WhatsApp" };
    if (pathname.startsWith("/admin/whatsapp/logs") || pathname.startsWith("/admin/messages"))
      return { title: "Message Logs & Queue", section: "WhatsApp" };
    if (pathname.startsWith("/admin/whatsapp"))
      return { title: "WhatsApp Worker", section: "WhatsApp" };
    if (pathname.startsWith("/admin/health"))
      return { title: "System Downtime & Health", section: "System" };
    return { title: "Admin Portal", section: "Console" };
  };

  const pageInfo = getPageInfo();
  const alertCount = summary?.health.openAlertsCount || 0;
  const highestSeverity = summary?.health.highestSeverity || "none";

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    router.refresh();
    window.dispatchEvent(new Event("admin-refresh"));
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-950 text-slate-100 antialiased font-sans">
      {/* 1. Admin Sidebar (Desktop Rail/Expanded + Mobile Drawer with Focus Trap) */}
      <AdminSidebar
        session={session}
        initialCollapsed={initialCollapsed}
        mobileDrawerOpen={mobileDrawerOpen}
        onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
        menuButtonRef={menuButtonRef}
      />

      {/* 2. Main Workspace Body (Slim Top Bar + Independent Scroll Body) */}
      <div className="flex-1 flex flex-col h-dvh min-w-0 overflow-hidden">
        {/* Slim Top Bar */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl shrink-0 z-30">
          {/* Left: Mobile hamburger & Breadcrumbs */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition shrink-0 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
              aria-label="Open mobile navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                <span>{pageInfo.section}</span>
                <span>/</span>
                <span className="text-white font-bold truncate">{pageInfo.title}</span>
              </div>
            </div>
          </div>

          {/* Right: Controls (Date, Sound, Refresh, Alert Bell, Profile) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Today Date Badge */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-medium">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              <span>Today</span>
            </div>

            {/* Sound Toggle */}
            <SoundNotifierToggle
              soundEnabled={soundEnabled}
              onToggleSound={() => setSoundEnabled(!soundEnabled)}
            />

            {/* Refresh Workspace */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition flex items-center justify-center focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
              title="Refresh workspace data"
              aria-label="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-sky-400" : ""}`} />
            </button>

            {/* Alert Bell with Live Realtime Count */}
            <Link
              href="/admin/health"
              className="relative min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition flex items-center justify-center focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
              title={`${alertCount} active alerts`}
              aria-label={`View system alerts (${alertCount} active)`}
            >
              <Bell className="w-4 h-4" />
              {alertCount > 0 && (
                <span
                  className={`
                    absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-white font-bold text-[10px] flex items-center justify-center font-mono
                    ${highestSeverity === "critical" ? "bg-rose-500 animate-pulse" : "bg-amber-500"}
                  `}
                >
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </Link>

            {/* User Profile Chip */}
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-white/10">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                {session.name ? session.name[0].toUpperCase() : "A"}
              </div>
              <div className="hidden xl:flex flex-col text-left">
                <span className="text-xs font-bold text-white leading-tight">
                  {session.username ? `@${session.username}` : session.name}
                </span>
                <span className="text-[10px] text-emerald-400 font-medium">Administrator</span>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content Body */}
        <main className="flex-1 overflow-y-auto min-w-0 p-4 sm:p-6 lg:p-8 scrollbar-thin scrollbar-thumb-white/10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AdminShell(props: AdminShellProps) {
  return (
    <SidebarDataProvider>
      <AdminShellInner {...props} />
    </SidebarDataProvider>
  );
}
