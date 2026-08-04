import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";

export type RequestLimits = {
  readonly maxBodyBytes: number;
  readonly windowMs: number;
  readonly authenticatedRequestsPerWindow: number;
  readonly publicRequestsPerWindow: number;
  readonly trustedProxyAddresses: readonly string[];
};

type Bucket = { count: number; resetsAt: number };
export type RateLimitDecision = { readonly allowed: boolean; readonly resetsAt: number };
const MAX_BUCKETS = 10_000;

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly windowMs: number;

  constructor(
    windowMs: number,
    private readonly maxBuckets = MAX_BUCKETS,
  ) {
    this.windowMs = windowMs;
  }

  get size(): number {
    return this.buckets.size;
  }

  allow(key: string, limit: number, now = Date.now()): RateLimitDecision {
    if (this.buckets.size >= this.maxBuckets) {
      for (const [bucketKey, bucket] of this.buckets) {
        if (bucket.resetsAt <= now) this.buckets.delete(bucketKey);
      }
    }
    if (this.buckets.size >= this.maxBuckets && !this.buckets.has(key)) {
      let oldestKey: string | undefined;
      let oldestReset = Number.POSITIVE_INFINITY;
      for (const [bucketKey, bucket] of this.buckets) {
        if (bucket.resetsAt < oldestReset) {
          oldestKey = bucketKey;
          oldestReset = bucket.resetsAt;
        }
      }
      if (oldestKey !== undefined) this.buckets.delete(oldestKey);
    }
    const current = this.buckets.get(key);
    if (current === undefined || current.resetsAt <= now) {
      const resetsAt = now + this.windowMs;
      this.buckets.set(key, { count: 1, resetsAt });
      return { allowed: true, resetsAt };
    }
    if (current.count >= limit) return { allowed: false, resetsAt: current.resetsAt };
    current.count += 1;
    return { allowed: true, resetsAt: current.resetsAt };
  }
}

const normalizeAddress = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("::ffff:") && isIP(trimmed.slice(7)) === 4 ? trimmed.slice(7) : trimmed;
};

export function rateLimitClientIdentity(
  socketAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustedProxyAddresses: readonly string[],
): string {
  const peer = socketAddress === undefined ? "unknown" : normalizeAddress(socketAddress);
  const trusted = trustedProxyAddresses.some((address) => normalizeAddress(address) === peer);
  if (!trusted || typeof forwardedFor !== "string" || forwardedFor.includes(",")) return peer;
  const forwarded = normalizeAddress(forwardedFor);
  return isIP(forwarded) === 0 ? peer : forwarded;
}

export function retryAfterSeconds(resetsAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetsAt - now) / 1_000));
}

const sendRefusal = (
  res: ServerResponse,
  status: 413 | 429,
  retryAfter?: number,
  afterSend?: () => void,
): void => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(status === 429 && retryAfter !== undefined ? { "retry-after": String(retryAfter) } : {}),
  });
  res.end(
    JSON.stringify({ error: status === 413 ? "request_too_large" : "rate_limited" }),
    afterSend,
  );
};

export function safeRequestId(value: string | string[] | undefined, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : fallback;
}

/**
 * Transport guard before health/public/tRPC handlers. It counts request-body
 * bytes without retaining or logging their contents.
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
    const identity = rateLimitClientIdentity(
      req.socket.remoteAddress,
      req.headers["x-forwarded-for"],
      limits.trustedProxyAddresses,
    );
    const limit = publicSurface
      ? limits.publicRequestsPerWindow
      : limits.authenticatedRequestsPerWindow;
    const now = Date.now();
    const decision = limiter.allow(`${publicSurface ? "public" : "api"}:${identity}`, limit, now);
    if (!decision.allowed) {
      sendRefusal(res, 429, retryAfterSeconds(decision.resetsAt, now));
      return true;
    }

    queueMicrotask(() => {
      let received = 0;
      req.on("data", (chunk: Buffer | string) => {
        received += Buffer.byteLength(chunk);
        if (received > limits.maxBodyBytes && !res.headersSent) {
          sendRefusal(res, 413, undefined, () => req.destroy());
        }
      });
    });
    return false;
  };
}
