import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  LATER_TRANSACTION_TIME,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import type { DocumentId, DocumentShareId, SaleId, SaleLineId } from "@vuarau/domain-contracts";
import { hashPayload } from "../../infrastructure/hash.ts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { postSale } from "../sale/post-sale.handler.ts";
import { createDocumentShare, generateDocument, revokeDocumentShare } from "./document.handlers.ts";
import { getPublicDocument } from "./public-document.ts";

let harness: Harness;
const saleId = "00000000-0000-4000-8000-000000000e01" as SaleId;
const command = (suffix: string) => ({
  commandId: `00000000-0000-4000-8000-000000000${suffix}`,
  idempotencyKey: `document-${suffix}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: LATER_TRANSACTION_TIME,
});

beforeEach(async () => {
  harness = createHarness();
  await createSaleDraft(harness.ctx, {
    ...command("e10"),
    payload: {
      saleId,
      customerId: CUSTOMER_ID,
      currency: "VND",
      lines: [
        {
          lineId: "00000000-0000-4000-8000-000000000e02" as SaleLineId,
          productId: PRODUCT_CA_CHUA_ID,
          productName: "Cà chua",
          qualityGradeId: QUALITY_GRADE_1_ID,
          qualityGradeName: "Loại 1",
          quantity: { valueScaled: 10_000, unit: "kg" },
          unitPrice: { amountMinor: 25_000, currency: "VND" },
        },
      ],
      note: null,
      dueAt: null,
      replacesSaleId: null,
    },
  });
  await postSale(harness.ctx, {
    ...command("e11"),
    expectedVersion: 1,
    payload: { saleId },
  });
});

describe("M20 immutable documents (TC-DOCUMENT-001)", () => {
  it("regenerates a deterministic immutable source snapshot as a new version", async () => {
    const first = await generateDocument(harness.ctx, {
      ...command("e12"),
      payload: {
        documentId: "00000000-0000-4000-8000-000000000e12" as DocumentId,
        documentType: "sale_receipt",
        sourceType: "sale",
        sourceId: saleId,
      },
    });
    const second = await generateDocument(harness.ctx, {
      ...command("e13"),
      payload: {
        documentId: "00000000-0000-4000-8000-000000000e13" as DocumentId,
        documentType: "sale_receipt",
        sourceType: "sale",
        sourceId: saleId,
      },
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.version).toBe(2);
    expect(second.value.snapshot).toEqual(first.value.snapshot);
    expect(second.value.digest).toBe(first.value.digest);
    expect(hashPayload(first.value.snapshot)).toBe(first.value.digest);
  });

  it("stores only a token hash and safely rejects expiry and revocation", async () => {
    const documentId = "00000000-0000-4000-8000-000000000e14" as DocumentId;
    await generateDocument(harness.ctx, {
      ...command("e14"),
      payload: { documentId, documentType: "sale_receipt", sourceType: "sale", sourceId: saleId },
    });
    const shareId = "00000000-0000-4000-8000-000000000e15" as DocumentShareId;
    const shared = await createDocumentShare(harness.ctx, {
      ...command("e15"),
      payload: { shareId, documentId, expiresAt: null },
    });
    expect(shared.ok).toBe(true);
    if (!shared.ok) return;
    const publicRead = await harness.deps.uow.transaction((repos) =>
      repos.documentReads.publicByTokenHash(
        hashPayload(shared.value.token),
        LATER_TRANSACTION_TIME,
      ),
    );
    expect(publicRead.kind).toBe("found");
    const rawTokenLookup = await harness.deps.uow.transaction((repos) =>
      repos.documentReads.publicByTokenHash(shared.value.token, LATER_TRANSACTION_TIME),
    );
    expect(rawTokenLookup.kind).toBe("not_found");
    expect(
      (
        await revokeDocumentShare(harness.ctx, {
          ...command("e16"),
          payload: { shareId, reason: "Không còn cần chia sẻ" },
        })
      ).ok,
    ).toBe(true);
    const revoked = await harness.deps.uow.transaction((repos) =>
      repos.documentReads.publicByTokenHash(
        hashPayload(shared.value.token),
        LATER_TRANSACTION_TIME,
      ),
    );
    expect(revoked.kind).toBe("revoked");
  });

  it("fails closed for an expired link and a tampered immutable snapshot", async () => {
    const documentId = "00000000-0000-4000-8000-000000000e17" as DocumentId;
    await generateDocument(harness.ctx, {
      ...command("e17"),
      payload: { documentId, documentType: "sale_receipt", sourceType: "sale", sourceId: saleId },
    });
    const expiring = await createDocumentShare(harness.ctx, {
      ...command("e18"),
      payload: {
        shareId: "00000000-0000-4000-8000-000000000e18" as DocumentShareId,
        documentId,
        expiresAt: "2026-08-01T00:00:00.000Z",
      },
    });
    expect(expiring.ok).toBe(true);
    if (!expiring.ok) return;
    harness.clock.set("2026-08-02T00:00:00.000Z");
    expect((await getPublicDocument(harness.deps, expiring.value.token)).kind).toBe("expired");

    const stable = await createDocumentShare(harness.ctx, {
      ...command("e19"),
      payload: {
        shareId: "00000000-0000-4000-8000-000000000e19" as DocumentShareId,
        documentId,
        expiresAt: null,
      },
    });
    expect(stable.ok).toBe(true);
    if (!stable.ok) return;
    harness.db.corruptDocumentSnapshot(WORKSPACE_ID, documentId, { altered: true });
    expect((await getPublicDocument(harness.deps, stable.value.token)).kind).toBe(
      "integrity_error",
    );
  });
});
