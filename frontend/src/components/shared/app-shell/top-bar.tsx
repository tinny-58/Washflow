"use client";

import React from "react";
import Link from "next/link";
import { Menu, Bell, RefreshCw } from "lucide-react";
import { UserSession } from "@/lib/types";
import { SoundNotifierToggle } from "@/components/admin/sound-notifier";

export interface TopBarProps {
  section: string;
  title: string;
  unreadNotificationsCount?: number;
  user: UserSession;
  onOpenMobileDrawer: () => void;
  menuButtonRef?: React.RefObject<HTMLButtonElement | null>;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  extraActions?: React.ReactNode;
}

export function TopBar({
  section,
  title,
  unreadNotificationsCount = 0,
  user,
  onOpenMobileDrawer,
  menuButtonRef,
  soundEnabled = true,
  onToggleSound,
  refreshing = false,
  onRefresh,
  extraActions,
}: TopBarProps) {
  const userInitial = user.name ? user.name.trim()[0].toUpperCase() : "U";

  return (
    <header className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl shrink-0 z-30">
      {/* Left: Mobile Drawer Hamburger & Dynamic Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onOpenMobileDrawer}
          className="lg:hidden min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition shrink-0 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
          aria-label="Open mobile navigation drawer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
            <li className="truncate">{section}</li>
            <li aria-hidden="true" className="text-slate-600">/</li>
            <li className="text-white font-bold truncate" aria-current="page">
              {title}
            </li>
          </ol>
        </nav>
      </div>

      {/* Right: Controls (Custom Actions, Sound, Refresh, Notifications, Profile Chip) */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {extraActions}

        {/* Sound Toggle */}
        {onToggleSound && (
          <SoundNotifierToggle
            soundEnabled={soundEnabled}
            onToggleSound={onToggleSound}
          />
        )}

        {/* Refresh Workspace Data */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition flex items-center justify-center focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none disabled:opacity-50"
            title="Refresh workspace data"
            aria-label="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-sky-400" : ""}`} />
          </button>
        )}

        {/* Notification Bell Link */}
        <Link
          href={user.role === "admin" ? "/admin/messages" : "/client/settings#notifications"}
          className="relative min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition flex items-center justify-center focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
          title={`${unreadNotificationsCount} notifications`}
          aria-label={`View notifications (${unreadNotificationsCount} unread)`}
        >
          <Bell className="w-4 h-4" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-white font-bold text-[10px] flex items-center justify-center font-mono bg-sky-500 animate-pulse">
              {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
            </span>
          )}
        </Link>

        {/* Account Chip */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-white/10">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-md shadow-sky-500/20 shrink-0">
            {userInitial}
          </div>
          <div className="hidden xl:flex flex-col text-left">
            <span className="text-xs font-bold text-white leading-tight truncate max-w-[130px]">
              {user.name}
            </span>
            <span className="text-[10px] text-sky-400 font-medium capitalize">
              {user.role === "admin" ? "Admin" : "Customer"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
