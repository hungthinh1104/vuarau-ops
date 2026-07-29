import { describe, expect, it } from "vitest";
import { createServer, request as sendHttpRequest } from "node:http";
import { createRequestGuard, FixedWindowRateLimiter, safeRequestId } from "./request-guard.ts";

describe("M22 request trust boundary", () => {
  it("accepts only bounded printable correlation identifiers", () => {
    expect(safeRequestId("req-1234.alpha", "fallback")).toBe("req-1234.alpha");
    expect(safeRequestId("token\nleak", "fallback")).toBe("fallback");
    expect(safeRequestId("x".repeat(129), "fallback")).toBe("fallback");
  });

  it("rate limits a key within a fixed window and recovers at the boundary", () => {
    const limiter = new FixedWindowRateLimiter(1_000);
    expect(limiter.allow("public:ip", 2, 10_000)).toBe(true);
    expect(limiter.allow("public:ip", 2, 10_100)).toBe(true);
    expect(limiter.allow("public:ip", 2, 10_200)).toBe(false);
    expect(limiter.allow("public:ip", 2, 11_000)).toBe(true);
  });

  it("isolates rate-limit buckets", () => {
    const limiter = new FixedWindowRateLimiter(1_000);
    expect(limiter.allow("workspace-a", 1, 10_000)).toBe(true);
    expect(limiter.allow("workspace-a", 1, 10_001)).toBe(false);
    expect(limiter.allow("workspace-b", 1, 10_001)).toBe(true);
  });

  it("returns 413 for oversized bodies and 429 when a public bucket is exhausted", async () => {
    const guard = createRequestGuard({
      maxBodyBytes: 8,
      windowMs: 60_000,
      authenticatedRequestsPerWindow: 10,
      publicRequestsPerWindow: 1,
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
      expect(await limited.json()).toEqual({ error: "rate_limited" });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });
});
