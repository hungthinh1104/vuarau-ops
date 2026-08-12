import { beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDb } from "fake-indexeddb";
import { buildOfflinePaymentCommand, buildOfflineSaleChain } from "./command-builders.ts";
import { OfflineSyncEngine } from "./sync-engine.ts";
import { OfflineDatabase } from "./database.ts";
import type { CustomerId, PaymentId } from "@vuarau/domain-contracts";
import { recordKey, type OfflinePartition, type OutboxRecord } from "./types.ts";

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

function payment(paymentId = "payment-a") {
  return buildOfflinePaymentCommand({
    partition,
    occurredAt: "2026-07-29T01:02:03.000Z",
    payment: {
      paymentId: paymentId as PaymentId,
      customerId: "customer-a" as CustomerId,
      amount: { amountMinor: 125_000, currency: "VND" },
      method: "cash",
      payerName: null,
      note: "Thu tại quầy",
      evidenceReferences: [],
    },
  });
}

async function deleteStored(storeName: "drafts" | "outbox" | "payment-drafts", key: string) {
  await new Promise<void>((resolve, reject) => {
    const request = fakeIndexedDb.open(databaseName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(key);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error("offline test delete failed"));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error("offline test delete aborted"));
      };
    };
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

// TC-OFFLINE-001
describe("offline Quick Sale outbox", () => {
  it("freezes an offline payment as one partitioned, replayable command", async () => {
    const built = payment();
    const database = new OfflineDatabase();
    await database.acceptPayment({ partition, ...built });

    await expect(database.commands(partition)).resolves.toMatchObject([
      {
        id: "payment-a:0",
        chainId: "payment-a",
        kind: "payment.record",
        state: "queued",
        envelope: {
          payload: built.command.envelope.payload,
          occurredAt: "2026-07-29T01:02:03.000Z",
        },
      },
    ]);
    await expect(database.paymentDraft(partition, "payment-a")).resolves.toMatchObject({
      paymentId: "payment-a",
      syncState: "queued",
      payload: { amount: { amountMinor: 125_000, currency: "VND" } },
    });
  });

  it("repairs missing payment draft and command records without resetting confirmed state", async () => {
    const built = payment("payment-repair");
    const database = new OfflineDatabase();
    await database.acceptPayment({ partition, ...built });

    const confirmed = { ...built.command, state: "confirmed" as const, result: { id: "payment" } };
    await database.updateCommand(partition, confirmed);
    await deleteStored("payment-drafts", recordKey(partition, built.draft.paymentId));
    await database.acceptPayment({ partition, ...built });

    await expect(database.paymentDraft(partition, built.draft.paymentId)).resolves.toMatchObject({
      paymentId: built.draft.paymentId,
      syncState: "confirmed",
    });

    await deleteStored("outbox", recordKey(partition, built.command.id));
    await database.acceptPayment({ partition, ...built });
    await expect(database.commands(partition)).resolves.toMatchObject([
      { id: built.command.id, state: "queued" },
    ]);
  });

  it("replays an offline payment with the same identity and no second effect", async () => {
    const built = payment();
    const store = new MemoryOfflineStore([built.command]);
    const sender = vi.fn(
      async (_kind: OutboxRecord["kind"], envelope: OutboxRecord["envelope"]) => ({
        id: "payment-a",
        commandId: envelope.commandId,
      }),
    );
    const engine = new OfflineSyncEngine(store as unknown as OfflineDatabase, sender, () => null);

    await engine.sync(partition);
    await engine.sync(partition);

    expect(sender).toHaveBeenCalledOnce();
    expect(sender).toHaveBeenCalledWith("payment.record", built.command.envelope);
    expect([...store.records.values()]).toMatchObject([
      { id: "payment-a:0", state: "confirmed", result: { id: "payment-a" } },
    ]);
  });

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

  it("retains the customer snapshot needed to reopen a queued sale offline", () => {
    const snapshot = {
      customer: { id: "customer-a", displayName: "Khách A" },
      balance: { amountMinor: 0, currency: "VND" },
    } as never;
    const built = buildOfflineSaleChain({
      partition,
      occurredAt: "2026-07-29T01:02:03.000Z",
      sale: {
        saleId: "sale-a",
        customerId: "customer-a",
        lines: [{ lineId: "line-a" }],
        note: null,
        replacesSaleId: null,
        customerSnapshot: snapshot,
      },
    });

    expect(built.draft.customerSnapshot).toBe(snapshot);
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

  it("repairs a partial sale chain without overwriting an existing command result", async () => {
    const built = chain("sale-repair");
    const database = new OfflineDatabase();
    await database.acceptSale({ partition, ...built });

    const first = (await database.commands(partition))[0]!;
    await database.updateCommand(partition, {
      ...first,
      state: "confirmed",
      result: { id: "sale-draft" },
    });
    await deleteStored("outbox", recordKey(partition, built.commands[1]!.id));
    await deleteStored("drafts", recordKey(partition, built.draft.saleId));

    await database.acceptSale({ partition, ...built });

    await expect(database.commands(partition)).resolves.toMatchObject([
      { id: built.commands[0]!.id, state: "confirmed", result: { id: "sale-draft" } },
      { id: built.commands[1]!.id, state: "queued" },
    ]);
    await expect(database.draft(partition, built.draft.saleId)).resolves.toMatchObject({
      saleId: built.draft.saleId,
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
