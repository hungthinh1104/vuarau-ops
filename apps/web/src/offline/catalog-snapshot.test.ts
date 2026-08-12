import { describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDb } from "fake-indexeddb";
import { OfflineDatabase } from "./database.ts";

vi.stubGlobal("indexedDB", fakeIndexedDb);

describe("offline catalog snapshots", () => {
  it("replace a query snapshot atomically and keep partitions isolated", async () => {
    const database = new OfflineDatabase();
    const first = { actorId: "actor-a", workspaceId: "workspace-a" };
    const second = { actorId: "actor-b", workspaceId: "workspace-b" };
    await database.replaceProducts(first, "quick-sale:cà chua", [
      {
        productId: "product-a",
        actorId: first.actorId,
        workspaceId: first.workspaceId,
        displayName: "Cà chua",
        aliases: [],
        preferredUnit: "kg",
        fetchedAt: "2026-08-13T01:00:00.000Z",
      },
    ]);
    await database.replaceProducts(first, "quick-sale:cà chua", []);
    await database.replaceProducts(second, "quick-sale:cà chua", [
      {
        productId: "product-b",
        actorId: second.actorId,
        workspaceId: second.workspaceId,
        displayName: "Cà chua của B",
        aliases: [],
        preferredUnit: "kg",
        fetchedAt: "2026-08-13T01:00:00.000Z",
      },
    ]);

    await expect(database.products(first, "quick-sale:cà chua")).resolves.toEqual([]);
    await expect(database.products(second, "quick-sale:cà chua")).resolves.toMatchObject([
      { productId: "product-b" },
    ]);
  });
});
