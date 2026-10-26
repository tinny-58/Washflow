"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";

export interface ClientSidebarSummary {
  activeOrdersCount: number;
  amountsDueCount: number;
  claimsUnreadRepliesCount: number;
  availableVouchersCount: number;
  unreadNotificationsCount: number;
}

interface ClientSidebarContextValue {
  summary: ClientSidebarSummary | null;
  realtimeState: "Live" | "Reconnecting" | "Offline";
  refresh: () => Promise<void>;
}

export const ClientSidebarContext = createContext<ClientSidebarContextValue | null>(null);

export function ClientSidebarDataProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<ClientSidebarSummary | null>(null);
  const [realtimeState, setRealtimeState] = useState<"Live" | "Reconnecting" | "Offline">("Offline");
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/client/overview", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setSummary({
            activeOrdersCount: data.stats.activeOrdersCount ?? 0,
            amountsDueCount: data.stats.amountsDueCount ?? 0,
            claimsUnreadRepliesCount: data.stats.claimsUnreadRepliesCount ?? 0,
            availableVouchersCount: data.stats.availableVouchersCount ?? 0,
            unreadNotificationsCount: data.unreadNotificationsCount ?? 0,
          });
        }
      }
    } catch {
      // Ignore network errors in polling
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchSummary();

    let es: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    const startSSE = () => {
      try {
        es = new EventSource("/api/client/sse");
        eventSourceRef.current = es;

        es.addEventListener("CONNECTED", () => {
          setRealtimeState("Live");
          fetchSummary();
        });

        const handleRealtimeUpdate = () => {
          fetchSummary();
          window.dispatchEvent(new CustomEvent("client-refresh"));
        };

        es.addEventListener("ORDER_CREATED", handleRealtimeUpdate);
        es.addEventListener("ORDER_STATUS_UPDATED", handleRealtimeUpdate);
        es.addEventListener("PAYMENT_CONFIRMED", handleRealtimeUpdate);
        es.addEventListener("VOUCHER_ISSUED", handleRealtimeUpdate);
        es.addEventListener("CLAIM_UPDATED", handleRealtimeUpdate);
        es.addEventListener("booking_created", handleRealtimeUpdate);
        es.addEventListener("booking_updated", handleRealtimeUpdate);
        es.addEventListener("payment_confirmed", handleRealtimeUpdate);

        es.onerror = () => {
          setRealtimeState("Reconnecting");
          if (!pollInterval) {
            pollInterval = setInterval(fetchSummary, 20000);
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
    };
  }, [fetchSummary]);

  return (
    <ClientSidebarContext.Provider value={{ summary, realtimeState, refresh }}>
      {children}
    </ClientSidebarContext.Provider>
  );
}

export function useClientSidebar() {
  const ctx = useContext(ClientSidebarContext);
  if (!ctx) {
    return {
      summary: null,
      realtimeState: "Offline" as const,
      refresh: async () => {},
    };
  }
  return ctx;
}
