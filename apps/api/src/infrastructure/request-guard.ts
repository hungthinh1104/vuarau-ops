import type { IncomingMessage, ServerResponse } from "node:http";

export type RequestLimits = {
  readonly maxBodyBytes: number;
  readonly windowMs: number;
  readonly authenticatedRequestsPerWindow: number;
  readonly publicRequestsPerWindow: number;
};

type Bucket = { count: number; resetsAt: number };

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  allow(key: string, limit: number, now = Date.now()): boolean {
    if (this.buckets.size >= 10_000) {
      for (const [bucketKey, bucket] of this.buckets) {
        if (bucket.resetsAt <= now) this.buckets.delete(bucketKey);
      }
    }
    const current = this.buckets.get(key);
    if (current === undefined || current.resetsAt <= now) {
      this.buckets.set(key, { count: 1, resetsAt: now + this.windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }
}

const sendRefusal = (res: ServerResponse, status: 413 | 429): void => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(status === 429 ? { "retry-after": "60" } : {}),
  });
  res.end(JSON.stringify({ error: status === 413 ? "request_too_large" : "rate_limited" }));
};

export function safeRequestId(value: string | string[] | undefined, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : fallback;
}

/**
 * Transport guard before health/public/tRPC handlers. It never reads a body and
 * therefore cannot copy transaction data into logs or metrics.
 */
export function createRequestGuard(limits: RequestLimits) {
  const limiter = new FixedWindowRateLimiter(limits.windowMs);
  return (req: IncomingMessage, res: ServerResponse): boolean => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    if (path.startsWith("/health/") || path === "/metrics") return false;

    const declared = req.headers["content-length"];
    if (
      typeof declared === "string" &&
      (!/^\d+$/.test(declared) || Number(declared) > limits.maxBodyBytes)
    ) {
      sendRefusal(res, 413);
      return true;
    }

    const publicSurface = path.startsWith("/public/documents/");
    const remote = req.socket.remoteAddress ?? "unknown";
    const limit = publicSurface
      ? limits.publicRequestsPerWindow
      : limits.authenticatedRequestsPerWindow;
    if (!limiter.allow(`${publicSurface ? "public" : "api"}:${remote}`, limit)) {
      sendRefusal(res, 429);
      return true;
    }

    let received = 0;
    req.on("data", (chunk: Buffer | string) => {
      received += Buffer.byteLength(chunk);
      if (received > limits.maxBodyBytes && !res.headersSent) {
        req.pause();
        sendRefusal(res, 413);
      }
    });
    return false;
  };
}
