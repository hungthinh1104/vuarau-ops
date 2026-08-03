import { beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDb } from "fake-indexeddb";
import { buildOfflineSaleChain } from "./command-builders.ts";
import { OfflineSyncEngine } from "./sync-engine.ts";
import { OfflineDatabase } from "./database.ts";
import type { OfflinePartition, OutboxRecord } from "./types.ts";

const partition: OfflinePartition = { actorId: "actor-a", workspaceId: "workspace-a" };
const databaseName = "vuarau-offline";

beforeEach(async () => {
  vi.stubGlobal("indexedDB", fakeIndexedDb);
  await new Promise<void>((resolve, reject) => {
    const request = fakeIndexedDb.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("offline test database is blocked"));
  });
});

function chain(saleId: string) {
  return buildOfflineSaleChain({
    partition,
    occurredAt: "2026-07-29T01:02:03.000Z",
    sale: {
      saleId,
      customerId: "customer-a",
      lines: [{ lineId: "line-a" }],
      note: null,
      replacesSaleId: null,
    },
  });
}

class MemoryOfflineStore {
  readonly records = new Map<string, OutboxRecord>();
  successfulSyncs = 0;

  constructor(records: readonly OutboxRecord[]) {
    for (const record of records) this.records.set(record.id, record);
  }

  async commands() {
    return [...this.records.values()];
  }

  async updateCommand(_partition: OfflinePartition, record: OutboxRecord) {
    this.records.set(record.id, record);
  }

  async markSuccessfulSync() {
    this.successfulSyncs += 1;
  }
}

describe("offline Quick Sale outbox", () => {
  it("rebuilds one deterministic chain while keeping queued envelopes immutable", () => {
    const first = chain("sale-a");
    const second = chain("sale-a");

    expect(first.commands.map((command) => command.id)).toEqual(
      second.commands.map((command) => command.id),
    );
    expect(first.commands.map((command) => command.chainId)).toEqual(["sale-a", "sale-a"]);
    expect(first.commands[0]?.envelope.commandId).not.toBe(second.commands[0]?.envelope.commandId);
    expect(first.commands.map((command) => command.sequence)).toEqual([0, 1]);
  });

  it("keeps the editable draft snapshot separate from the parsed server command", () => {
    const draftLines = [
      {
        lineId: "line-a",
        productId: null,
        productName: "Cà chua",
        quantityText: "2",
        unit: "kg",
        unitPriceText: "12000",
        priceOrigin: null,
      },
    ];
    const commandLines = [
      {
        lineId: "line-a",
        productId: null,
        productName: "Cà chua",
        quantity: { valueScaled: 2_000, unit: "kg" },
        unitPrice: { amountMinor: 12_000, currency: "VND" },
      },
    ];
    const built = buildOfflineSaleChain({
      partition,
      occurredAt: "2026-07-29T01:02:03.000Z",
      draftLines,
      sale: {
        saleId: "sale-a",
        customerId: "customer-a",
        lines: commandLines,
        note: null,
        replacesSaleId: null,
      },
    });

    expect(built.draft.lines).toEqual(draftLines);
    expect((built.commands[0]?.envelope.payload as { lines: readonly unknown[] }).lines).toEqual(
      commandLines,
    );
  });

  it("derives a queued draft from its pending outbox chain after an autosave race", async () => {
    const built = chain("sale-a");
    const database = new OfflineDatabase();
    await database.acceptSale({ partition, ...built });
    await database.saveDraft(partition, { ...built.draft, syncState: "local" });

    await expect(database.draft(partition, "sale-a")).resolves.toMatchObject({
      saleId: "sale-a",
      syncState: "queued",
    });
  });

  it("runs FIFO inside a chain and retries an unknown outcome with the same identity", async () => {
    const built = chain("sale-a");
    const store = new MemoryOfflineStore(built.commands);
    const sent: string[] = [];
    let dropped = true;
    const sender = vi.fn(
      async (_kind: OutboxRecord["kind"], envelope: OutboxRecord["envelope"]) => {
        sent.push(envelope.commandId);
        if (dropped) {
          dropped = false;
          throw new TypeError("network response dropped");
        }
        return { id: "canonical" };
      },
    );
    const engine = new OfflineSyncEngine(store as unknown as OfflineDatabase, sender, () => null);

    await engine.sync(partition);
    expect([...store.records.values()].map((record) => record.state)).toEqual([
      "retry_wait",
      "queued",
    ]);
    await engine.sync(partition);

    expect(sent[0]).toBe(sent[1]);
    expect([...store.records.values()].map((record) => record.state)).toEqual([
      "confirmed",
      "confirmed",
    ]);
    expect(store.successfulSyncs).toBe(1);
  });

  it("blocks downstream work after a definite conflict", async () => {
    const built = chain("sale-a");
    const store = new MemoryOfflineStore(built.commands);
    const engine = new OfflineSyncEngine(
      store as unknown as OfflineDatabase,
      async () => {
        throw new Error("conflict");
      },
      () => ({
        code: "SALE_VERSION_CONFLICT",
        message: "stale",
        details: {},
        retryable: false,
      }),
    );

    await engine.sync(partition);

    expect([...store.records.values()].map((record) => record.state)).toEqual([
      "blocked",
      "queued",
    ]);
    expect(store.successfulSyncs).toBe(0);
  });

  it("keeps independent actors and workspaces in separate partitions", () => {
    expect(chain("sale-a").draft).toMatchObject(partition);
    expect(
      buildOfflineSaleChain({
        ...chain("unused"),
        partition: { actorId: "actor-b", workspaceId: "workspace-b" },
        occurredAt: "2026-07-29T01:02:03.000Z",
        sale: {
          saleId: "sale-b",
          customerId: "customer-b",
          lines: [],
          note: null,
          replacesSaleId: null,
        },
      }).draft,
    ).toMatchObject({ actorId: "actor-b", workspaceId: "workspace-b" });
  });

  it("runs independent chains concurrently while preserving FIFO inside each chain", async () => {
    const records = [...chain("sale-a").commands, ...chain("sale-b").commands];
    const store = new MemoryOfflineStore(records);
    let active = 0;
    let maximum = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const observed: string[] = [];
    const sender = vi.fn(
      async (_kind: OutboxRecord["kind"], envelope: OutboxRecord["envelope"]) => {
        active += 1;
        maximum = Math.max(maximum, active);
        observed.push(String((envelope.payload as { saleId?: string }).saleId ?? "draft"));
        await gate;
        active -= 1;
        return { id: "canonical" };
      },
    );
    const engine = new OfflineSyncEngine(
      store as unknown as OfflineDatabase,
      sender,
      () => null,
      2,
    );

    const syncing = engine.sync(partition);
    await vi.waitFor(() => expect(maximum).toBe(2));
    release();
    await syncing;

    expect(maximum).toBe(2);
    expect([...store.records.values()].every((record) => record.state === "confirmed")).toBe(true);
    expect(observed).toHaveLength(4);
  });

  it("does not retry a definite authorization rejection", async () => {
    const store = new MemoryOfflineStore(chain("sale-a").commands);
    const sender = vi.fn(async () => {
      throw new Error("permission revoked");
    });
    const engine = new OfflineSyncEngine(store as unknown as OfflineDatabase, sender, () => ({
      code: "PERMISSION_DENIED",
      message: "revoked",
      details: {},
      retryable: false,
    }));

    await engine.sync(partition);
    await engine.sync(partition);

    expect(sender).toHaveBeenCalledTimes(1);
    expect([...store.records.values()].map((record) => record.state)).toEqual([
      "rejected",
      "queued",
    ]);
  });

  it("upgrades a V1 database without deleting a pending command", async () => {
    const pending = chain("sale-a").commands[0]!;
    await new Promise<void>((resolve, reject) => {
      const request = fakeIndexedDb.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        const outbox = database.createObjectStore("outbox", { keyPath: "storageKey" });
        outbox.createIndex("partition", "partition");
        outbox.createIndex("chain", ["partition", "chainId", "sequence"]);
        database
          .createObjectStore("drafts", { keyPath: "storageKey" })
          .createIndex("partition", "partition");
        database
          .createObjectStore("customers", { keyPath: "storageKey" })
          .createIndex("partition", "partition");
        database
          .createObjectStore("products", { keyPath: "storageKey" })
          .createIndex("partition", "partition");
        database.createObjectStore("meta", { keyPath: "key" });
        outbox.put({
          ...pending,
          storageKey: `${partition.actorId}:${partition.workspaceId}:${pending.id}`,
          partition: `${partition.actorId}:${partition.workspaceId}`,
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const database = new OfflineDatabase();
    expect(await database.commands(partition)).toEqual([pending]);
  });
});
