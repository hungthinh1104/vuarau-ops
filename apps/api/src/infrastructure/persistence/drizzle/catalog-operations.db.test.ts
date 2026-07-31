import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { ProductId, SaleId } from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  createProduct,
  deactivateProduct,
  updateProduct,
} from "../../../modules/product/product.handlers.ts";
import { getProduct, searchProducts } from "../../../modules/product/product.queries.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import { getSale } from "../../../modules/sale/sale.queries.ts";
import {
  backupDigest,
  exportWorkspaceBackup,
  getWorkspaceIntegrity,
  validateWorkspaceBackup,
} from "../../../modules/operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../../../modules/operations/restore-workspace.handler.ts";

describe.skipIf(skipWithoutDatabase())("M14 and M15 against Postgres", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  const contextFor = (actorId: DbTestContext["actorId"]): CommandContext => ({
    deps,
    principal: { actorId, subject: ctx.subjectOf(actorId) },
  });
  const command = (actorId: DbTestContext["actorId"], key: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${key}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId,
    occurredAt: new Date().toISOString(),
  });

  beforeAll(async () => {
    ctx = await createDbTestContext("catalog-operations");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("searches folded aliases and keyset-pages equal names without skips or duplicates", async () => {
    const ids = Array.from({ length: 3 }, () => crypto.randomUUID() as ProductId).sort();
    for (const [index, productId] of ids.entries()) {
      const created = await createProduct(contextFor(ctx.actorId), {
        ...command(ctx.actorId, `product-create-${index}`),
        payload: {
          productId,
          displayName: "Cải bẹ",
          aliases: index === 0 ? ["CAI BE XANH"] : [],
          preferredUnit: "kg",
        },
      });
      expect(created.ok).toBe(true);
    }

    const alias = await searchProducts(contextFor(ctx.actorId), {
      workspaceId: ctx.workspaceId,
      query: "cải be xanh",
      isActive: true,
      cursor: null,
      limit: 10,
    });
    expect(alias.ok && alias.value.items.map((item) => item.id)).toContain(ids[0]);

    const first = await searchProducts(contextFor(ctx.actorId), {
      workspaceId: ctx.workspaceId,
      query: "cai be",
      isActive: true,
      cursor: null,
      limit: 2,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.nextCursor).not.toBeNull();
    const second = await searchProducts(contextFor(ctx.actorId), {
      workspaceId: ctx.workspaceId,
      query: "cai be",
      isActive: true,
      cursor: first.value.nextCursor,
      limit: 2,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const pagedIds = [...first.value.items, ...second.value.items].map((item) => item.id);
    expect(pagedIds).toEqual(ids);
    expect(new Set(pagedIds).size).toBe(3);
  });

  it("BR-PRODUCT-002 / TC-PRODUCT-002 — keeps the posted Sale snapshot and ledger unchanged after catalog mutation", async () => {
    const productId = crypto.randomUUID() as ProductId;
    const saleId = crypto.randomUUID() as SaleId;
    expect(
      (
        await createProduct(contextFor(ctx.actorId), {
          ...command(ctx.actorId, "snapshot-product-create"),
          payload: {
            productId,
            displayName: "Bí đỏ nguyên trái",
            aliases: ["bí đỏ"],
            preferredUnit: "kg",
          },
        })
      ).ok,
    ).toBe(true);
    const createdSale = await createSaleDraft(contextFor(ctx.actorId), {
      ...command(ctx.actorId, "snapshot-sale-create"),
      payload: {
        saleId,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId,
            productName: "Bí đỏ nguyên trái",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 2_000, unit: "kg" },
            unitPrice: { amountMinor: 20_000, currency: "VND" },
          },
        ],
        note: null,
        dueAt: null,
        replacesSaleId: null,
      },
    });
    expect(createdSale.ok).toBe(true);
    const posted = await postSale(contextFor(ctx.actorId), {
      ...command(ctx.actorId, "snapshot-sale-post"),
      expectedVersion: 1,
      payload: { saleId },
    });
    expect(posted.ok).toBe(true);
    const before = await getSale(contextFor(ctx.actorId), {
      workspaceId: ctx.workspaceId,
      saleId,
    });
    const ledgerBefore = await ctx.accountEntryRows();

    const updated = await updateProduct(contextFor(ctx.actorId), {
      ...command(ctx.actorId, "snapshot-product-update"),
      expectedVersion: 1,
      payload: {
        productId,
        displayName: "Bí đỏ hồ lô",
        aliases: ["bí hồ lô"],
        preferredUnit: "cai",
      },
    });
    expect(updated.ok).toBe(true);
    const deactivated = await deactivateProduct(contextFor(ctx.actorId), {
      ...command(ctx.actorId, "snapshot-product-deactivate"),
      expectedVersion: 2,
      payload: { productId, reason: "Ngưng bán" },
    });
    expect(deactivated.ok).toBe(true);

    const after = await getSale(contextFor(ctx.actorId), {
      workspaceId: ctx.workspaceId,
      saleId,
    });
    expect(after).toEqual(before);
    expect(await ctx.accountEntryRows()).toEqual(ledgerBefore);
    expect(after.ok && after.value.lines[0]).toMatchObject({
      productId,
      productName: "Bí đỏ nguyên trái",
      quantity: { unit: "kg" },
      unitPrice: { amountMinor: 20_000 },
    });

    const normalSearch = await searchProducts(contextFor(ctx.actorId), {
      workspaceId: ctx.workspaceId,
      query: "Bí đỏ hồ lô",
      isActive: true,
      cursor: null,
      limit: 10,
    });
    expect(normalSearch.ok && normalSearch.value.items).toHaveLength(0);
  });

  it("rejects cross-workspace product references while preserving free-text capture", async () => {
    const foreignProductId = ctx.productIds[0];
    const crossWorkspace = await createSaleDraft(contextFor(ctx.foreignActorId), {
      ...command(ctx.foreignActorId, "foreign-product-sale"),
      workspaceId: ctx.foreignWorkspaceId,
      payload: {
        saleId: crypto.randomUUID(),
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: foreignProductId,
            productName: "Crafted",
            quantity: { valueScaled: 1_000, unit: "kg" },
            unitPrice: { amountMinor: 1_000, currency: "VND" },
          },
        ],
        note: null,
        dueAt: null,
        replacesSaleId: null,
      },
    });
    expect(crossWorkspace.ok).toBe(false);

    const freeText = await createSaleDraft(contextFor(ctx.actorId), {
      ...command(ctx.actorId, "free-text-sale"),
      payload: {
        saleId: crypto.randomUUID(),
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: null,
            productName: "Hàng theo mùa",
            quantity: { valueScaled: 1_000, unit: "kg" },
            unitPrice: { amountMinor: 1_000, currency: "VND" },
          },
        ],
        note: null,
        dueAt: null,
        replacesSaleId: null,
      },
    });
    expect(freeText.ok).toBe(true);
  });

  it("exports deterministic, secret-free backup evidence and rejects corruption or unsafe restore", async () => {
    const exportCommand = {
      ...command(ctx.actorId, "workspace-backup-export"),
      payload: {},
    };
    const first = await exportWorkspaceBackup(contextFor(ctx.actorId), exportCommand);
    const replay = await exportWorkspaceBackup(contextFor(ctx.actorId), exportCommand);
    expect(replay).toEqual(first);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const next = await exportWorkspaceBackup(contextFor(ctx.actorId), {
      ...command(ctx.actorId, "workspace-backup-export-next"),
      payload: {},
    });
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.value.payload.commandReceipts).not.toContainEqual(
        expect.objectContaining({ commandType: "ExportWorkspaceBackup" }),
      );
    }
    expect(first.value.digest).toBe(backupDigest(first.value.payload));
    expect(JSON.stringify(first.value)).not.toMatch(/SUPABASE|bearer|password|jwt/i);

    const changed = {
      ...first.value,
      payload: { ...first.value.payload, customers: [{ injected: true }] },
    };
    const validation = await validateWorkspaceBackup(
      contextFor(ctx.actorId),
      ctx.workspaceId,
      changed,
    );
    expect(validation.ok && validation.value).toMatchObject({
      valid: false,
      diagnostics: ["bad_digest"],
    });

    const restore = await restoreWorkspaceBackup(contextFor(ctx.actorId), {
      ...command(ctx.actorId, "workspace-backup-unsafe-restore"),
      payload: { backup: first.value, reason: "Không được merge vào vựa đang chạy" },
    });
    expect(restore.ok).toBe(false);
    if (!restore.ok) expect(restore.error.code).toBe("BACKUP_UNSAFE_TARGET");

    const denied = await getWorkspaceIntegrity(contextFor(ctx.roleActors.sales), ctx.workspaceId);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("PERMISSION_DENIED");
  });

  it("reads a created product only inside its workspace", async () => {
    const productId = crypto.randomUUID() as ProductId;
    await createProduct(contextFor(ctx.actorId), {
      ...command(ctx.actorId, "workspace-product"),
      payload: {
        productId,
        displayName: "Rau workspace",
        aliases: [],
        preferredUnit: null,
      },
    });
    const own = await getProduct(contextFor(ctx.actorId), {
      workspaceId: ctx.workspaceId,
      productId,
    });
    const foreign = await getProduct(contextFor(ctx.foreignActorId), {
      workspaceId: ctx.foreignWorkspaceId,
      productId,
    });
    expect(own.ok).toBe(true);
    expect(foreign.ok).toBe(false);
  });

  it("surfaces a malformed ledger source in the workspace integrity scan", async () => {
    const entryId = crypto.randomUUID();
    const missingSaleId = crypto.randomUUID();
    const commandId = crypto.randomUUID();
    await ctx.database.sql`
      insert into customer_account_entries (
        id, workspace_id, customer_id, amount_minor, currency, source_type, source_id,
        reversal_of_entry_id, reason_code, reason, transaction_time, recorded_at,
        actor_id, command_id
      ) values (
        ${entryId}::uuid, ${ctx.workspaceId}::uuid, ${ctx.customerId}::uuid,
        25000, 'VND', 'sale_posting', ${missingSaleId}::uuid,
        null, null, null, now(), now(), ${ctx.actorId}::uuid, ${commandId}::uuid
      )
    `;

    const integrity = await getWorkspaceIntegrity(contextFor(ctx.actorId), ctx.workspaceId);
    expect(integrity.ok && integrity.value).toMatchObject({
      status: "attention",
      missingSources: 1,
      anomalousCustomers: 1,
    });
  });
});
