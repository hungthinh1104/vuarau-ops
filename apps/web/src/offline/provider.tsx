"use client";

import { useMutation } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createCustomerCommandSchema,
  createSaleDraftCommandSchema,
  postSaleCommandSchema,
  recordCustomerPaymentCommandSchema,
  type SessionDto,
  type WorkspaceId,
} from "@vuarau/domain-contracts";
import { useTRPC } from "@/api/providers.tsx";
import { domainErrorOf } from "@/api/domain-error.ts";
import { OfflineDatabase, requestPersistentStorage } from "./database.ts";
import { buildOfflinePaymentCommand, buildOfflineSaleChain } from "./command-builders.ts";
import { OfflineSyncEngine } from "./sync-engine.ts";
import type {
  CachedCustomer,
  CachedProduct,
  CachedQualityGrade,
  OfflinePartition,
  OfflinePaymentDraft,
  OfflineSaleDraft,
  OutboxRecord,
} from "./types.ts";

type QueueSaleInput = Parameters<typeof buildOfflineSaleChain>[0];
type QueuePaymentInput = Parameters<typeof buildOfflinePaymentCommand>[0];

type OfflineContextValue = {
  readonly partition: OfflinePartition;
  readonly commands: readonly OutboxRecord[];
  readonly queuedCount: number;
  readonly blockedCount: number;
  readonly lastSuccessfulSync: string | null;
  readonly queueSale: (
    input: Omit<QueueSaleInput, "partition">,
  ) => Promise<readonly OutboxRecord[]>;
  readonly queuePayment: (input: Omit<QueuePaymentInput, "partition">) => Promise<OutboxRecord>;
  readonly loadPaymentDraft: (paymentId: string) => Promise<OfflinePaymentDraft | null>;
  readonly saveDraft: (draft: OfflineSaleDraft) => Promise<void>;
  readonly loadDraft: (saleId: string) => Promise<OfflineSaleDraft | null>;
  readonly cacheCustomers: (customers: readonly CachedCustomer[]) => Promise<void>;
  readonly cachedCustomers: () => Promise<readonly CachedCustomer[]>;
  readonly cacheProducts: (products: readonly CachedProduct[]) => Promise<void>;
  readonly replaceProducts: (
    snapshotKey: string,
    products: readonly CachedProduct[],
  ) => Promise<void>;
  readonly cachedProducts: (snapshotKey?: string) => Promise<readonly CachedProduct[]>;
  readonly cacheQualityGrades: (grades: readonly CachedQualityGrade[]) => Promise<void>;
  readonly replaceQualityGrades: (
    snapshotKey: string,
    grades: readonly CachedQualityGrade[],
  ) => Promise<void>;
  readonly cachedQualityGrades: (snapshotKey?: string) => Promise<readonly CachedQualityGrade[]>;
  readonly retry: () => Promise<void>;
  readonly retryBlockedCommand: (commandId: string) => Promise<void>;
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
  const { mutateAsync: recordPayment } = useMutation(trpc.payment.record.mutationOptions());
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
          if (kind === "customer.create")
            return createCustomer(createCustomerCommandSchema.parse(envelope));
          if (kind === "sale.createDraft")
            return createDraft(createSaleDraftCommandSchema.parse(envelope));
          if (kind === "sale.post") return postSale(postSaleCommandSchema.parse(envelope));
          return recordPayment(recordCustomerPaymentCommandSchema.parse(envelope));
        },
        domainErrorOf,
      ),
    [createCustomer, createDraft, database, postSale, recordPayment],
  );

  const retry = useCallback(async () => {
    await engine.sync(partition);
    await refresh();
  }, [engine, partition, refresh]);
  const retryBlockedCommand = useCallback(
    async (commandId: string) => {
      await database.retryCommand(partition, commandId);
      await retry();
    },
    [database, partition, retry],
  );

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

  useEffect(() => {
    const retryTimer = setInterval(() => {
      if (commands.some((record) => record.state === "retry_wait")) void retry();
    }, 5_000);
    return () => clearInterval(retryTimer);
  }, [commands, retry]);

  const queueSale = useCallback(
    async (input: Omit<QueueSaleInput, "partition">) => {
      const chain = buildOfflineSaleChain({ ...input, partition });
      await database.acceptSale({ partition, ...chain });
      await refresh();
      return chain.commands;
    },
    [database, partition, refresh],
  );
  const queuePayment = useCallback(
    async (input: Omit<QueuePaymentInput, "partition">) => {
      const built = buildOfflinePaymentCommand({ ...input, partition });
      await database.acceptPayment({ partition, ...built });
      await refresh();
      return built.command;
    },
    [database, partition, refresh],
  );
  const loadPaymentDraft = useCallback(
    (paymentId: string) => database.paymentDraft(partition, paymentId),
    [database, partition],
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
  const cachedProducts = useCallback(
    (snapshotKey?: string) => database.products(partition, snapshotKey),
    [database, partition],
  );
  const replaceProducts = useCallback(
    (snapshotKey: string, products: readonly CachedProduct[]) =>
      database.replaceProducts(partition, snapshotKey, products),
    [database, partition],
  );
  const cacheQualityGrades = useCallback(
    (grades: readonly CachedQualityGrade[]) => database.cacheQualityGrades(partition, grades),
    [database, partition],
  );
  const cachedQualityGrades = useCallback(
    (snapshotKey?: string) => database.qualityGrades(partition, snapshotKey),
    [database, partition],
  );
  const replaceQualityGrades = useCallback(
    (snapshotKey: string, grades: readonly CachedQualityGrade[]) =>
      database.replaceQualityGrades(partition, snapshotKey, grades),
    [database, partition],
  );

  const value: OfflineContextValue = useMemo(
    () => ({
      partition,
      commands,
      queuedCount: commands.filter((record) =>
        ["queued", "syncing", "retry_wait"].includes(record.state),
      ).length,
      blockedCount: commands.filter((record) =>
        ["blocked", "dependency_blocked", "rejected"].includes(record.state),
      ).length,
      lastSuccessfulSync,
      queueSale,
      queuePayment,
      loadPaymentDraft,
      saveDraft,
      loadDraft,
      cacheCustomers,
      cachedCustomers,
      cacheProducts,
      replaceProducts,
      cachedProducts,
      cacheQualityGrades,
      replaceQualityGrades,
      cachedQualityGrades,
      retry,
      retryBlockedCommand,
    }),
    [
      cacheCustomers,
      cacheProducts,
      replaceProducts,
      cachedCustomers,
      cachedProducts,
      cacheQualityGrades,
      replaceQualityGrades,
      cachedQualityGrades,
      commands,
      lastSuccessfulSync,
      loadDraft,
      loadPaymentDraft,
      partition,
      queuePayment,
      queueSale,
      retry,
      retryBlockedCommand,
      saveDraft,
    ],
  );

  return <OfflineContext.Provider value={value}>{props.children}</OfflineContext.Provider>;
}
