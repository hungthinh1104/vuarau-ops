import { describe, expect, it } from "vitest";
import type { Database } from "@vuarau/db";
import { checkReadiness } from "./readiness.ts";

describe("M22 readiness failure injection", () => {
  it("fails closed and publishes only the check name when PostgreSQL is unavailable", async () => {
    const database = {
      sql: () => Promise.reject(new Error("postgres://user:secret@private/customer-debt")),
    } as unknown as Database;
    const result = await checkReadiness(database);
    expect(result).toEqual({ ok: false, failing: "database" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("customer-debt");
  });
});
