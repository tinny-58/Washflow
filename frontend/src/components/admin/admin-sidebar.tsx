"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Truck,
  DollarSign,
  Tag,
  Users,
  Smartphone,
  MessageSquare,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogOut,
  RefreshCw,
  Waves,
  CheckCircle2,
  Clock,
  Radio,
  AlertCircle,
  Zap,
  BarChart3,
  Gift,
} from "lucide-react";
import { UserSession } from "@/lib/types";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface SidebarSummaryData {
  orders: {
    activeCount: number;
    hasUnconfirmed: boolean;
  };
  deliveries: {
    todayPendingCount: number;
    hasOverdue: boolean;
  };
  finance: {
    attentionCount: number;
    failedCount: number;
    pendingCount: number;
  };
  whatsapp: {
    status: "Online" | "Offline" | "Scan QR" | "Reconnecting" | "Needs re-pairing";
    rawStatus: string;
    isConnected: boolean;
  };
  automations?: {
    hasOtpWarning?: boolean;
  };
  messages: {
    undeliveredCount: number;
  };
  health: {
    openAlertsCount: number;
    highestSeverity: "critical" | "warning" | "info" | "none";
  };
  rewards?: {
    pendingApprovalsCount: number;
    hasOverdue: boolean;
  };
  system: {
    overallStatus: string;
    realtimeState: "Live" | "Reconnecting" | "Offline";
    lastSyncedAt: string;
    version: string;
  };
}

interface NavItemConfig {
  id: string;
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  external?: boolean;
  getBadge?: (data: SidebarSummaryData | null) => {
    count?: number;
    text?: string;
    variant: "emerald" | "amber" | "rose" | "sky" | "slate";
    pulse?: boolean;
    accessibleName: string;
    dotOnly?: boolean;
  } | null;
}

interface NavGroupConfig {
  label: string;
  items: NavItemConfig[];
}

interface AdminSidebarProps {
  session: UserSession;
  initialCollapsed?: boolean;
  mobileDrawerOpen: boolean;
  onCloseMobileDrawer: () => void;
  menuButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

// ============================================================================
// Context for Shared Sidebar Data (Single Source of Truth)
// ============================================================================

interface SidebarContextValue {
  summary: SidebarSummaryData | null;
  realtimeState: "Live" | "Reconnecting" | "Offline";
  lastSyncedAt: Date | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  closeRealtime: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebarContext() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebarContext must be used within SidebarDataProvider");
  }
  return ctx;
}

export function SidebarDataProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<SidebarSummaryData | null>(null);
  const [realtimeState, setRealtimeState] = useState<"Live" | "Reconnecting" | "Offline">("Offline");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [srAnnouncement, setSrAnnouncement] = useState<string>("");

  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const latestSeqRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastAnnouncementTimeRef = useRef<number>(0);

  // Throttled screen-reader polite announcement
  const announceToScreenReader = useCallback((text: string) => {
    const now = Date.now();
    if (now - lastAnnouncementTimeRef.current > 5000) {
      setSrAnnouncement(text);
      lastAnnouncementTimeRef.current = now;
    }
  }, []);

  // Fetch summary endpoint with cancellation
  const fetchSummary = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const ac = new AbortController();
    abortControllerRef.current = ac;

    try {
      const res = await fetch("/api/admin/sidebar-summary", {
        signal: ac.signal,
        headers: { "Cache-Control": "no-cache" },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/login";
        }
        return;
      }

      const json = await res.json();
      if (json.success && json.data) {
        if (typeof json.seq === "number") {
          latestSeqRef.current = Math.max(latestSeqRef.current, json.seq);
        }

        setSummary((prev) => {
          // Announce meaningful changes politely
          if (prev && json.data.health.openAlertsCount > prev.health.openAlertsCount) {
            announceToScreenReader(`System alerts increased to ${json.data.health.openAlertsCount}`);
          }
          return json.data;
        });
        setLastSyncedAt(new Date());
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        // network or server offline
      }
    } finally {
      setIsLoading(false);
    }
  }, [announceToScreenReader]);

  // Debounced fetch triggered by SSE
  const triggerDebouncedFetch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchSummary();
    }, 300);
  }, [fetchSummary]);

  // Close realtime streams explicitly (used on logout)
  const closeRealtime = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setRealtimeState("Offline");
  }, []);

  // SSE Connection Lifecycle with fallback polling
  useEffect(() => {
    fetchSummary();

    let es: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    const startSSE = () => {
      try {
        es = new EventSource("/api/admin/sse");
        eventSourceRef.current = es;

        es.addEventListener("CONNECTED", () => {
          setRealtimeState("Live");
          // Resync summary on connect/reconnect
          fetchSummary();
        });

        es.addEventListener("sidebar.changed", (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            if (typeof parsed.seq === "number") {
              if (parsed.seq >= latestSeqRef.current) {
                latestSeqRef.current = parsed.seq;
                triggerDebouncedFetch();
              }
            } else {
              triggerDebouncedFetch();
            }
          } catch {
            triggerDebouncedFetch();
          }
        });

        es.addEventListener("whatsapp_status", () => {
          triggerDebouncedFetch();
        });

        es.onerror = () => {
          setRealtimeState("Reconnecting");
          // If SSE is failing, fallback polling ensures live data is updated
          if (!pollInterval) {
            pollInterval = setInterval(fetchSummary, 30000);
          }
        };

        es.onopen = () => {
          setRealtimeState("Live");
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        };
      } catch {
        setRealtimeState("Offline");
        pollInterval = setInterval(fetchSummary, 30000);
      }
    };

    startSSE();

    return () => {
      if (es) {
        es.close();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchSummary, triggerDebouncedFetch]);

  return (
    <SidebarContext.Provider
      value={{
        summary,
        realtimeState,
        lastSyncedAt,
        isLoading,
        refresh: fetchSummary,
        closeRealtime,
      }}
    >
      {/* Politely throttled screen reader announcement */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {srAnnouncement}
      </div>
      {children}
    </SidebarContext.Provider>
  );
}

// ============================================================================
// Navigation Groups Specification
// ============================================================================

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    label: "OVERVIEW",
    items: [
      {
        id: "nav-dashboard",
        title: "Dashboard",
        href: "/admin",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      {
        id: "nav-operations",
        title: "Orders & Live Map",
        href: "/admin/operations",
        icon: Activity,
        getBadge: (data) => {
          if (!data || data.orders.activeCount <= 0) return null;
          const count = data.orders.activeCount;
          const text = count > 99 ? "99+" : String(count);
          const hasUnconfirmed = data.orders.hasUnconfirmed;
          return {
            count,
            text,
            variant: hasUnconfirmed ? "amber" : "sky",
            pulse: hasUnconfirmed,
            accessibleName: `${count} active order${count === 1 ? "" : "s"}${
              hasUnconfirmed ? ", unconfirmed orders pending" : ""
            }`,
          };
        },
      },
      {
        id: "nav-deliveries",
        title: "Deliveries & Logistics",
        href: "/admin/deliveries",
        icon: Truck,
        getBadge: (data) => {
          if (!data || data.deliveries.todayPendingCount <= 0) return null;
          const count = data.deliveries.todayPendingCount;
          const text = count > 99 ? "99+" : String(count);
          const isOverdue = data.deliveries.hasOverdue;
          return {
            count,
            text,
            variant: isOverdue ? "amber" : "slate",
            pulse: isOverdue,
            accessibleName: `${count} pending delivery${count === 1 ? "" : "s"}${
              isOverdue ? ", some past time window" : ""
            }`,
          };
        },
      },
    ],
  },
  {
    label: "FINANCE",
    items: [
      {
        id: "nav-transactions",
        title: "Transactions & Finance",
        href: "/admin/transactions",
        icon: DollarSign,
        getBadge: (data) => {
          if (!data || data.finance.attentionCount <= 0) return null;
          const count = data.finance.attentionCount;
          const text = count > 99 ? "99+" : String(count);
          const hasFailed = data.finance.failedCount > 0;
          return {
            count,
            text,
            variant: hasFailed ? "rose" : "amber",
            pulse: hasFailed,
            accessibleName: `${count} payment${count === 1 ? "" : "s"} needing attention${
              hasFailed ? " (failed)" : " (pending)"
            }`,
          };
        },
      },
      {
        id: "nav-catalog",
        title: "Price Catalog",
        href: "/admin/catalog",
        icon: Tag,
        // Explicitly: no badge
      },
    ],
  },
  {
    label: "CUSTOMERS",
    items: [
      {
        id: "nav-customers",
        title: "Customer Directory",
        href: "/admin/customers",
        icon: Users,
      },
      {
        id: "nav-rewards",
        title: "Referrals & Loyalty",
        href: "/admin/rewards",
        icon: Gift,
        getBadge: (data) => {
          const count = data?.rewards?.pendingApprovalsCount ?? 0;
          if (count <= 0) return null;
          return {
            count,
            text: `${count} PENDING`,
            variant: data?.rewards?.hasOverdue ? "rose" : "amber",
            pulse: data?.rewards?.hasOverdue,
            accessibleName: `${count} reward${count === 1 ? "" : "s"} awaiting admin approval`,
          };
        },
      },
      {
        id: "nav-traffic",
        title: "Traffic & Activity",
        href: "/admin/customers/traffic",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "WHATSAPP",
    items: [
      {
        id: "nav-whatsapp-worker",
        title: "Worker & Sender",
        href: "/admin/whatsapp/worker",
        icon: Smartphone,
        getBadge: (data) => {
          if (!data) {
            return {
              text: "Offline",
              variant: "slate",
              accessibleName: "WhatsApp Gateway status: Offline",
            };
          }
          const status = data.whatsapp.status;
          let variant: "emerald" | "amber" | "rose" | "sky" | "slate" = "slate";
          let pulse = false;

          if (status === "Online") {
            variant = "emerald";
          } else if (status === "Scan QR") {
            variant = "amber";
            pulse = true;
          } else if (status === "Reconnecting") {
            variant = "sky";
            pulse = true;
          } else if (status === "Needs re-pairing") {
            variant = "rose";
          } else {
            variant = "slate";
          }

          return {
            text: status,
            variant,
            pulse,
            accessibleName: `WhatsApp Gateway status: ${status}`,
          };
        },
      },
      {
        id: "nav-whatsapp-automations",
        title: "Automations & Rules",
        href: "/admin/whatsapp/automations",
        icon: Zap,
        getBadge: (data) => {
          if (!data?.automations?.hasOtpWarning) return null;
          return {
            dotOnly: true,
            variant: "rose",
            pulse: true,
            accessibleName: "Critical automation warning: OTP misconfigured or failing",
          };
        },
      },
      {
        id: "nav-whatsapp-logs",
        title: "Message Logs",
        href: "/admin/whatsapp/logs",
        icon: MessageSquare,
        getBadge: (data) => {
          if (!data || data.messages.undeliveredCount <= 0) return null;
          const count = data.messages.undeliveredCount;
          const text = count > 99 ? "99+" : String(count);
          return {
            count,
            text,
            variant: "rose",
            accessibleName: `${count} undelivered message${count === 1 ? "" : "s"}`,
          };
        },
      },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      {
        id: "nav-health",
        title: "System Downtime & Health",
        href: "/admin/health",
        icon: AlertTriangle,
        getBadge: (data) => {
          if (!data || data.health.openAlertsCount <= 0) return null;
          const count = data.health.openAlertsCount;
          const text = count > 99 ? "99+" : String(count);
          const sev = data.health.highestSeverity;
          const variant = sev === "critical" ? "rose" : sev === "warning" ? "amber" : "sky";
          return {
            count,
            text,
            variant,
            pulse: sev === "critical",
            accessibleName: `${count} system alert${count === 1 ? "" : "s"} (highest severity: ${sev})`,
          };
        },
      },
    ],
  },
  {
    label: "STOREFRONT",
    items: [
      {
        id: "nav-storefront",
        title: "Storefront Preview",
        href: "/",
        icon: ExternalLink,
        external: true,
        // Explicitly: no badge
      },
    ],
  },
];

// Helper to test if a route is active (supports nested routes)
export function isRouteActive(
  itemHref: string,
  exact: boolean | undefined,
  currentPathname: string
): boolean {
  if (exact) {
    return currentPathname === itemHref;
  }
  // Group-specific nested path matching
  if (itemHref === "/admin/operations") {
    return (
      currentPathname.startsWith("/admin/operations") ||
      currentPathname.startsWith("/admin/orders")
    );
  }
  if (itemHref === "/admin/transactions") {
    return (
      currentPathname.startsWith("/admin/transactions") ||
      currentPathname.startsWith("/admin/payments")
    );
  }
  return currentPathname.startsWith(itemHref);
}

// Dirty-form safety check
function hasDirtyFormInputs(): boolean {
  if (typeof document === "undefined") return false;
  const forms = document.querySelectorAll("form.dirty");
  if (forms.length > 0) return true;

  const inputs = document.querySelectorAll(
    "input:not([type=hidden]):not([type=submit]), textarea, select"
  );
  for (const el of Array.from(inputs)) {
    const input = el as HTMLInputElement;
    if (input.disabled || input.readOnly) continue;
    if (input.type === "checkbox" || input.type === "radio") {
      if (input.defaultChecked !== input.checked) return true;
    } else {
      if (input.defaultValue !== input.value) return true;
    }
  }
  return false;
}

// ============================================================================
// Main AdminSidebar Component
// ============================================================================

export function AdminSidebar({
  session,
  initialCollapsed = false,
  mobileDrawerOpen,
  onCloseMobileDrawer,
  menuButtonRef,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { summary, realtimeState, lastSyncedAt, closeRealtime } = useSidebarContext();

  // Desktop Rail vs Expanded state
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed);

  // Logout UI state
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  // Floating unclipped tooltip state for Collapsed Rail mode
  const [tooltipState, setTooltipState] = useState<{
    text: string;
    badgeText?: string;
    top: number;
    left: number;
  } | null>(null);

  // Mobile Drawer ref for Focus Trap
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Sync collapse state with cookie and localStorage (preserves preference without flicker)
  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("washflow_sidebar_collapsed", String(next));
        document.cookie = `wf_sidebar_collapsed=${next}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {}
      return next;
    });
    setTooltipState(null);
  };

  // Perform secure POST logout with anti-CSRF protection
  const handleSignOut = async (promptIfDirty = false) => {
    if (promptIfDirty && hasDirtyFormInputs()) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to sign out and return to the home page?"
      );
      if (!confirmed) return;
    }

    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      closeRealtime();

      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-Protection": "1",
        },
      });

      if (!res.ok) {
        throw new Error("Logout request failed");
      }

      try {
        sessionStorage.clear();
      } catch {}

      // Redirect directly to landing page
      window.location.href = "/";
    } catch {
      setIsLoggingOut(false);
      setLogoutError("Sign out failed. Tap to retry.");
    }
  };

  // Mobile Drawer Accessibility: Focus Trap & Escape key handling
  useEffect(() => {
    if (!mobileDrawerOpen) return;

    // Save active element to return focus on close
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseMobileDrawer();
        return;
      }

      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Auto-focus first focusable item in drawer
    const timer = setTimeout(() => {
      if (drawerRef.current) {
        const first = drawerRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea'
        );
        first?.focus();
      }
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
      if (menuButtonRef?.current) {
        menuButtonRef.current.focus();
      } else if (previouslyFocused) {
        previouslyFocused.focus();
      }
    };
  }, [mobileDrawerOpen, onCloseMobileDrawer, menuButtonRef]);

  // Formatter for Last-Synced time
  const formatSyncedTime = (date: Date | null) => {
    if (!date) return "Syncing...";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  // Badge Color Style Resolver
  const getBadgeClass = (variant: "emerald" | "amber" | "rose" | "sky" | "slate") => {
    switch (variant) {
      case "emerald":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "amber":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "rose":
        return "bg-rose-500/20 text-rose-300 border-rose-500/30";
      case "sky":
        return "bg-sky-500/20 text-sky-300 border-sky-500/30";
      case "slate":
      default:
        return "bg-slate-700/50 text-slate-300 border-slate-600/50";
    }
  };

  // Tooltip handler for rail mode (hover & keyboard focus)
  const showTooltip = (
    e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>,
    title: string,
    badgeText?: string
  ) => {
    if (!collapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipState({
      text: title,
      badgeText,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  };

  const hideTooltip = () => {
    setTooltipState(null);
  };

  // App version
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "v1.0.0 (0ff0351)";

  return (
    <>
      {/* =================================================================== */}
      {/* 1. DESKTOP SIDEBAR (EXPANDED ~256px / RAIL ~72px)                   */}
      {/* =================================================================== */}
      <aside
        id="admin-sidebar-nav"
        aria-label="Admin Navigation"
        className={`
          hidden lg:flex flex-col h-dvh sticky top-0 left-0 bg-slate-950/95 backdrop-blur-2xl border-r border-white/10 z-40
          transition-[width] duration-200 motion-reduce:transition-none select-none shrink-0
          ${collapsed ? "w-[72px]" : "w-64"}
        `}
      >
        {/* Header: Logo, Title, Spacing & Collapse Chevron */}
        <div className="h-16 flex items-center justify-between px-3 border-b border-white/10 shrink-0 gap-2">
          {/* Logo Button: Click ends session & redirects to / with CSRF */}
          <button
            type="button"
            onClick={() => handleSignOut(true)}
            disabled={isLoggingOut}
            className="flex items-center gap-3 overflow-hidden rounded-xl p-1.5 hover:bg-white/5 transition focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none min-h-[44px] text-left group"
            title="Sign out and go to the landing page"
            aria-label="Sign out and go to the landing page"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 shrink-0 group-hover:scale-105 transition">
              <Waves className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0 pr-1">
                <span className="font-black text-sm tracking-tight text-white block truncate">
                  WashFlow Admin
                </span>
                <span className="text-[10px] text-slate-400 block truncate font-medium">
                  {session.name ? `Admin: ${session.name}` : "Operations Console"}
                </span>
              </div>
            )}
          </button>

          {/* Collapse / Expand Toggle Button with >=44px Hit Area */}
          <button
            type="button"
            onClick={toggleCollapse}
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar-nav"
            className="w-11 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition border border-white/10 flex items-center justify-center shrink-0 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
            title={collapsed ? "Expand sidebar (256px)" : "Collapse sidebar to rail (72px)"}
            aria-label={collapsed ? "Expand sidebar navigation" : "Collapse sidebar navigation to icons"}
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        {/* Scrollable Nav Item Groups (Short Screen Friendly) */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5 scrollbar-thin scrollbar-thumb-white/10">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              {!collapsed ? (
                <div className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                  {group.label}
                </div>
              ) : (
                <div className="h-px bg-white/10 mx-2 my-2" role="separator" aria-label={group.label} />
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(item.href, item.exact, pathname);
                const badge = item.getBadge ? item.getBadge(summary) : null;

                const linkProps = item.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {};

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    {...linkProps}
                    aria-current={active ? "page" : undefined}
                    onMouseEnter={(e) => showTooltip(e, item.title, badge?.text)}
                    onMouseLeave={hideTooltip}
                    onFocus={(e) => showTooltip(e, item.title, badge?.text)}
                    onBlur={hideTooltip}
                    className={`
                      relative flex items-center rounded-xl text-xs font-semibold transition group border min-h-[44px]
                      focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none
                      ${
                        active
                          ? "bg-sky-500/20 text-white border-sky-500/40 shadow-sm shadow-sky-500/10 font-bold"
                          : "text-slate-300 hover:text-white hover:bg-white/[0.06] border-transparent hover:border-white/5"
                      }
                      ${collapsed ? "justify-center px-0 w-full" : "justify-between px-3"}
                    `}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0 flex items-center justify-center">
                        <Icon
                          className={`w-4 h-4 shrink-0 transition ${
                            active ? "text-sky-400" : "text-slate-400 group-hover:text-white"
                          }`}
                        />
                        {/* Collapsed Rail Badge Bubbles on Icon */}
                        {collapsed && badge && (
                          <span
                            className={`
                              absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center border font-mono
                              ${getBadgeClass(badge.variant)}
                              ${badge.pulse ? "animate-pulse" : ""}
                            `}
                            aria-label={badge.accessibleName}
                          >
                            {badge.count !== undefined ? (badge.count > 99 ? "99+" : badge.count) : "•"}
                          </span>
                        )}
                      </div>

                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </div>

                    {/* Expanded Mode Badge Pills */}
                    {!collapsed && badge && (
                      <span
                        className={`
                          text-[10px] px-1.5 py-0.5 rounded-md border font-semibold font-mono flex items-center gap-1 shrink-0
                          ${getBadgeClass(badge.variant)}
                          ${badge.pulse ? "animate-pulse" : ""}
                        `}
                        aria-label={badge.accessibleName}
                      >
                        {badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                        {badge.text}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Pinned Bottom Footer: Health, Realtime State, Version, Sign Out */}
        <div className="p-3 border-t border-white/10 bg-slate-950 shrink-0 space-y-2.5">
          {!collapsed ? (
            <div className="space-y-1.5 px-1">
              {/* Overall System Health Status Link */}
              <Link
                href="/admin/health"
                className="flex items-center justify-between text-[11px] text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/5 transition"
                title="View System Health Monitor"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      summary?.system.overallStatus === "Operational"
                        ? "bg-emerald-400"
                        : summary?.system.overallStatus.startsWith("Degraded")
                        ? "bg-amber-400 animate-pulse"
                        : "bg-rose-500 animate-pulse"
                    }`}
                  />
                  <span className="truncate max-w-[130px]">
                    {summary?.system.overallStatus || "Operational"}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-slate-400" title="Build version">
                  {appVersion}
                </span>
              </Link>

              {/* Realtime Stream Connection State */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                <span className="flex items-center gap-1">
                  <Radio
                    className={`w-3 h-3 ${
                      realtimeState === "Live"
                        ? "text-emerald-400 animate-pulse"
                        : realtimeState === "Reconnecting"
                        ? "text-amber-400 animate-spin"
                        : "text-slate-400"
                    }`}
                  />
                  <span>Realtime: {realtimeState}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {formatSyncedTime(lastSyncedAt)}
                </span>
              </div>
            </div>
          ) : (
            /* Collapsed Rail Footer Status Icon */
            <div className="flex justify-center py-1">
              <Link
                href="/admin/health"
                onMouseEnter={(e) =>
                  showTooltip(e, `Health: ${summary?.system.overallStatus || "Operational"}`, `Realtime: ${realtimeState}`)
                }
                onMouseLeave={hideTooltip}
                onFocus={(e) =>
                  showTooltip(e, `Health: ${summary?.system.overallStatus || "Operational"}`, `Realtime: ${realtimeState}`)
                }
                onBlur={hideTooltip}
                className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/5 text-slate-300 hover:text-white transition"
                aria-label={`System Health: ${summary?.system.overallStatus || "Operational"}`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    summary?.system.overallStatus === "Operational"
                      ? "bg-emerald-400"
                      : "bg-amber-400 animate-pulse"
                  }`}
                />
              </Link>
            </div>
          )}

          {/* Sign Out Button (POST /api/auth/logout with CSRF) */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => handleSignOut(false)}
              disabled={isLoggingOut}
              className={`
                w-full flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 text-xs font-semibold text-slate-300 hover:text-rose-300 transition min-h-[44px] focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none
                ${collapsed ? "px-0" : "px-3 py-2"}
              `}
              title="Sign Out"
              aria-label="Sign Out"
            >
              {isLoggingOut ? (
                <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-rose-400" />
              ) : (
                <LogOut className="w-4 h-4 shrink-0" />
              )}
              {!collapsed && <span>{isLoggingOut ? "Signing Out..." : "Sign Out"}</span>}
            </button>

            {logoutError && !collapsed && (
              <p
                onClick={() => handleSignOut(false)}
                className="text-[10px] text-rose-400 text-center cursor-pointer hover:underline"
              >
                {logoutError}
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* =================================================================== */}
      {/* 2. UNCLIPPED FIXED TOOLTIP FOR COLLAPSED RAIL MODE                  */}
      {/* =================================================================== */}
      {collapsed && tooltipState && (
        <div
          role="tooltip"
          style={{ top: `${tooltipState.top}px`, left: `${tooltipState.left}px` }}
          className="fixed -translate-y-1/2 z-50 pointer-events-none px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-white text-xs font-semibold shadow-2xl flex items-center gap-2 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
        >
          <span>{tooltipState.text}</span>
          {tooltipState.badgeText && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-sky-300 font-mono">
              {tooltipState.badgeText}
            </span>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. MOBILE OFF-CANVAS DRAWER (< 1024px) WITH FOCUS TRAP & OVERLAY   */}
      {/* =================================================================== */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobileDrawer}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <div
            ref={drawerRef}
            className="relative w-72 max-w-[85vw] h-full bg-slate-950 border-r border-white/10 shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-200"
          >
            {/* Drawer Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onCloseMobileDrawer();
                  handleSignOut(true);
                }}
                className="flex items-center gap-3 text-left min-h-[44px] rounded-lg focus-visible:ring-2 focus-visible:ring-sky-400"
                aria-label="Sign out and return to landing page"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white">
                  <Waves className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-black text-sm text-white block">WashFlow Admin</span>
                  <span className="text-[10px] text-slate-400 block font-medium">Operations Console</span>
                </div>
              </button>

              <button
                type="button"
                onClick={onCloseMobileDrawer}
                className="w-11 h-11 rounded-xl bg-white/5 text-slate-400 hover:text-white flex items-center justify-center transition border border-white/10 focus-visible:ring-2 focus-visible:ring-sky-400"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Nav list */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <div className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isRouteActive(item.href, item.exact, pathname);
                    const badge = item.getBadge ? item.getBadge(summary) : null;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noopener noreferrer" : undefined}
                        onClick={onCloseMobileDrawer}
                        aria-current={active ? "page" : undefined}
                        className={`
                          flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition border min-h-[44px]
                          ${
                            active
                              ? "bg-sky-500/20 text-white border-sky-500/40 font-bold"
                              : "text-slate-300 hover:text-white hover:bg-white/5 border-transparent"
                          }
                        `}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className={`w-4 h-4 shrink-0 ${active ? "text-sky-400" : "text-slate-400"}`} />
                          <span className="truncate">{item.title}</span>
                        </div>
                        {badge && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-md border font-mono font-semibold ${getBadgeClass(
                              badge.variant
                            )} ${badge.pulse ? "animate-pulse" : ""}`}
                            aria-label={badge.accessibleName}
                          >
                            {badge.text}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Mobile Footer Status & Sign Out */}
            <div className="p-4 border-t border-white/10 shrink-0 space-y-3 bg-slate-950">
              <Link
                href="/admin/health"
                onClick={onCloseMobileDrawer}
                className="flex items-center justify-between text-xs text-slate-300 p-2 rounded-lg bg-white/5 border border-white/5"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      summary?.system.overallStatus === "Operational"
                        ? "bg-emerald-400"
                        : "bg-amber-400 animate-pulse"
                    }`}
                  />
                  <span>{summary?.system.overallStatus || "Operational"}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{appVersion}</span>
              </Link>

              <button
                type="button"
                onClick={() => handleSignOut(false)}
                disabled={isLoggingOut}
                className="w-full min-h-[44px] rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-bold text-rose-300 flex items-center justify-center gap-2 transition focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                {isLoggingOut ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span>{isLoggingOut ? "Signing Out..." : "Sign Out"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
