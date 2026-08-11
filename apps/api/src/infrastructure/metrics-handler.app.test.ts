import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { ok } from "@vuarau/domain-kernel";
import { subjectFor, ACTOR_ID } from "@vuarau/test-fixtures";
import { createMetricsHandler } from "./metrics-handler.ts";
import { createHarness } from "../testing/command-test-harness.ts";
import type { JwtVerifier } from "./auth/jwt-verifier.ts";

const verifier: JwtVerifier = {
  verify: async (token) =>
    token === "valid-token"
      ? ok({ subject: subjectFor(ACTOR_ID) })
      : {
          ok: false,
          error: { code: "AUTHENTICATION_INVALID", message: "invalid", retryable: false },
        },
};

async function request(
  handler: ReturnType<typeof createMetricsHandler>,
  headers?: Record<string, string>,
) {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No test address.");
  try {
    return await fetch(
      `http://127.0.0.1:${address.port}/metrics`,
      headers === undefined ? {} : { headers },
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
}

describe("protected metrics endpoint", () => {
  it("rejects missing and invalid credentials without exposing counters", async () => {
    const handler = createMetricsHandler(createHarness().deps, verifier);
    const missing = await request(handler);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "unauthorized" });

    const invalid = await request(handler, { authorization: "Bearer invalid-token" });
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({ error: "unauthorized" });
  });

  it("returns metrics only to a valid provisioned actor", async () => {
    const handler = createMetricsHandler(createHarness().deps, verifier);
    const response = await request(handler, { authorization: "Bearer valid-token" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toContain("vuarau_events_total");
  });
});
