import { randomBytes } from "node:crypto";
import type {
  AccountTimelineEntryDto,
  CreateDocumentShareCommand,
  DocumentDto,
  DocumentPeriod,
  DocumentShareResultDto,
  DocumentSnapshot,
  GenerateDocumentCommand,
  Money,
  RevokeDocumentShareCommand,
  CustomerId,
  DeliveryId,
  IsoInstant,
  PurchaseId,
  SaleId,
} from "@vuarau/domain-contracts";
import {
  classifyBalance,
  createDocumentShareCommandSchema,
  documentSnapshotSchema,
  generateDocumentCommandSchema,
  revokeDocumentShareCommandSchema,
} from "@vuarau/domain-contracts";
import { err, ok } from "@vuarau/domain-kernel";
import { hashPayload } from "../../infrastructure/hash.ts";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";
import type { AccountTimelineRow } from "../../infrastructure/persistence/read-ports.ts";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

function statementEntry(row: AccountTimelineRow): AccountTimelineEntryDto {
  return { ...row, classification: classifyBalance(row.runningBalance) };
}

async function statementEntries(
  repos: Repositories,
  workspaceId: GenerateDocumentCommand["workspaceId"],
  customerId: CustomerId,
  period: DocumentPeriod,
): Promise<readonly AccountTimelineEntryDto[]> {
  const entries: AccountTimelineEntryDto[] = [];
  let after: { sortValue: string; id: string } | null = null;
  do {
    const page = await repos.accountReads.timeline({
      workspaceId,
      customerId,
      from: period.from,
      to: period.to,
      page: { after, limit: 100 },
    });
    entries.push(...page.rows.map(statementEntry));
    after = page.next;
  } while (after !== null);

  return entries.sort(
    (left, right) =>
      left.transactionTime.localeCompare(right.transactionTime) ||
      left.recordedAt.localeCompare(right.recordedAt) ||
      left.id.localeCompare(right.id),
  );
}

async function balanceBeforePeriod(
  repos: Repositories,
  workspaceId: GenerateDocumentCommand["workspaceId"],
  customerId: CustomerId,
  period: DocumentPeriod,
  fallback: Money,
): Promise<Money> {
  if (period.from === null) return { amountMinor: 0, currency: fallback.currency };

  // `accountReads.timeline.to` is intentionally inclusive for user-facing reads.
  // Opening balance is a different boundary: an entry exactly at `from` belongs
  // to the period, not before it. Page backwards until the first strictly older
  // entry rather than subtracting or guessing around an inclusive timestamp.
  let after: { sortValue: string; id: string } | null = null;
  do {
    const page = await repos.accountReads.timeline({
      workspaceId,
      customerId,
      from: null,
      to: period.from,
      page: { after, limit: 100 },
    });
    const prior = page.rows.find(
      (row) => Date.parse(row.transactionTime) < Date.parse(period.from!),
    );
    if (prior !== undefined) return prior.runningBalance;
    after = page.next;
  } while (after !== null);

  return { amountMinor: 0, currency: fallback.currency };
}

async function canonicalSnapshot(
  repos: Repositories,
  command: GenerateDocumentCommand,
): Promise<DocumentSnapshot | null> {
  const { workspaceId } = command;
  const { documentType, sourceType, sourceId } = command.payload;
  const expectedSource = {
    sale_receipt: "sale",
    customer_statement: "customer",
    purchase_order: "purchase",
    delivery_note: "delivery",
  }[documentType];
  if (sourceType !== expectedSource) return null;
  const workspaceName = await repos.workspaces.findName(workspaceId);
  if (workspaceName === null) return null;
  if (documentType === "sale_receipt") {
    const sale = await repos.saleReads.get(workspaceId, sourceId as SaleId);
    if (sale === null || sale.status !== "posted") return null;
    const customer = await repos.customerReads.get(workspaceId, sale.customerId);
    if (customer === null) return null;
    const accountEntry = await repos.accountEntries.findBySource(
      workspaceId,
      "sale_posting",
      sale.id,
    );
    if (accountEntry === null) return null;
    return documentSnapshotSchema.parse({
      kind: "sale_receipt",
      schemaVersion: 1,
      workspace: { id: workspaceId, name: workspaceName },
      customer: customer.customer,
      sale,
      accountEffect: accountEntry,
    });
  }
  if (documentType === "customer_statement") {
    const customer = await repos.customerReads.get(workspaceId, sourceId as CustomerId);
    if (customer === null) return null;
    const period = command.payload.period ?? { from: null, to: null };
    const entries = await statementEntries(repos, workspaceId, customer.customer.id, period);
    const openingBalance =
      entries.length === 0
        ? await balanceBeforePeriod(
            repos,
            workspaceId,
            customer.customer.id,
            period,
            customer.balance,
          )
        : {
            amountMinor: entries[0]!.runningBalance.amountMinor - entries[0]!.amount.amountMinor,
            currency: entries[0]!.amount.currency,
          };
    const periodChange = entries.reduce<Money>(
      (sum, entry) => ({
        amountMinor: sum.amountMinor + entry.amount.amountMinor,
        currency: sum.currency,
      }),
      { amountMinor: 0, currency: openingBalance.currency },
    );
    const closingBalance = {
      amountMinor: openingBalance.amountMinor + periodChange.amountMinor,
      currency: openingBalance.currency,
    };
    return documentSnapshotSchema.parse({
      kind: "customer_statement",
      schemaVersion: 1,
      workspace: { id: workspaceId, name: workspaceName },
      customer: customer.customer,
      period,
      openingBalance,
      entries,
      periodChange,
      closingBalance,
      classification: classifyBalance(closingBalance),
    });
  }
  if (documentType === "purchase_order") {
    const purchase = await repos.purchaseReads.get(workspaceId, sourceId as PurchaseId);
    if (purchase === null) return null;
    const supplier = await repos.supplierReads.get(workspaceId, purchase.supplierId);
    if (supplier === null) return null;
    return documentSnapshotSchema.parse({
      kind: "purchase_order",
      schemaVersion: 1,
      workspace: { id: workspaceId, name: workspaceName },
      supplier,
      purchase,
    });
  }
  const delivery = await repos.deliveryReads.get(workspaceId, sourceId as DeliveryId);
  if (delivery === null || delivery.status === "cancelled") return null;
  const sale = await repos.saleReads.get(workspaceId, delivery.saleId);
  if (sale === null) return null;
  const customer = await repos.customerReads.get(workspaceId, sale.customerId);
  if (customer === null) return null;
  return documentSnapshotSchema.parse({
    kind: "delivery_note",
    schemaVersion: 1,
    workspace: { id: workspaceId, name: workspaceName },
    customer: customer.customer,
    sale: { id: sale.id, transactionTime: sale.transactionTime },
    delivery,
  });
}

export function generateDocument(ctx: CommandContext, input: unknown) {
  return runCommand<GenerateDocumentCommand, DocumentDto>({
    commandType: "GenerateDocument",
    schema: generateDocumentCommandSchema,
    input,
    ctx,
    requiredPermission: "document.generate",
    execute: async ({ command, repos, recordedAt }) => {
      const snapshot = await canonicalSnapshot(repos, command);
      if (snapshot === null)
        return err("DOCUMENT_SOURCE_INVALID", "Document source is absent or incompatible.");
      const version = await repos.documents.nextVersion({
        workspaceId: command.workspaceId,
        documentType: command.payload.documentType,
        sourceType: command.payload.sourceType,
        sourceId: command.payload.sourceId,
      });
      const document: DocumentDto = {
        id: command.payload.documentId,
        workspaceId: command.workspaceId,
        documentType: command.payload.documentType,
        sourceType: command.payload.sourceType,
        sourceId: command.payload.sourceId,
        version,
        snapshot,
        digest: hashPayload(snapshot),
        generatedAt: recordedAt,
        generatedBy: command.actorId,
      };
      if (!(await repos.documents.insert(document)))
        return err("DOCUMENT_SOURCE_INVALID", "Document version already exists.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "document",
        aggregateId: document.id,
        action: "document.generated",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: {
          documentType: document.documentType,
          sourceType: document.sourceType,
          sourceId: document.sourceId,
          version: document.version,
          digest: document.digest,
        },
        reason: null,
      });
      return ok(document);
    },
  });
}

const DEFAULT_SHARE_LIFETIME_MS = 24 * 60 * 60 * 1_000;

function effectiveShareExpiry(requested: IsoInstant | null, recordedAt: IsoInstant): IsoInstant {
  if (requested !== null) return requested;
  return new Date(Date.parse(recordedAt) + DEFAULT_SHARE_LIFETIME_MS).toISOString() as IsoInstant;
}

export function createDocumentShare(ctx: CommandContext, input: unknown) {
  return runCommand<CreateDocumentShareCommand, DocumentShareResultDto>({
    commandType: "CreateDocumentShare",
    schema: createDocumentShareCommandSchema,
    input,
    ctx,
    requiredPermission: "document.share",
    execute: async ({ command, repos, recordedAt }) => {
      const document = await repos.documents.get(command.workspaceId, command.payload.documentId);
      if (document === null) return err("DOCUMENT_NOT_FOUND", "No such Document.");
      const expiresAt = effectiveShareExpiry(command.payload.expiresAt, recordedAt);
      if (Date.parse(expiresAt) <= Date.parse(recordedAt))
        return err("DOCUMENT_SHARE_EXPIRED", "Share expiry must be in the future.");
      const token = randomBytes(32).toString("base64url");
      if (
        !(await repos.documents.insertShare({
          id: command.payload.shareId,
          workspaceId: command.workspaceId,
          documentId: document.id,
          tokenHash: hashPayload(token),
          expiresAt,
          createdAt: recordedAt,
          createdBy: command.actorId,
        }))
      )
        return err("DOCUMENT_SHARE_NOT_FOUND", "Share identity already exists.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "document",
        aggregateId: document.id,
        action: "document.shared",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { shareId: command.payload.shareId, expiresAt },
        reason: null,
      });
      return ok({
        shareId: command.payload.shareId,
        documentId: document.id,
        token,
        expiresAt,
      });
    },
  });
}

export function revokeDocumentShare(ctx: CommandContext, input: unknown) {
  return runCommand<RevokeDocumentShareCommand, { shareId: string; revoked: true }>({
    commandType: "RevokeDocumentShare",
    schema: revokeDocumentShareCommandSchema,
    input,
    ctx,
    requiredPermission: "document.share",
    execute: async ({ command, repos, recordedAt }) => {
      if (
        !(await repos.documents.revokeShare({
          workspaceId: command.workspaceId,
          shareId: command.payload.shareId,
          revokedAt: recordedAt,
          revokedBy: command.actorId,
          reason: command.payload.reason.trim(),
        }))
      )
        return err("DOCUMENT_SHARE_NOT_FOUND", "Share does not exist or is already revoked.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "document",
        aggregateId: command.payload.shareId,
        action: "document.share_revoked",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { revoked: false },
        after: { revoked: true },
        reason: command.payload.reason.trim(),
      });
      return ok({ shareId: command.payload.shareId, revoked: true as const });
    },
  });
}
