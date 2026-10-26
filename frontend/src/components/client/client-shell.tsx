"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  Package,
  CreditCard,
  Receipt,
  AlertCircle,
  Gift,
  Settings,
} from "lucide-react";
import { UserSession } from "@/lib/types";
import { AppShell, NavGroup } from "@/components/shared";
import {
  ClientSidebarDataProvider,
  useClientSidebar,
} from "./client-sidebar";

interface ClientShellProps {
  session: UserSession;
  initialCollapsed?: boolean;
  children: React.ReactNode;
}

function ClientShellInner({
  session,
  initialCollapsed = false,
  children,
}: ClientShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { summary, realtimeState, refresh } = useClientSidebar();

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Dynamic breadcrumb section and title
  const getPageInfo = () => {
    if (pathname === "/client") return { section: "OVERVIEW", title: "Dashboard" };
    if (pathname.startsWith("/client/book")) return { section: "ORDERS", title: "Book a Wash" };
    if (pathname.startsWith("/client/orders")) return { section: "ORDERS", title: "My Orders" };
    if (pathname.startsWith("/client/payments")) return { section: "PAYMENTS", title: "Payments" };
    if (pathname.startsWith("/client/transactions")) return { section: "PAYMENTS", title: "Transactions" };
    if (pathname.startsWith("/client/claims")) return { section: "SUPPORT", title: "Claims" };
    if (pathname.startsWith("/client/rewards")) return { section: "REWARDS", title: "Referral Tracker" };
    if (pathname.startsWith("/client/settings")) return { section: "ACCOUNT", title: "Settings" };
    if (pathname.startsWith("/client/track")) return { section: "ORDERS", title: "Track Order" };
    return { section: "PORTAL", title: "Client Workspace" };
  };

  const pageInfo = getPageInfo();

  // Navigation Groups strictly matching Phase 1 requirements
  const groups: NavGroup[] = [
    {
      label: "OVERVIEW",
      items: [
        {
          id: "dashboard",
          title: "Dashboard",
          href: "/client",
          icon: LayoutDashboard,
          exact: true,
        },
      ],
    },
    {
      label: "ORDERS",
      items: [
        {
          id: "book",
          title: "Book a Wash",
          href: "/client/book",
          icon: PlusCircle,
        },
        {
          id: "orders",
          title: "My Orders",
          href: "/client/orders",
          icon: Package,
          badge:
            summary?.activeOrdersCount && summary.activeOrdersCount > 0
              ? { count: summary.activeOrdersCount, variant: "sky" }
              : null,
        },
      ],
    },
    {
      label: "PAYMENTS",
      items: [
        {
          id: "payments",
          title: "Payments",
          href: "/client/payments",
          icon: CreditCard,
          badge:
            summary?.amountsDueCount && summary.amountsDueCount > 0
              ? { count: summary.amountsDueCount, variant: "amber" }
              : null,
        },
        {
          id: "transactions",
          title: "Transactions",
          href: "/client/transactions",
          icon: Receipt,
        },
      ],
    },
    {
      label: "SUPPORT",
      items: [
        {
          id: "claims",
          title: "Claims",
          href: "/client/claims",
          icon: AlertCircle,
          badge:
            summary?.claimsUnreadRepliesCount && summary.claimsUnreadRepliesCount > 0
              ? { count: summary.claimsUnreadRepliesCount, variant: "rose" }
              : null,
        },
      ],
    },
    {
      label: "REWARDS",
      items: [
        {
          id: "rewards",
          title: "Referral Tracker",
          href: "/client/rewards",
          icon: Gift,
          badge:
            summary?.availableVouchersCount && summary.availableVouchersCount > 0
              ? { count: summary.availableVouchersCount, variant: "emerald" }
              : null,
        },
      ],
    },
    {
      label: "ACCOUNT",
      items: [
        {
          id: "settings",
          title: "Settings",
          href: "/client/settings",
          icon: Settings,
        },
      ],
    },
  ];

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    router.refresh();
    window.dispatchEvent(new CustomEvent("client-refresh"));
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <AppShell
      session={session}
      title="WashFlow"
      subtitle="Customer Portal"
      groups={groups}
      pageSection={pageInfo.section}
      pageTitle={pageInfo.title}
      initialCollapsed={initialCollapsed}
      cookieName="wf_client_sidebar_collapsed"
      unreadNotificationsCount={summary?.unreadNotificationsCount || 0}
      realtimeState={realtimeState}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      soundEnabled={soundEnabled}
      onToggleSound={() => setSoundEnabled(!soundEnabled)}
    >
      {children}
    </AppShell>
  );
}

export function ClientShell(props: ClientShellProps) {
  return (
    <ClientSidebarDataProvider>
      <ClientShellInner {...props} />
    </ClientSidebarDataProvider>
  );
}
