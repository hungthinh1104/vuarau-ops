import type { OfflinePartition, OfflineSaleDraft, OutboxRecord } from "./types.ts";

function identity(partition: OfflinePartition, occurredAt: string) {
  return {
    commandId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    workspaceId: partition.workspaceId,
    actorId: partition.actorId,
    occurredAt,
  };
}

export function buildOfflineSaleChain(args: {
  partition: OfflinePartition;
  customerCommand?: {
    readonly customerId: string;
    readonly displayName: string;
    readonly phone: string | null;
    readonly note: string | null;
  };
  sale: {
    readonly saleId: string;
    readonly customerId: string;
    readonly lines: readonly unknown[];
    readonly note: string | null;
    /** Optional for legacy callers and V1 IndexedDB drafts. */
    readonly evidenceReferences?: readonly string[];
    readonly replacesSaleId: string | null;
  };
  /** Editable UI snapshot; command lines above are already parsed domain values. */
  draftLines?: readonly unknown[];
  occurredAt: string;
}): { draft: OfflineSaleDraft; commands: readonly OutboxRecord[] } {
  // The aggregate id is also the durable chain id. Rebuilding after a double
  // tap therefore addresses the same IndexedDB records instead of minting a
  // second business intention.
  const chainId = args.sale.saleId;
  const createdAt = new Date().toISOString();
  const commands: OutboxRecord[] = [];
  let sequence = 0;
  const add = (kind: OutboxRecord["kind"], envelope: OutboxRecord["envelope"]): void => {
    commands.push({
      id: `${chainId}:${sequence}`,
      chainId,
      sequence: sequence++,
      kind,
      actorId: args.partition.actorId,
      workspaceId: args.partition.workspaceId,
      envelope,
      createdAt,
      state: "queued",
      attempts: 0,
      lastAttemptAt: null,
      result: null,
      error: null,
    });
  };

  if (args.customerCommand !== undefined) {
    add("customer.create", {
      ...identity(args.partition, args.occurredAt),
      payload: args.customerCommand,
    });
  }
  add("sale.createDraft", {
    ...identity(args.partition, args.occurredAt),
    payload: {
      saleId: args.sale.saleId,
      customerId: args.sale.customerId,
      currency: "VND",
      lines: args.sale.lines,
      note: args.sale.note,
      evidenceReferences: [...(args.sale.evidenceReferences ?? [])],
      dueAt: null,
      replacesSaleId: args.sale.replacesSaleId,
    },
  });
  add("sale.post", {
    ...identity(args.partition, args.occurredAt),
    expectedVersion: 1,
    payload: { saleId: args.sale.saleId },
  });

  return {
    draft: {
      saleId: args.sale.saleId,
      customerId: args.sale.customerId,
      actorId: args.partition.actorId,
      workspaceId: args.partition.workspaceId,
      lines: args.draftLines ?? args.sale.lines,
      note: args.sale.note,
      evidenceReferences: [...(args.sale.evidenceReferences ?? [])],
      occurredAt: args.occurredAt,
      syncState: "queued",
      updatedAt: createdAt,
    },
    commands,
  };
}
