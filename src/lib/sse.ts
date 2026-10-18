type SSEEventCallback = (data: string) => void;

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

// Global singleton to persist across Next.js API invocations
const globalForSSE = globalThis as unknown as {
  sseManager: SSEManager | undefined;
};

export const sseManager = globalForSSE.sseManager ?? new SSEManager();
if (process.env.NODE_ENV !== "production") {
  globalForSSE.sseManager = sseManager;
}

export function broadcastAdminEvent(type: string, data: unknown) {
  sseManager.broadcast(type, data);
}
