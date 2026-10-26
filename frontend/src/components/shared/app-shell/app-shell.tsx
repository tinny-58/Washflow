"use client";

import React, { useState, useRef } from "react";
import { UserSession } from "@/lib/types";
import { Sidebar, NavGroup } from "./sidebar";
import { TopBar } from "./top-bar";

export interface AppShellProps {
  session: UserSession;
  title?: string;
  subtitle?: string;
  groups: NavGroup[];
  pageSection: string;
  pageTitle: string;
  initialCollapsed?: boolean;
  cookieName?: string;
  unreadNotificationsCount?: number;
  realtimeState?: "Live" | "Reconnecting" | "Offline";
  onRefresh?: () => void;
  refreshing?: boolean;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  isDirty?: boolean;
  extraTopBarActions?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  session,
  title = "WashFlow",
  subtitle = "Customer Portal",
  groups,
  pageSection,
  pageTitle,
  initialCollapsed = false,
  cookieName = "wf_client_sidebar_collapsed",
  unreadNotificationsCount = 0,
  realtimeState = "Live",
  onRefresh,
  refreshing = false,
  soundEnabled = true,
  onToggleSound,
  isDirty = false,
  extraTopBarActions,
  children,
}: AppShellProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-950 text-slate-100 antialiased font-sans select-none">
      {/* 1. Sidebar (Desktop rail / expanded + Mobile Drawer) */}
      <Sidebar
        title={title}
        subtitle={subtitle}
        groups={groups}
        session={session}
        initialCollapsed={initialCollapsed}
        cookieName={cookieName}
        mobileDrawerOpen={mobileDrawerOpen}
        onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
        menuButtonRef={menuButtonRef}
        isDirty={isDirty}
        realtimeState={realtimeState}
      />

      {/* 2. Main Workspace Body (Slim Top Bar + Scrollable Content) */}
      <div className="flex-1 flex flex-col h-dvh min-w-0 overflow-hidden select-text">
        <TopBar
          section={pageSection}
          title={pageTitle}
          unreadNotificationsCount={unreadNotificationsCount}
          user={session}
          onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
          menuButtonRef={menuButtonRef}
          soundEnabled={soundEnabled}
          onToggleSound={onToggleSound}
          refreshing={refreshing}
          onRefresh={onRefresh}
          extraActions={extraTopBarActions}
        />

        {/* Scrollable Content Body */}
        <main className="flex-1 overflow-y-auto min-w-0 p-4 sm:p-6 lg:p-8 scrollbar-thin scrollbar-thumb-white/10">
          {children}
        </main>
      </div>
    </div>
  );
}
