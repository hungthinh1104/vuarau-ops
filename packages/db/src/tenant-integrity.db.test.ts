import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  captureDatabaseError,
  createDbTestContext,
  skipWithoutDatabase,
  sql,
  type DbTestContext,
} from "./index.ts";

describe.skipIf(skipWithoutDatabase())("tenant-local relational integrity", () => {
  let ctx: DbTestContext;

  beforeEach(async () => {
    ctx = await createDbTestContext(`tenant-integrity-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("keeps every FK between tenant-local tables workspace-scoped", async () => {
    const rows = await ctx.database.db.execute(sql`
      WITH fks AS (
        SELECT
          c.oid,
          c.conname,
          c.conrelid,
          c.confrelid,
          array_agg(child_column.attname ORDER BY keys.ordinality) AS child_columns,
          array_agg(parent_column.attname ORDER BY keys.ordinality) AS parent_columns
        FROM pg_constraint c
        CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS keys(
          child_attnum,
          parent_attnum,
          ordinality
        )
        JOIN pg_attribute child_column
          ON child_column.attrelid = c.conrelid
         AND child_column.attnum = keys.child_attnum
        JOIN pg_attribute parent_column
          ON parent_column.attrelid = c.confrelid
         AND parent_column.attnum = keys.parent_attnum
        WHERE c.contype = 'f'
        GROUP BY c.oid, c.conname, c.conrelid, c.confrelid
      ), tenant_fks AS (
        SELECT f.*
        FROM fks f
        WHERE EXISTS (
          SELECT 1 FROM pg_attribute
          WHERE attrelid = f.conrelid AND attname = 'workspace_id' AND NOT attisdropped
        )
        AND EXISTS (
          SELECT 1 FROM pg_attribute
          WHERE attrelid = f.confrelid AND attname = 'workspace_id' AND NOT attisdropped
        )
      )
      SELECT conname, child_columns, parent_columns
      FROM tenant_fks
      WHERE NOT ('workspace_id' = ANY(child_columns) AND 'workspace_id' = ANY(parent_columns))
    `);

    expect(Array.from(rows)).toEqual([]);
  });

  it("pins critical payment, supplier and quarantine lineage at the database boundary", async () => {
    const expected = [
      "quality_dispositions_workspace_quarantine_allocation_fk",
      "payment_reversals_workspace_payment_fk",
      "payment_allocations_workspace_payment_customer_fk",
      "payment_allocations_workspace_sale_customer_fk",
      "payment_allocation_reversals_workspace_allocation_customer_fk",
      "supplier_payments_supplier_fk",
      "supplier_payment_reversals_payment_fk",
      "supplier_account_entries_supplier_fk",
      "supplier_account_balances_supplier_fk",
    ];
    const rows = await ctx.database.db.execute(sql`
      SELECT conname
      FROM pg_constraint
    `);
    const names = new Set(
      Array.from(rows, (row) => String((row as unknown as { conname: string }).conname)),
    );
    expect(expected.every((name) => names.has(name))).toBe(true);
  });

  it("rejects orphan quarantine, payment-reversal and supplier-balance rows", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const commandId = crypto.randomUUID();
    await ctx.database.db.execute(sql`
      INSERT INTO command_receipts (
        command_id, workspace_id, idempotency_key, command_type,
        payload_hash, status, recorded_at
      ) VALUES (
        ${commandId}::uuid, ${ctx.workspaceId}::uuid, ${commandId}, 'tenant-integrity-test',
        ${commandId}, 'completed', ${now.toISOString()}
      )
    `);
    const quarantineError = await captureDatabaseError(
      ctx.database.db.execute(sql`
        INSERT INTO quality_dispositions (
          id, workspace_id, source_type, source_quarantine_allocation_id,
          note, evidence_references, transaction_time, recorded_at, actor_id, command_id
        ) VALUES (
          ${crypto.randomUUID()}::uuid, ${ctx.workspaceId}::uuid, 'quarantine_allocation',
          ${crypto.randomUUID()}::uuid, NULL, ARRAY[]::text[], ${now.toISOString()},
          ${now.toISOString()}, ${ctx.actorId}::uuid, ${commandId}::uuid
        )
      `),
    );
    expect(quarantineError).toContain("quality_dispositions_workspace_quarantine_allocation_fk");

    const paymentReversalError = await captureDatabaseError(
      ctx.database.db.execute(sql`
        INSERT INTO payment_reversals (
          id, workspace_id, payment_id, amount_minor, currency, reason,
          evidence_references, transaction_time, recorded_at
        ) VALUES (
          ${crypto.randomUUID()}::uuid, ${ctx.workspaceId}::uuid, ${crypto.randomUUID()}::uuid,
          1, 'VND', 'orphan test', ARRAY[]::text[], ${now.toISOString()}, ${now.toISOString()}
        )
      `),
    );
    expect(paymentReversalError).toContain("payment_reversals_workspace_payment_fk");

    const supplierBalanceError = await captureDatabaseError(
      ctx.database.db.execute(sql`
        INSERT INTO supplier_account_balances (
          workspace_id, supplier_id, balance_minor, currency, entry_count, updated_at
        ) VALUES (
          ${ctx.workspaceId}::uuid, ${crypto.randomUUID()}::uuid, 0, 'VND', 0,
          ${now.toISOString()}
        )
      `),
    );
    expect(supplierBalanceError).toContain("supplier_account_balances_supplier_fk");
  });

  it("rejects cross-workspace inserts and updates across money, goods, commercial, evidence and recovery", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const foreignCustomerId = crypto.randomUUID();
    const foreignProductId = crypto.randomUUID();
    const currentCommandId = crypto.randomUUID();
    const foreignCommandId = crypto.randomUUID();

    await ctx.database.db.execute(sql`
      INSERT INTO customers (
        id, workspace_id, display_name, is_active, version,
        transaction_time, recorded_at, updated_at
      ) VALUES (
        ${foreignCustomerId}::uuid, ${ctx.foreignWorkspaceId}::uuid, 'foreign customer', true, 1,
        ${now.toISOString()}, ${now.toISOString()}, ${now.toISOString()}
      )
    `);
    await ctx.database.db.execute(sql`
      INSERT INTO products (id, workspace_id, name, currency, is_active, version, created_at, updated_at)
      VALUES (
        ${foreignProductId}::uuid, ${ctx.foreignWorkspaceId}::uuid, 'foreign product', 'VND', true, 1,
        ${now.toISOString()}, ${now.toISOString()}
      )
    `);
    for (const [commandId, workspaceId] of [
      [currentCommandId, ctx.workspaceId],
      [foreignCommandId, ctx.foreignWorkspaceId],
    ] as const) {
      await ctx.database.db.execute(sql`
        INSERT INTO command_receipts (
          command_id, workspace_id, idempotency_key, command_type,
          payload_hash, status, recorded_at
        ) VALUES (
          ${commandId}::uuid, ${workspaceId}::uuid, ${commandId}, 'tenant-integrity-test',
          ${commandId}, 'completed', ${now.toISOString()}
        )
      `);
    }

    await ctx.database.db.execute(sql`
      INSERT INTO customer_account_balances (
        workspace_id, customer_id, balance_minor, currency, entry_count, updated_at
      ) VALUES (${ctx.workspaceId}::uuid, ${ctx.customerId}::uuid, 0, 'VND', 0, ${now.toISOString()})
    `);
    const moneyUpdateError = await captureDatabaseError(
      ctx.database.db.execute(sql`
      UPDATE customer_account_balances
      SET customer_id = ${foreignCustomerId}::uuid
      WHERE workspace_id = ${ctx.workspaceId}::uuid AND customer_id = ${ctx.customerId}::uuid
    `),
    );
    expect(moneyUpdateError).toContain("customer_account_balances_workspace_customer_fk");

    const goodsInsertError = await captureDatabaseError(
      ctx.database.db.execute(sql`
      INSERT INTO inventory_balances (
        workspace_id, product_id, quality_grade_id, unit,
        quantity_scaled, movement_count, updated_at
      ) VALUES (${ctx.workspaceId}::uuid, ${foreignProductId}::uuid, NULL, 'kg', 1000, 1, ${now.toISOString()})
    `),
    );
    expect(goodsInsertError).toContain("inventory_balances_workspace_product_fk");

    const commercialInsertError = await captureDatabaseError(
      ctx.database.db.execute(sql`
      INSERT INTO sales (
        id, workspace_id, customer_id, status, currency, total_amount_minor,
        version, transaction_time, recorded_at
      ) VALUES (
        ${crypto.randomUUID()}::uuid, ${ctx.workspaceId}::uuid, ${foreignCustomerId}::uuid,
        'draft', 'VND', 0, 1, ${now.toISOString()}, ${now.toISOString()}
      )
    `),
    );
    expect(commercialInsertError).toContain("sales_workspace_customer_fk");

    const evidenceInsertError = await captureDatabaseError(
      ctx.database.db.execute(sql`
      INSERT INTO cost_observations (
        id, workspace_id, kind, case_kind, description, participant_wording,
        product_id, evidence_references, transaction_time, recorded_at, actor_id, command_id
      ) VALUES (
        ${crypto.randomUUID()}::uuid, ${ctx.workspaceId}::uuid, 'other', 'normal',
        'test', 'test', ${foreignProductId}::uuid, ARRAY[]::text[], ${now.toISOString()}, ${now.toISOString()},
        ${ctx.actorId}::uuid, ${currentCommandId}::uuid
      )
    `),
    );
    expect(evidenceInsertError).toContain("cost_observations_workspace_product_fk");

    const recoveryInsertError = await captureDatabaseError(
      ctx.database.db.execute(sql`
      INSERT INTO workspace_policies (
        id, workspace_id, policy_kind, version, state, effective_from,
        definition, created_by, created_at, command_id
      ) VALUES (
        ${crypto.randomUUID()}::uuid, ${ctx.workspaceId}::uuid, 'inventory_valuation', 999,
        'draft', ${now.toISOString()}, '{}'::jsonb, ${ctx.actorId}::uuid, ${now.toISOString()}, ${foreignCommandId}::uuid
      )
    `),
    );
    expect(recoveryInsertError).toContain("workspace_policies_workspace_command_fk");
  });
});
