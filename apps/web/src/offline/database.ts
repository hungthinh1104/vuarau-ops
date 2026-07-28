import type {
  CachedCustomer,
  CachedProduct,
  OfflinePartition,
  OfflineSaleDraft,
  OutboxRecord,
} from "./types.ts";
import { OFFLINE_DATABASE_VERSION, partitionKey, recordKey } from "./types.ts";

const DATABASE_NAME = "vuarau-offline";
const OUTBOX = "outbox";
const DRAFTS = "drafts";
const CUSTOMERS = "customers";
const PRODUCTS = "products";
const META = "meta";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, OFFLINE_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      let outbox: IDBObjectStore;
      if (!database.objectStoreNames.contains(OUTBOX)) {
        outbox = database.createObjectStore(OUTBOX, { keyPath: "storageKey" });
        outbox.createIndex("partition", "partition");
        outbox.createIndex("chain", ["partition", "chainId", "sequence"]);
      } else {
        outbox = request.transaction!.objectStore(OUTBOX);
      }
      // V2 adds an operational lookup without rebuilding the store. Pending V1
      // envelopes remain byte-for-byte intact while the index is populated by
      // IndexedDB as part of the schema upgrade transaction.
      if (!outbox.indexNames.contains("partitionState")) {
        outbox.createIndex("partitionState", ["partition", "state"]);
      }
      if (!database.objectStoreNames.contains(DRAFTS)) {
        const store = database.createObjectStore(DRAFTS, { keyPath: "storageKey" });
        store.createIndex("partition", "partition");
      }
      if (!database.objectStoreNames.contains(CUSTOMERS)) {
        const store = database.createObjectStore(CUSTOMERS, { keyPath: "storageKey" });
        store.createIndex("partition", "partition");
      }
      if (!database.objectStoreNames.contains(PRODUCTS)) {
        const store = database.createObjectStore(PRODUCTS, { keyPath: "storageKey" });
        store.createIndex("partition", "partition");
      }
      if (!database.objectStoreNames.contains(META)) {
        database.createObjectStore(META, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open offline storage"));
  });
}

type Stored<T> = T & { readonly storageKey: string; readonly partition: string };

function stored<T extends object>(partition: OfflinePartition, id: string, value: T): Stored<T> {
  return {
    ...value,
    storageKey: recordKey(partition, id),
    partition: partitionKey(partition),
  };
}

function stripStorage<T extends object>(value: Stored<T>): T {
  const { storageKey: _storageKey, partition: _partition, ...record } = value;
  return record as T;
}

export class OfflineDatabase {
  async acceptSale(args: {
    partition: OfflinePartition;
    draft: OfflineSaleDraft;
    commands: readonly OutboxRecord[];
  }): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction([DRAFTS, OUTBOX], "readwrite");
    const outbox = transaction.objectStore(OUTBOX);
    const first = args.commands[0];
    const exists =
      first === undefined
        ? undefined
        : await requestResult(outbox.get(recordKey(args.partition, first.id)));
    if (exists === undefined) {
      transaction.objectStore(DRAFTS).put(stored(args.partition, args.draft.saleId, args.draft));
      for (const command of args.commands) {
        outbox.add(stored(args.partition, command.id, command));
      }
    }
    await transactionDone(transaction);
    database.close();
  }

  async saveDraft(partition: OfflinePartition, draft: OfflineSaleDraft): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(DRAFTS, "readwrite");
    transaction.objectStore(DRAFTS).put(stored(partition, draft.saleId, draft));
    await transactionDone(transaction);
    database.close();
  }

  async draft(partition: OfflinePartition, saleId: string): Promise<OfflineSaleDraft | null> {
    const database = await openDatabase();
    const row = await requestResult(
      database.transaction(DRAFTS).objectStore(DRAFTS).get(recordKey(partition, saleId)),
    );
    database.close();
    return row === undefined ? null : stripStorage(row as Stored<OfflineSaleDraft>);
  }

  async commands(partition: OfflinePartition): Promise<readonly OutboxRecord[]> {
    const database = await openDatabase();
    const rows = await requestResult(
      database
        .transaction(OUTBOX)
        .objectStore(OUTBOX)
        .index("partition")
        .getAll(partitionKey(partition)),
    );
    database.close();
    return (rows as Stored<OutboxRecord>[])
      .map(stripStorage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sequence - b.sequence);
  }

  async updateCommand(partition: OfflinePartition, record: OutboxRecord): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(OUTBOX, "readwrite");
    transaction.objectStore(OUTBOX).put(stored(partition, record.id, record));
    await transactionDone(transaction);
    database.close();
  }

  async cacheCustomers(
    partition: OfflinePartition,
    customers: readonly CachedCustomer[],
  ): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(CUSTOMERS, "readwrite");
    const store = transaction.objectStore(CUSTOMERS);
    for (const customer of customers) {
      store.put(stored(partition, customer.customerId, customer));
    }
    await transactionDone(transaction);
    database.close();
  }

  async customers(partition: OfflinePartition): Promise<readonly CachedCustomer[]> {
    const database = await openDatabase();
    const rows = await requestResult(
      database
        .transaction(CUSTOMERS)
        .objectStore(CUSTOMERS)
        .index("partition")
        .getAll(partitionKey(partition)),
    );
    database.close();
    return (rows as Stored<CachedCustomer>[]).map(stripStorage);
  }

  async cacheProducts(
    partition: OfflinePartition,
    products: readonly CachedProduct[],
  ): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(PRODUCTS, "readwrite");
    const store = transaction.objectStore(PRODUCTS);
    for (const product of products) store.put(stored(partition, product.productId, product));
    await transactionDone(transaction);
    database.close();
  }

  async products(partition: OfflinePartition): Promise<readonly CachedProduct[]> {
    const database = await openDatabase();
    const rows = await requestResult(
      database
        .transaction(PRODUCTS)
        .objectStore(PRODUCTS)
        .index("partition")
        .getAll(partitionKey(partition)),
    );
    database.close();
    return (rows as Stored<CachedProduct>[]).map(stripStorage);
  }

  async lastSuccessfulSync(partition: OfflinePartition): Promise<string | null> {
    const database = await openDatabase();
    const row = await requestResult(
      database
        .transaction(META)
        .objectStore(META)
        .get(`last-sync:${partitionKey(partition)}`),
    );
    database.close();
    return (row as { value?: string } | undefined)?.value ?? null;
  }

  async markSuccessfulSync(partition: OfflinePartition, instant: string): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(META, "readwrite");
    transaction
      .objectStore(META)
      .put({ key: `last-sync:${partitionKey(partition)}`, value: instant });
    await transactionDone(transaction);
    database.close();
  }
}

export function requestPersistentStorage(): Promise<boolean> {
  return navigator.storage?.persist?.() ?? Promise.resolve(false);
}
