import { getAllLiveFeeds, getWsStatus, subscribeStreamEvents, type StreamEvent } from "@/lib/angelWs";

import { checkRateLimit } from "@/lib/apiGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = checkRateLimit(req, "read");
  if (denied) return Response.json(denied.body, { status: denied.status });
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepalive: NodeJS.Timeout | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (keepalive) {
      clearInterval(keepalive);
      keepalive = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (ev: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`));
        } catch {
          cleanup();
        }
      };

      // Push initial connection status + latest live tick snapshots immediately on connect
      const ws = getWsStatus();
      send({ type: "status", ws, ts: Date.now() });

      for (const feed of getAllLiveFeeds()) {
        if (feed.lastWsTickAt && feed.candles.length > 0 && feed.ltp > 0) {
          const lastBar = feed.candles[feed.candles.length - 1];
          const base = feed.prevClose > 0 ? feed.prevClose : feed.dayOpen > 0 ? feed.dayOpen : lastBar.o;
          const change = base > 0 ? Math.round((feed.ltp - base) * 100) / 100 : 0;
          const changePct = base > 0 ? Math.round(((feed.ltp - base) / base) * 10000) / 100 : 0;
          send({
            type: "tick",
            symbol: feed.symbol,
            ltp: feed.ltp,
            dayOpen: feed.dayOpen,
            high: feed.dayHigh,
            low: feed.dayLow,
            change,
            changePct,
            volume: feed.volume,
            candle: { ...lastBar },
            bids: feed.bids,
            asks: feed.asks,
            ts: feed.lastWsTickAt,
            ticksReceived: ws.ticksReceived,
          });
        }
      }

      unsubscribe = subscribeStreamEvents(send);

      keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, 15_000);

      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
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

