type SSEEventCallback = (data: string) => void;

let sidebarSequence = 1;

class SSEManager {
  private listeners: Set<SSEEventCallback> = new Set();

  subscribe(listener: SSEEventCallback): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  broadcast(eventType: string, payload: unknown) {
    const formatted = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const listener of this.listeners) {
      try {
        listener(formatted);
      } catch {
        this.listeners.delete(listener);
      }
    }
  }

  getActiveSubscriberCount(): number {
    return this.listeners.size;
  }
}

class ClientSSEManager {
  private userListeners: Map<string, Set<SSEEventCallback>> = new Map();

  subscribe(userId: string, listener: SSEEventCallback): () => void {
    if (!this.userListeners.has(userId)) {
      this.userListeners.set(userId, new Set());
    }
    const set = this.userListeners.get(userId)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.userListeners.delete(userId);
      }
    };
  }

  sendToUser(userId: string, eventType: string, payload: unknown) {
    const set = this.userListeners.get(userId);
    if (!set || set.size === 0) return;

    const formatted = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const listener of set) {
      try {
        listener(formatted);
      } catch {
        set.delete(listener);
      }
    }
  }

  getActiveSubscriberCount(): number {
    let count = 0;
    for (const set of this.userListeners.values()) {
      count += set.size;
    }
    return count;
  }
}

// Global singleton to persist across Next.js API invocations
const globalForSSE = globalThis as unknown as {
  sseManager: SSEManager | undefined;
  clientSseManager: ClientSSEManager | undefined;
  sidebarSequence: number | undefined;
};

export const sseManager = globalForSSE.sseManager ?? new SSEManager();
export const clientSseManager = globalForSSE.clientSseManager ?? new ClientSSEManager();
if (process.env.NODE_ENV !== "production") {
  globalForSSE.sseManager = sseManager;
  globalForSSE.clientSseManager = clientSseManager;
}

export function sendClientEvent(userId: string, type: string, data: unknown) {
  clientSseManager.sendToUser(userId, type, data);
}

export function getSidebarSequence(): number {
  return globalForSSE.sidebarSequence ?? sidebarSequence;
}

export function broadcastSidebarChanged() {
  sidebarSequence += 1;
  globalForSSE.sidebarSequence = sidebarSequence;
  sseManager.broadcast("sidebar.changed", { seq: sidebarSequence, timestamp: new Date().toISOString() });
}

export function broadcastAdminEvent(type: string, data: unknown) {
  sseManager.broadcast(type, data);
  // Also notify sidebar subscribers of relevant real-time mutations
  if (
    type === "new_booking" ||
    type === "booking_updated" ||
    type === "PAYMENT_RECEIVED" ||
    type === "whatsapp_status" ||
    type === "RIDER_LOCATION_PINGED"
  ) {
    broadcastSidebarChanged();
  }
}

