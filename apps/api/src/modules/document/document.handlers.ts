import { randomBytes } from "node:crypto";
import type {
  CreateDocumentShareCommand,
  DocumentDto,
  DocumentShareResultDto,
  GenerateDocumentCommand,
  RevokeDocumentShareCommand,
  CustomerId,
  DeliveryId,
  PurchaseId,
  SaleId,
} from "@vuarau/domain-contracts";
import {
  createDocumentShareCommandSchema,
  generateDocumentCommandSchema,
  revokeDocumentShareCommandSchema,
} from "@vuarau/domain-contracts";
import { err, ok } from "@vuarau/domain-kernel";
import { hashPayload } from "../../infrastructure/hash.ts";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

async function canonicalSnapshot(
  repos: Repositories,
  command: GenerateDocumentCommand,
): Promise<Record<string, unknown> | null> {
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
    return {
      workspace: { id: workspaceId, name: workspaceName },
      customer: customer.customer,
      sale,
      accountEffect: accountEntry,
    };
  }
  if (documentType === "customer_statement") {
    const customer = await repos.customerReads.get(workspaceId, sourceId as CustomerId);
    if (customer === null) return null;
    const entries = await repos.accountEntries.listByCustomer(workspaceId, customer.customer.id);
    return {
      workspace: { id: workspaceId, name: workspaceName },
      customer: customer.customer,
      account: {
        entries,
        balance: customer.balance,
        classification: customer.classification,
      },
    };
  }
  if (documentType === "purchase_order") {
    const purchase = await repos.purchaseReads.get(workspaceId, sourceId as PurchaseId);
    if (purchase === null) return null;
    const supplier = await repos.supplierReads.get(workspaceId, purchase.supplierId);
    if (supplier === null) return null;
    return { workspace: { id: workspaceId, name: workspaceName }, supplier, purchase };
  }
  const delivery = await repos.deliveryReads.get(workspaceId, sourceId as DeliveryId);
  if (delivery === null || delivery.status === "cancelled") return null;
  const sale = await repos.saleReads.get(workspaceId, delivery.saleId);
  if (sale === null) return null;
  const customer = await repos.customerReads.get(workspaceId, sale.customerId);
  if (customer === null) return null;
  return {
    workspace: { id: workspaceId, name: workspaceName },
    customer: customer.customer,
    sale: { id: sale.id, transactionTime: sale.transactionTime },
    delivery,
  };
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
      if (command.payload.expiresAt !== null && command.payload.expiresAt <= recordedAt)
        return err("DOCUMENT_SHARE_EXPIRED", "Share expiry must be in the future.");
      const token = randomBytes(32).toString("base64url");
      if (
        !(await repos.documents.insertShare({
          id: command.payload.shareId,
          workspaceId: command.workspaceId,
          documentId: document.id,
          tokenHash: hashPayload(token),
          expiresAt: command.payload.expiresAt,
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
        after: { shareId: command.payload.shareId, expiresAt: command.payload.expiresAt },
        reason: null,
      });
      return ok({
        shareId: command.payload.shareId,
        documentId: document.id,
        token,
        expiresAt: command.payload.expiresAt,
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
