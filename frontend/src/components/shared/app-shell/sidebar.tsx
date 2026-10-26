"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Waves,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
  AlertTriangle,
} from "lucide-react";
import { UserSession } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface NavItem {
  id: string;
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: {
    count?: number;
    text?: string;
    variant?: "emerald" | "amber" | "sky" | "rose";
  } | null;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface SidebarProps {
  title?: string;
  subtitle?: string;
  groups: NavGroup[];
  session: UserSession;
  initialCollapsed?: boolean;
  cookieName?: string;
  mobileDrawerOpen: boolean;
  onCloseMobileDrawer: () => void;
  menuButtonRef?: React.RefObject<HTMLButtonElement | null>;
  isDirty?: boolean;
  realtimeState?: "Live" | "Reconnecting" | "Offline";
}

export function Sidebar({
  title = "WashFlow",
  subtitle = "Customer Portal",
  groups,
  session,
  initialCollapsed = false,
  cookieName = "wf_client_sidebar_collapsed",
  mobileDrawerOpen,
  onCloseMobileDrawer,
  menuButtonRef,
  isDirty = false,
  realtimeState = "Live",
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [isCollapsed, setIsCollapsed] = useState<boolean>(initialCollapsed);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  const [showConfirmLogout, setShowConfirmLogout] = useState<boolean>(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Toggle rail collapse & persist via cookie
  const handleToggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    document.cookie = `${cookieName}=${nextState}; path=/; max-age=31536000; SameSite=Lax`;
  };

  // Keyboard dismissal on Esc for mobile drawer & dirty dialog
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showConfirmLogout) {
          setShowConfirmLogout(false);
          return;
        }
        if (mobileDrawerOpen) {
          onCloseMobileDrawer();
          menuButtonRef?.current?.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileDrawerOpen, onCloseMobileDrawer, menuButtonRef, showConfirmLogout]);

  // Secure POST Logout with CSRF Protection
  const executeLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-Protection": "1",
        },
      });
      window.location.href = "/";
    } catch {
      window.location.href = "/";
    }
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDirty) {
      setShowConfirmLogout(true);
    } else {
      executeLogout();
    }
  };

  // Mask contact helper
  const getMaskedContact = () => {
    const raw = session.phone || session.email || "";
    if (raw.includes("@")) {
      const [name, domain] = raw.split("@");
      return `${name.slice(0, 2)}***@${domain}`;
    }
    const clean = raw.replace(/\s+/g, "");
    if (clean.length > 6) {
      return `${clean.slice(0, 4)}***${clean.slice(-3)}`;
    }
    return raw || "Verified";
  };

  const isLinkActive = (item: NavItem) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  // Render navigation group list
  const renderNavList = (collapsed: boolean, onNavClick?: () => void) => (
    <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10" aria-label="Main Navigation">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          {!collapsed && (
            <h4 className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1.5 select-none">
              {group.label}
            </h4>
          )}

          {group.items.map((item) => {
            const active = isLinkActive(item);
            const Icon = item.icon;
            // Badge strictly hidden at zero
            const showBadge = item.badge && (
              (item.badge.count !== undefined && item.badge.count > 0) ||
              (item.badge.text !== undefined && item.badge.text !== "")
            );

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onNavClick}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all outline-none",
                  "focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950",
                  active
                    ? "bg-gradient-to-r from-sky-500/20 to-sky-500/5 text-sky-300 border border-sky-500/30 font-semibold shadow-lg shadow-sky-500/5"
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? item.title : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "shrink-0 transition-colors",
                    collapsed ? "w-5 h-5" : "w-4 h-4",
                    active ? "text-sky-400" : "text-slate-400 group-hover:text-slate-200"
                  )}
                />

                {!collapsed && (
                  <span className="truncate flex-1">{item.title}</span>
                )}

                {!collapsed && showBadge && item.badge && (
                  <span
                    className={cn(
                      "ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider",
                      item.badge.variant === "emerald"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse"
                        : item.badge.variant === "amber"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : item.badge.variant === "rose"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    )}
                  >
                    {item.badge.text ?? item.badge.count}
                  </span>
                )}

                {/* Collapsed dot badge */}
                {collapsed && showBadge && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* 1. DESKTOP SIDEBAR (Visible lg:flex) */}
      <aside
        className={cn(
          "hidden lg:flex flex-col h-dvh shrink-0 border-r border-white/10 bg-slate-950 transition-all duration-300 relative z-40 select-none",
          isCollapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        {/* Brand / Logo Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 shrink-0">
          {/* Logo Action: POST logout with confirmation */}
          <button
            type="button"
            onClick={handleLogoClick}
            disabled={loggingOut}
            className={cn(
              "flex items-center gap-3 transition text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-xl p-1",
              isCollapsed && "justify-center w-full"
            )}
            title="Sign out and return to home"
            aria-label="Sign out and return to home page"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform">
              <Waves className="w-5 h-5 text-white" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-extrabold text-sm tracking-tight text-white leading-tight group-hover:text-sky-300 transition-colors">
                  {title}
                </span>
                <span className="text-[10px] text-sky-400 font-medium tracking-wide">
                  {subtitle}
                </span>
              </div>
            )}
          </button>

          {/* Spaced away collapse toggle */}
          {!isCollapsed && (
            <button
              type="button"
              onClick={handleToggleCollapse}
              className="p-1.5 ml-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
              title="Collapse sidebar rail"
              aria-label="Collapse sidebar rail"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Collapsed rail expand toggle button */}
        {isCollapsed && (
          <div className="p-2 border-b border-white/5 flex justify-center">
            <button
              type="button"
              onClick={handleToggleCollapse}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Nav list */}
        {renderNavList(isCollapsed)}

        {/* Realtime Status Indicator & Footer */}
        <div className="p-3 border-t border-white/10 bg-slate-950/50 shrink-0 space-y-2">
          {!isCollapsed && (
            <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5 font-medium">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    realtimeState === "Live"
                      ? "bg-emerald-400 animate-pulse"
                      : realtimeState === "Reconnecting"
                      ? "bg-amber-400 animate-ping"
                      : "bg-slate-500"
                  )}
                />
                <span className="text-slate-300">{realtimeState} Updates</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">v1.2</span>
            </div>
          )}

          {/* User Profile Mini Bar & Logout */}
          <div
            className={cn(
              "flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/5",
              isCollapsed ? "justify-center" : "justify-between"
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {session.name ? session.name.trim()[0].toUpperCase() : "U"}
              </div>
              {!isCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-white truncate leading-tight">
                    {session.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono truncate">
                    {getMaskedContact()}
                  </span>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <button
                type="button"
                onClick={executeLogout}
                disabled={loggingOut}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* 2. MOBILE DRAWER (Visible < lg when toggled) */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
            onClick={onCloseMobileDrawer}
            aria-hidden="true"
          />

          {/* Off-canvas Drawer Panel */}
          <div
            ref={drawerRef}
            className="relative flex-1 flex flex-col max-w-[280px] w-full bg-slate-950 border-r border-white/10 shadow-2xl z-50 h-full"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Drawer"
          >
            {/* Drawer Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 shrink-0">
              <button
                type="button"
                onClick={handleLogoClick}
                disabled={loggingOut}
                className="flex items-center gap-3 text-left focus-visible:outline-none"
                title="Sign out and return to home"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20">
                  <Waves className="w-4 h-4 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-sm text-white leading-tight">{title}</span>
                  <span className="text-[10px] text-sky-400 font-medium">{subtitle}</span>
                </div>
              </button>

              <button
                type="button"
                onClick={onCloseMobileDrawer}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition"
                aria-label="Close navigation drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav list */}
            {renderNavList(false, onCloseMobileDrawer)}

            {/* Mobile Footer */}
            <div className="p-4 border-t border-white/10 bg-slate-950/80 space-y-3 shrink-0">
              <div className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {session.name ? session.name.trim()[0].toUpperCase() : "U"}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-semibold text-white truncate leading-tight">
                    {session.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono truncate">
                    {getMaskedContact()}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={executeLogout}
                disabled={loggingOut}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dirty Form Confirmation Modal on Logo Sign Out */}
      {showConfirmLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-logout-title"
            aria-describedby="confirm-logout-desc"
          >
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 id="confirm-logout-title" className="text-sm font-bold text-white">
                Unsaved Changes
              </h3>
            </div>

            <p id="confirm-logout-desc" className="text-xs text-slate-400 leading-relaxed">
              You have unsaved changes in your current view. If you sign out now, your progress will be lost.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmLogout(false)}
                className="px-3.5 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-medium text-slate-300"
              >
                Stay on Page
              </button>
              <button
                type="button"
                onClick={executeLogout}
                className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition shadow-lg shadow-rose-500/20"
              >
                Discard & Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
