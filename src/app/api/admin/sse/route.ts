import { NextRequest } from "next/server";
import { sseManager } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Initial connection greeting
      controller.enqueue(
        encoder.encode(`event: CONNECTED\ndata: ${JSON.stringify({ connected: true, time: new Date() })}\n\n`)
      );

      // 2. Subscribe to broadcasts
      cleanup = sseManager.subscribe((formattedMessage) => {
        try {
          controller.enqueue(encoder.encode(formattedMessage));
        } catch {
          if (cleanup) cleanup();
        }
      });

      // 3. Heartbeat keepalive every 20 seconds
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, 20000);
    },
    cancel() {
      if (cleanup) cleanup();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
