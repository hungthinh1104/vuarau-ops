"use client";

import { useMutation } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { SessionDto, WorkspaceId } from "@vuarau/domain-contracts";
import { useTRPC } from "../api/providers.tsx";
import { domainErrorOf } from "../api/domain-error.ts";
import { OfflineDatabase, requestPersistentStorage } from "./database.ts";
import { buildOfflineSaleChain } from "./command-builders.ts";
import { OfflineSyncEngine } from "./sync-engine.ts";
import type {
  CachedCustomer,
  CachedProduct,
  OfflinePartition,
  OfflineSaleDraft,
  OutboxRecord,
} from "./types.ts";

type QueueSaleInput = Parameters<typeof buildOfflineSaleChain>[0];

type OfflineContextValue = {
  readonly partition: OfflinePartition;
  readonly commands: readonly OutboxRecord[];
  readonly queuedCount: number;
  readonly blockedCount: number;
  readonly lastSuccessfulSync: string | null;
  readonly queueSale: (
    input: Omit<QueueSaleInput, "partition">,
  ) => Promise<readonly OutboxRecord[]>;
  readonly saveDraft: (draft: OfflineSaleDraft) => Promise<void>;
  readonly loadDraft: (saleId: string) => Promise<OfflineSaleDraft | null>;
  readonly cacheCustomers: (customers: readonly CachedCustomer[]) => Promise<void>;
  readonly cachedCustomers: () => Promise<readonly CachedCustomer[]>;
  readonly cacheProducts: (products: readonly CachedProduct[]) => Promise<void>;
  readonly cachedProducts: () => Promise<readonly CachedProduct[]>;
  readonly retry: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOffline(): OfflineContextValue {
  const value = useContext(OfflineContext);
  if (value === null) throw new Error("useOffline() outside OfflineProvider");
  return value;
}

export function OfflineProvider(props: {
  readonly session: SessionDto;
  readonly workspaceId: WorkspaceId;
  readonly children: ReactNode;
}) {
  const trpc = useTRPC();
  const database = useMemo(() => new OfflineDatabase(), []);
  const partition = useMemo(
    () => ({ actorId: props.session.actorId, workspaceId: props.workspaceId }),
    [props.session.actorId, props.workspaceId],
  );
  const { mutateAsync: createCustomer } = useMutation(trpc.customer.create.mutationOptions());
  const { mutateAsync: createDraft } = useMutation(trpc.sale.createDraft.mutationOptions());
  const { mutateAsync: postSale } = useMutation(trpc.sale.post.mutationOptions());
  const [commands, setCommands] = useState<readonly OutboxRecord[]>([]);
  const [lastSuccessfulSync, setLastSuccessfulSync] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextCommands, lastSync] = await Promise.all([
      database.commands(partition),
      database.lastSuccessfulSync(partition),
    ]);
    setCommands(nextCommands);
    setLastSuccessfulSync(lastSync);
  }, [database, partition]);

  const engine = useMemo(
    () =>
      new OfflineSyncEngine(
        database,
        async (kind, envelope) => {
          if (kind === "customer.create") return createCustomer(envelope as never);
          if (kind === "sale.createDraft") return createDraft(envelope as never);
          return postSale(envelope as never);
        },
        domainErrorOf,
      ),
    [createCustomer, createDraft, database, postSale],
  );

  const retry = useCallback(async () => {
    await engine.sync(partition);
    await refresh();
  }, [engine, partition, refresh]);

  useEffect(() => {
    void requestPersistentStorage();
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const synchronize = () => void retry();
    window.addEventListener("online", synchronize);
    window.addEventListener("focus", synchronize);
    if (navigator.onLine) synchronize();
    return () => {
      window.removeEventListener("online", synchronize);
      window.removeEventListener("focus", synchronize);
    };
  }, [retry]);

  const queueSale = useCallback(
    async (input: Omit<QueueSaleInput, "partition">) => {
      const chain = buildOfflineSaleChain({ ...input, partition });
      await database.acceptSale({ partition, ...chain });
      await refresh();
      return chain.commands;
    },
    [database, partition, refresh],
  );
  const saveDraft = useCallback(
    (draft: OfflineSaleDraft) => database.saveDraft(partition, draft),
    [database, partition],
  );
  const loadDraft = useCallback(
    (saleId: string) => database.draft(partition, saleId),
    [database, partition],
  );
  const cacheCustomers = useCallback(
    (customers: readonly CachedCustomer[]) => database.cacheCustomers(partition, customers),
    [database, partition],
  );
  const cachedCustomers = useCallback(() => database.customers(partition), [database, partition]);
  const cacheProducts = useCallback(
    (products: readonly CachedProduct[]) => database.cacheProducts(partition, products),
    [database, partition],
  );
  const cachedProducts = useCallback(() => database.products(partition), [database, partition]);

  const value: OfflineContextValue = useMemo(
    () => ({
      partition,
      commands,
      queuedCount: commands.filter((record) =>
        ["queued", "syncing", "retry_wait"].includes(record.state),
      ).length,
      blockedCount: commands.filter((record) => ["blocked", "rejected"].includes(record.state))
        .length,
      lastSuccessfulSync,
      queueSale,
      saveDraft,
      loadDraft,
      cacheCustomers,
      cachedCustomers,
      cacheProducts,
      cachedProducts,
      retry,
    }),
    [
      cacheCustomers,
      cacheProducts,
      cachedCustomers,
      cachedProducts,
      commands,
      lastSuccessfulSync,
      loadDraft,
      partition,
      queueSale,
      retry,
      saveDraft,
    ],
  );

  return <OfflineContext.Provider value={value}>{props.children}</OfflineContext.Provider>;
}
