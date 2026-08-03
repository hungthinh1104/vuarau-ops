import { describe, expect, it, vi } from "vitest";
import { createServer, request as sendHttpRequest } from "node:http";
import {
  createRequestGuard,
  FixedWindowRateLimiter,
  rateLimitClientIdentity,
  retryAfterSeconds,
  safeRequestId,
} from "./request-guard.ts";

describe("Request trust boundary", () => {
  it("accepts only bounded printable correlation identifiers", () => {
    expect(safeRequestId("req-1234.alpha", "fallback")).toBe("req-1234.alpha");
    expect(safeRequestId("token\nleak", "fallback")).toBe("fallback");
    expect(safeRequestId("x".repeat(129), "fallback")).toBe("fallback");
  });

  it("rate limits a key within a fixed window and recovers at the boundary", () => {
    const limiter = new FixedWindowRateLimiter(1_000);
    expect(limiter.allow("public:ip", 2, 10_000).allowed).toBe(true);
    expect(limiter.allow("public:ip", 2, 10_100).allowed).toBe(true);
    expect(limiter.allow("public:ip", 2, 10_200).allowed).toBe(false);
    expect(limiter.allow("public:ip", 2, 11_000).allowed).toBe(true);
  });

  it("uses the socket identity for a direct request", () => {
    expect(rateLimitClientIdentity("192.0.2.10", undefined, [])).toBe("192.0.2.10");
  });

  it("uses one validated forwarded client address from an explicitly trusted peer", () => {
    expect(rateLimitClientIdentity("10.0.0.2", "203.0.113.8", ["10.0.0.2"])).toBe("203.0.113.8");
  });

  it("does not let an untrusted peer spoof a forwarded client address", () => {
    expect(rateLimitClientIdentity("192.0.2.10", "203.0.113.8", ["10.0.0.2"])).toBe("192.0.2.10");
  });

  it("falls back to the trusted peer for malformed or multi-hop forwarded values", () => {
    expect(rateLimitClientIdentity("10.0.0.2", "not-an-ip", ["10.0.0.2"])).toBe("10.0.0.2");
    expect(rateLimitClientIdentity("10.0.0.2", "203.0.113.8, 198.51.100.4", ["10.0.0.2"])).toBe(
      "10.0.0.2",
    );
  });

  it("gives two forwarded clients behind one trusted proxy independent buckets", () => {
    const limiter = new FixedWindowRateLimiter(1_000);
    const first = rateLimitClientIdentity("10.0.0.2", "203.0.113.8", ["10.0.0.2"]);
    const second = rateLimitClientIdentity("10.0.0.2", "203.0.113.9", ["10.0.0.2"]);
    expect(limiter.allow(`api:${first}`, 1, 10_000).allowed).toBe(true);
    expect(limiter.allow(`api:${first}`, 1, 10_001).allowed).toBe(false);
    expect(limiter.allow(`api:${second}`, 1, 10_001).allowed).toBe(true);
  });

  it("isolates public and API buckets for one client", () => {
    const limiter = new FixedWindowRateLimiter(1_000);
    expect(limiter.allow("public:203.0.113.8", 1, 10_000).allowed).toBe(true);
    expect(limiter.allow("public:203.0.113.8", 1, 10_001).allowed).toBe(false);
    expect(limiter.allow("api:203.0.113.8", 1, 10_001).allowed).toBe(true);
  });

  it("calculates Retry-After from a non-default remaining window", () => {
    expect(retryAfterSeconds(12_501, 10_000)).toBe(3);
    expect(retryAfterSeconds(10_000, 10_000)).toBe(1);
  });

  it("returns 413 for oversized bodies and 429 when a public bucket is exhausted", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const guard = createRequestGuard({
      maxBodyBytes: 8,
      windowMs: 2_500,
      authenticatedRequestsPerWindow: 10,
      publicRequestsPerWindow: 1,
      trustedProxyAddresses: [],
    });
    const server = createServer((request, response) => {
      if (guard(request, response)) return;
      if (request.method === "POST") {
        request.on("end", () => {
          if (!response.headersSent) response.writeHead(200).end("ok");
        });
        return;
      }
      response.writeHead(200).end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("No test address.");
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      const oversized = await fetch(`${origin}/trpc/sale.post`, {
        method: "POST",
        body: "123456789",
      });
      expect(oversized.status).toBe(413);
      expect(await oversized.json()).toEqual({ error: "request_too_large" });

      const chunked = await new Promise<{ status: number | undefined; body: string }>(
        (resolve, reject) => {
          const request = sendHttpRequest(
            `${origin}/trpc/sale.post`,
            { method: "POST", headers: { "transfer-encoding": "chunked" } },
            (response) => {
              const chunks: Buffer[] = [];
              response.on("data", (chunk: Buffer) => chunks.push(chunk));
              response.on("end", () =>
                resolve({
                  status: response.statusCode,
                  body: Buffer.concat(chunks).toString("utf8"),
                }),
              );
            },
          );
          request.on("error", reject);
          request.write("1234");
          request.end("56789");
        },
      );
      expect(chunked.status).toBe(413);
      expect(JSON.parse(chunked.body)).toEqual({ error: "request_too_large" });

      expect((await fetch(`${origin}/public/documents/${"x".repeat(32)}`)).status).toBe(200);
      const limited = await fetch(`${origin}/public/documents/${"x".repeat(32)}`);
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("3");
      expect(await limited.json()).toEqual({ error: "rate_limited" });
      expect((await fetch(`${origin}/trpc/customer.search`)).status).toBe(200);
    } finally {
      now.mockRestore();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });
});
