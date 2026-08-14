import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { WorkspaceBackupV22 } from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import {
  recordPaymentAllocation,
  reversePaymentAllocation,
} from "../../../modules/account/payment-allocation.handlers.ts";
import { getOperationsBoard } from "../../../modules/dashboard/dashboard.queries.ts";
import {
  backupDigest,
  exportWorkspaceBackup,
} from "../../../modules/operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../../../modules/operations/restore-workspace.handler.ts";

// TC-OPS-022
describe.skipIf(skipWithoutDatabase())("PostgreSQL restore payment lineage", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `restore-payment-lineage-${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-08-11T05:00:00.000Z",
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`restore-payment-lineage-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-08-11T11:00:00.000Z" as never },
    };
  });

  afterEach(async () => {
    await ctx.close();
  });

  async function prepareBackup(
    saleUnitPrice = 100_000,
    allocationAmount = 30_000,
  ): Promise<WorkspaceBackupV22> {
    for (const [policyKind, definition] of [
      [
        "payment_terms_aging",
        {
          contractVersion: 1,
          parameters: {
            defaultTermDays: 7,
            defaultTermLabel: "7 ngày",
            customerTerms: [],
            graceDays: 0,
            agingBuckets: [
              { code: "1-30", label: "1–30 ngày", minDaysOverdue: 1, maxDaysOverdue: 30 },
            ],
            creditControl: "information_only",
          },
        },
      ],
      ["payment_allocation", { contractVersion: 1, parameters: { strategy: "manual" } }],
    ] as const) {
      const draft = await createWorkspacePolicyDraft(context(), {
        ...command(`${policyKind}-draft`),
        payload: {
          policyVersionId: crypto.randomUUID(),
          policyKind,
          version: 1,
          effectiveFrom: "2026-07-01T00:00:00.000Z",
          effectiveTo: null,
          definition,
          evidenceReferences: [],
          reason: `Policy ${policyKind} cho restore lineage.`,
        },
      });
      expect(draft.ok).toBe(true);
      if (!draft.ok) throw new Error(draft.error.message);
      const approved = await approveWorkspacePolicy(context(), {
        ...command(`${policyKind}-approve`),
        payload: {
          policyVersionId: draft.value.id,
          evidenceReferences: [`field://restore-payment/${policyKind}`],
          reason: `Duyệt ${policyKind}.`,
        },
      });
      expect(approved.ok).toBe(true);
      if (!approved.ok) throw new Error(approved.error.message);
    }

    const saleId = crypto.randomUUID();
    const sale = await createSaleDraft(context(), {
      ...command("sale-draft"),
      payload: {
        saleId,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[0],
            productName: "Cà chua",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 1_000, unit: "kg" },
            unitPrice: { amountMinor: saleUnitPrice, currency: "VND" },
          },
        ],
        note: null,
        evidenceReferences: [],
        dueAt: null,
        replacesSaleId: null,
      },
    });
    expect(sale.ok).toBe(true);
    if (!sale.ok) throw new Error(sale.error.message);
    const posted = await postSale(context(), {
      ...command("sale-post"),
      expectedVersion: 1,
      payload: { saleId },
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) throw new Error(posted.error.message);

    const paymentId = crypto.randomUUID();
    const payment = await recordCustomerPayment(context(), {
      ...command("payment"),
      payload: {
        paymentId,
        customerId: ctx.customerId,
        amount: { amountMinor: 50_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
        evidenceReferences: [],
      },
    });
    expect(payment.ok).toBe(true);
    const allocation = await recordPaymentAllocation(context(), {
      ...command("allocation"),
      expectedVersion: 1,
      payload: {
        allocationId: crypto.randomUUID(),
        paymentId,
        saleId,
        amount: { amountMinor: allocationAmount, currency: "VND" },
        evidenceReferences: ["field://restore-payment/allocation"],
      },
    });
    expect(allocation.ok).toBe(true);

    const exported = await exportWorkspaceBackup(context(), {
      ...command("export"),
      payload: {},
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error("backup export unexpectedly failed");
    return exported.value;
  }

  async function emptyWorkspace(): Promise<void> {
    await ctx.database.sql.begin(async (sql) => {
      await sql`set local session_replication_role = replica`;
      for (const table of [
        "customer_account_balances",
        "customer_account_entries",
        "payment_allocation_reversals",
        "payment_allocations",
        "payment_reversals",
        "payments",
        "document_shares",
        "documents",
        "inventory_balances",
        "inventory_movements",
        "delivery_return_lines",
        "delivery_returns",
        "delivery_lines",
        "deliveries",
        "sale_lines",
        "sales",
        "products",
        "quality_grades",
        "customers",
        "audit_logs",
        "reconciliation_observations",
        "workspace_policies",
        "cost_observations",
        "command_receipts",
        "purchase_receipt_reversals",
        "purchase_receipt_lines",
        "purchase_receipts",
        "price_rules",
        "supplier_account_balances",
        "supplier_account_entries",
        "supplier_payment_reversals",
        "supplier_payments",
        "purchase_voids",
        "purchase_lines",
        "purchases",
        "suppliers",
      ] as const) {
        await sql.unsafe(`delete from ${table} where workspace_id = '${ctx.workspaceId}'`);
      }
    });
  }

  const count = (backup: WorkspaceBackupV22, key: string, increment = 0) =>
    Number(backup.recordCounts[key] ?? 0) + increment;

  it("rejects an allocation whose customer differs from its payment and sale", async () => {
    const backup = await prepareBackup();
    await emptyWorkspace();
    const customer = backup.payload.customers[0]!;
    const clonedCustomer = {
      ...customer,
      id: crypto.randomUUID(),
      displayName: "Khách hàng lineage khác",
    };
    const allocation = backup.payload.paymentAllocations[0]!;
    const malformedPayload = {
      ...backup.payload,
      customers: [...backup.payload.customers, clonedCustomer],
      paymentAllocations: [{ ...allocation, customerId: clonedCustomer.id }],
    };
    const malformed: WorkspaceBackupV22 = {
      ...backup,
      payload: malformedPayload,
      recordCounts: {
        ...backup.recordCounts,
        customers: count(backup, "customers", 1),
      },
      digest: backupDigest(malformedPayload),
    };

    const restored = await restoreWorkspaceBackup(context(), {
      ...command("allocation-customer-lineage"),
      payload: { backup: malformed, reason: "Allocation phải cùng khách hàng." },
    });
    expect(restored).toMatchObject({
      ok: false,
      error: { code: "BACKUP_INTEGRITY_ERROR" },
    });
    const rows = await ctx.database.sql`
      select
        (select count(*)::int from customers where workspace_id = ${ctx.workspaceId}::uuid) as customers,
        (select count(*)::int from payments where workspace_id = ${ctx.workspaceId}::uuid) as payments,
        (select count(*)::int from payment_allocations where workspace_id = ${ctx.workspaceId}::uuid) as allocations
    `;
    expect(rows[0]).toMatchObject({ customers: 0, payments: 0, allocations: 0 });
  });

  it("counts each allocation once when several reversals exist", async () => {
    const backup = await prepareBackup(40_000, 40_000);
    const sale = backup.payload.sales[0]!;
    const allocation = backup.payload.paymentAllocations[0]!;

    for (const [label, amount] of [
      ["first", 10_000],
      ["second", 30_000],
    ] as const) {
      const reversal = await reversePaymentAllocation(context(), {
        ...command(`board-allocation-reversal-${label}`),
        expectedVersion: 1,
        payload: {
          allocationId: allocation["id"],
          reversalId: crypto.randomUUID(),
          amount: { amountMinor: amount, currency: "VND" },
          reason: `Đối chiếu reversal ${label}.`,
          evidenceReferences: [],
        },
      });
      expect(reversal.ok).toBe(true);
    }

    const board = await getOperationsBoard(context(), {
      workspaceId: ctx.workspaceId,
      filter: "all",
      sort: "updated_desc",
      search: "",
      cursor: null,
      limit: 20,
    });

    expect(board.ok).toBe(true);
    if (board.ok) {
      expect(board.value.page.items).toContainEqual(
        expect.objectContaining({
          id: sale["id"],
          financialState: "reconciliation_required",
        }),
      );
    }
  });

  it("rejects an allocation reversal whose customer differs from its allocation", async () => {
    const backup = await prepareBackup();
    await emptyWorkspace();
    const customer = backup.payload.customers[0]!;
    const clonedCustomer = {
      ...customer,
      id: crypto.randomUUID(),
      displayName: "Khách hàng reversal khác",
    };
    const allocation = backup.payload.paymentAllocations[0]!;
    const reversal = {
      id: crypto.randomUUID(),
      workspaceId: allocation["workspaceId"],
      customerId: clonedCustomer.id,
      allocationId: allocation["id"],
      amountMinor: 1_000,
      currency: allocation["currency"],
      reason: "Reversal lineage test",
      evidenceReferences: [],
      transactionTime: allocation["transactionTime"],
      recordedAt: allocation["recordedAt"],
      actorId: allocation["actorId"],
      commandId: crypto.randomUUID(),
    };
    const malformedPayload = {
      ...backup.payload,
      customers: [...backup.payload.customers, clonedCustomer],
      paymentAllocationReversals: [reversal],
    };
    const malformed: WorkspaceBackupV22 = {
      ...backup,
      payload: malformedPayload,
      recordCounts: {
        ...backup.recordCounts,
        customers: count(backup, "customers", 1),
        paymentAllocationReversals: count(backup, "paymentAllocationReversals", 1),
      },
      digest: backupDigest(malformedPayload),
    };

    const restored = await restoreWorkspaceBackup(context(), {
      ...command("reversal-customer-lineage"),
      payload: { backup: malformed, reason: "Reversal phải cùng khách hàng." },
    });
    expect(restored).toMatchObject({
      ok: false,
      error: { code: "BACKUP_INTEGRITY_ERROR" },
    });
    const rows = await ctx.database.sql`
      select
        (select count(*)::int from customers where workspace_id = ${ctx.workspaceId}::uuid) as customers,
        (select count(*)::int from payment_allocations where workspace_id = ${ctx.workspaceId}::uuid) as allocations,
        (select count(*)::int from payment_allocation_reversals where workspace_id = ${ctx.workspaceId}::uuid) as reversals
    `;
    expect(rows[0]).toMatchObject({ customers: 0, allocations: 0, reversals: 0 });
  });
});
