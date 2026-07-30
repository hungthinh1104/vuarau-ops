import {
  E2E_ACTORS,
  E2E_API_PORT,
  E2E_QUALITY_GRADE_ID,
  E2E_WORKSPACE_ID,
  mintAccessToken,
  type E2ERole,
} from "./environment.ts";
import { actors, createDatabase } from "@vuarau/db";

/**
 * A thin, deliberately untyped tRPC caller for **arranging** test data.
 *
 * Specs use it to create a customer or seed a starting balance before driving the
 * browser, and to read back what the browser wrote. It talks to the same running
 * API the browser does — so an assertion made here is an assertion about the same
 * database rows the UI just changed.
 *
 * It does not share the browser's typed client on purpose. That client is bundled
 * for the browser, and importing it into Node to save a few lines would mean the
 * arrange step and the act step could not fail independently.
 */
const BASE = `http://127.0.0.1:${E2E_API_PORT}`;

type Envelope = Record<string, unknown>;

async function call(
  path: string,
  kind: "query" | "mutation",
  input: Envelope,
  role: E2ERole,
): Promise<unknown> {
  const token = await mintAccessToken(role);
  const url =
    kind === "query"
      ? `${BASE}/${path}?input=${encodeURIComponent(JSON.stringify(input))}`
      : `${BASE}/${path}`;

  const response = await fetch(url, {
    method: kind === "query" ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    ...(kind === "mutation" ? { body: JSON.stringify(input) } : {}),
  });

  const body = (await response.json()) as
    | { result: { data: unknown } }
    | { error: { message: string; data?: { domainError?: { code: string } } } };

  if ("error" in body) {
    const code = body.error.data?.domainError?.code ?? "UNKNOWN";
    throw new Error(`${path} failed: ${code} — ${body.error.message}`);
  }
  return body.result.data;
}

function envelope(extra: Envelope = {}): Envelope {
  return {
    commandId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    workspaceId: E2E_WORKSPACE_ID,
    actorId: "",
    occurredAt: new Date().toISOString(),
    ...extra,
  };
}

export const api = {
  async supplierBalance(supplierId: string): Promise<{
    balance: { amountMinor: number };
    entryCount: number;
  }> {
    return (await call(
      "supplier.balance",
      "query",
      { workspaceId: E2E_WORKSPACE_ID, supplierId },
      "owner",
    )) as { balance: { amountMinor: number }; entryCount: number };
  },

  async inventoryBalances(productId: string): Promise<
    {
      qualityGradeName: string | null;
      unit: string;
      quantityScaled: number;
      movementCount: number;
    }[]
  > {
    return (await call(
      "inventory.balances",
      "query",
      { workspaceId: E2E_WORKSPACE_ID, productId },
      "owner",
    )) as {
      qualityGradeName: string | null;
      unit: string;
      quantityScaled: number;
      movementCount: number;
    }[];
  },

  async qualityGradeIdByName(name: string): Promise<string> {
    const database = createDatabase(requiredDatabaseUrl(), { max: 1 });
    try {
      const rows = await database.sql<readonly { id: string }[]>`
        select id::text
        from quality_grades
        where workspace_id = ${E2E_WORKSPACE_ID}::uuid
          and name = ${name}
      `;
      if (rows[0] === undefined) throw new Error(`QualityGrade not found: ${name}`);
      return rows[0].id;
    } finally {
      await database.sql.end();
    }
  },

  async inventoryReconciliation(
    productId: string,
    qualityGradeId: string,
    unit: string,
  ): Promise<{ status: string; diagnostics: readonly string[] }> {
    return (await call(
      "inventory.reconciliation",
      "query",
      { workspaceId: E2E_WORKSPACE_ID, productId, qualityGradeId, unit },
      "owner",
    )) as { status: string; diagnostics: readonly string[] };
  },

  async goodsCounts(ids: { supplierId: string; purchaseId: string; productId: string }): Promise<{
    purchases: number;
    supplierEntries: number;
    movements: number;
    receipts: number;
  }> {
    const database = createDatabase(requiredDatabaseUrl(), { max: 1 });
    try {
      const rows = await database.sql<
        readonly {
          purchases: number;
          supplier_entries: number;
          movements: number;
          receipts: number;
        }[]
      >`
        select
          (select count(*)::int from purchases
            where workspace_id = ${E2E_WORKSPACE_ID}::uuid
              and id = ${ids.purchaseId}::uuid) purchases,
          (select count(*)::int from supplier_account_entries
            where workspace_id = ${E2E_WORKSPACE_ID}::uuid
              and supplier_id = ${ids.supplierId}::uuid) supplier_entries,
          (select count(*)::int from inventory_movements
            where workspace_id = ${E2E_WORKSPACE_ID}::uuid
              and product_id = ${ids.productId}::uuid) movements,
          (select count(*)::int from purchase_receipts
            where workspace_id = ${E2E_WORKSPACE_ID}::uuid
              and purchase_id = ${ids.purchaseId}::uuid) receipts
      `;
      const row = rows[0]!;
      return {
        purchases: row.purchases,
        supplierEntries: row.supplier_entries,
        movements: row.movements,
        receipts: row.receipts,
      };
    } finally {
      await database.sql.end();
    }
  },

  async createCustomer(
    displayName: string,
    role: E2ERole = "owner",
    profile: { phone?: string | null; note?: string | null } = {},
  ): Promise<string> {
    const customerId = crypto.randomUUID();
    await call(
      "customer.create",
      "mutation",
      {
        ...envelope({ actorId: actorFor(role) }),
        payload: {
          customerId,
          displayName,
          phone: profile.phone ?? null,
          note: profile.note ?? null,
        },
      },
      role,
    );
    return customerId;
  },

  /** Gives a customer an opening receivable so a payment has something to reduce. */
  async openingBalance(customerId: string, amountMinor: number): Promise<void> {
    await call(
      "debt.adjust",
      "mutation",
      {
        ...envelope({ actorId: actorFor("owner") }),
        payload: {
          adjustmentId: crypto.randomUUID(),
          customerId,
          direction: "increase",
          amount: { amountMinor, currency: "VND" },
          reasonCode: "opening_balance",
          reason: "Số dư đầu kỳ cho kiểm thử tự động",
        },
      },
      "owner",
    );
  },

  async balance(
    customerId: string,
  ): Promise<{ balance: { amountMinor: number }; classification: string }> {
    return (await call(
      "account.balance",
      "query",
      { workspaceId: E2E_WORKSPACE_ID, customerId },
      "owner",
    )) as { balance: { amountMinor: number }; classification: string };
  },

  async timeline(customerId: string): Promise<{
    items: {
      id: string;
      amount: { amountMinor: number };
      runningBalance: { amountMinor: number };
      source: { type: string; document: { type: string; id: string } };
    }[];
  }> {
    return (await call(
      "account.timeline",
      "query",
      { workspaceId: E2E_WORKSPACE_ID, customerId, from: null, to: null, cursor: null, limit: 50 },
      "owner",
    )) as {
      items: {
        id: string;
        amount: { amountMinor: number };
        runningBalance: { amountMinor: number };
        source: { type: string; document: { type: string; id: string } };
      }[];
    };
  },

  async payments(
    customerId: string,
  ): Promise<{ items: { id: string; amount: { amountMinor: number } }[] }> {
    return (await call(
      "payment.list",
      "query",
      {
        workspaceId: E2E_WORKSPACE_ID,
        customerId,
        status: null,
        from: null,
        to: null,
        cursor: null,
        limit: 50,
      },
      "owner",
    )) as { items: { id: string; amount: { amountMinor: number } }[] };
  },

  async expectWorkspaceAccessDenied(customerId: string): Promise<void> {
    await expectCallToFail(
      "account.timeline",
      "query",
      {
        workspaceId: crypto.randomUUID(),
        customerId,
        from: null,
        to: null,
        cursor: null,
        limit: 50,
      },
      "owner",
      "WORKSPACE_ACCESS_DENIED",
    );
  },

  async reconciliation(customerId: string): Promise<{
    kind: string;
    diagnostics: { code: string }[];
    ledger?: { balance: { amountMinor: number }; entryCount: number };
    projection?: { balance: { amountMinor: number }; entryCount: number } | null;
  }> {
    return (await call(
      "account.reconciliation",
      "query",
      { workspaceId: E2E_WORKSPACE_ID, customerId },
      "owner",
    )) as {
      kind: string;
      diagnostics: { code: string }[];
      ledger?: { balance: { amountMinor: number }; entryCount: number };
      projection?: { balance: { amountMinor: number }; entryCount: number } | null;
    };
  },

  async corruptProjection(customerId: string, balanceMinor: number, entryCount: number) {
    const databaseUrl = requiredDatabaseUrl();
    const database = createDatabase(databaseUrl, { max: 1 });
    try {
      await database.sql`
        update customer_account_balances
        set balance_minor = ${balanceMinor}, entry_count = ${entryCount}, updated_at = now()
        where workspace_id = ${E2E_WORKSPACE_ID}::uuid and customer_id = ${customerId}::uuid
      `;
    } finally {
      await database.sql.end();
    }
  },

  async createUnassignedActor(displayName: string): Promise<string> {
    const actorId = crypto.randomUUID();
    const database = createDatabase(requiredDatabaseUrl(), { max: 1 });
    try {
      await database.db.insert(actors).values({
        id: actorId,
        supabaseUserId: actorId,
        displayName,
      });
    } finally {
      await database.sql.end();
    }
    return actorId;
  },

  /**
   * Moves a draft's version out from under the browser, so a spec can produce a
   * genuine `SALE_VERSION_CONFLICT` rather than simulating one.
   */
  async updateDraftElsewhere(saleId: string, expectedVersion: number): Promise<void> {
    await call(
      "sale.updateDraft",
      "mutation",
      {
        ...envelope({ actorId: actorFor("owner"), expectedVersion }),
        payload: {
          saleId,
          lines: [
            {
              lineId: crypto.randomUUID(),
              // An unresolved line remains legal while the Sale is a draft.
              // PostSale rejects it until the worker selects or creates a Product.
              productId: null,
              productName: "Sửa từ máy khác",
              quantity: { valueScaled: 1_000, unit: "kg" },
              unitPrice: { amountMinor: 1_000, currency: "VND" },
            },
          ],
          note: null,
          dueAt: null,
        },
      },
      "owner",
    );
  },

  async sales(customerId: string): Promise<{
    items: {
      id: string;
      status: string;
      version: number;
      totalAmount: { amountMinor: number };
      lineCount: number;
    }[];
  }> {
    return (await call(
      "sale.list",
      "query",
      {
        workspaceId: E2E_WORKSPACE_ID,
        customerId,
        status: null,
        financialState: null,
        from: null,
        to: null,
        cursor: null,
        limit: 50,
      },
      "owner",
    )) as {
      items: {
        id: string;
        status: string;
        version: number;
        totalAmount: { amountMinor: number };
        lineCount: number;
      }[];
    };
  },

  async sale(saleId: string): Promise<{
    id: string;
    note: string | null;
    lines: {
      productName: string;
      quantity: { valueScaled: number; unit: string };
      unitPrice: { amountMinor: number; currency: string };
    }[];
  }> {
    return (await call(
      "sale.get",
      "query",
      { workspaceId: E2E_WORKSPACE_ID, saleId },
      "owner",
    )) as {
      id: string;
      note: string | null;
      lines: {
        productName: string;
        quantity: { valueScaled: number; unit: string };
        unitPrice: { amountMinor: number; currency: string };
      }[];
    };
  },

  async createPostedSale(input: {
    customerId: string;
    productId: string;
    productName: string;
    quantityScaled: number;
  }): Promise<{ saleId: string; saleLineId: string }> {
    const saleId = crypto.randomUUID();
    const saleLineId = crypto.randomUUID();
    await call(
      "sale.createDraft",
      "mutation",
      {
        ...envelope({ actorId: actorFor("owner") }),
        payload: {
          saleId,
          customerId: input.customerId,
          currency: "VND",
          lines: [
            {
              lineId: saleLineId,
              productId: input.productId,
              productName: input.productName,
              qualityGradeId: E2E_QUALITY_GRADE_ID,
              qualityGradeName: "Loại 1",
              quantity: { valueScaled: input.quantityScaled, unit: "kg" },
              unitPrice: { amountMinor: 10_000, currency: "VND" },
            },
          ],
          note: null,
          dueAt: null,
          replacesSaleId: null,
        },
      },
      "owner",
    );
    await call(
      "sale.post",
      "mutation",
      {
        ...envelope({ actorId: actorFor("owner"), expectedVersion: 1 }),
        payload: { saleId },
      },
      "owner",
    );
    return { saleId, saleLineId };
  },

  async deliveryTruth(input: { saleId: string; productId: string }): Promise<{
    outboundSources: number;
    returnSources: number;
    inventoryQuantityScaled: number;
    netFulfilledScaled: number;
  }> {
    const database = createDatabase(requiredDatabaseUrl(), { max: 1 });
    try {
      const rows = await database.sql<
        readonly {
          outbound_sources: number;
          return_sources: number;
          inventory_quantity_scaled: number;
          net_fulfilled_scaled: number;
        }[]
      >`
        select
          count(distinct im.source_id) filter (
            where im.source_type = 'delivery_dispatch'
          )::int outbound_sources,
          count(distinct im.source_id) filter (
            where im.source_type = 'delivery_return'
          )::int return_sources,
          coalesce(sum(im.quantity_scaled), 0)::bigint::int inventory_quantity_scaled,
          (
            coalesce((
              select sum(dl.quantity_scaled)
              from delivery_lines dl
              join deliveries d
                on d.workspace_id = dl.workspace_id and d.id = dl.delivery_id
              where d.workspace_id = ${E2E_WORKSPACE_ID}::uuid
                and d.sale_id = ${input.saleId}::uuid
                and d.status in ('dispatched', 'delivered')
            ), 0)
            -
            coalesce((
              select sum(drl.quantity_scaled)
              from delivery_return_lines drl
              join delivery_returns dr on dr.id = drl.return_id
              join deliveries d
                on d.workspace_id = dr.workspace_id and d.id = dr.delivery_id
              where d.workspace_id = ${E2E_WORKSPACE_ID}::uuid
                and d.sale_id = ${input.saleId}::uuid
            ), 0)
          )::bigint::int net_fulfilled_scaled
        from inventory_movements im
        where im.workspace_id = ${E2E_WORKSPACE_ID}::uuid
          and im.product_id = ${input.productId}::uuid
          and im.source_type in ('delivery_dispatch', 'delivery_return')
      `;
      const row = rows[0]!;
      return {
        outboundSources: row.outbound_sources,
        returnSources: row.return_sources,
        inventoryQuantityScaled: row.inventory_quantity_scaled,
        netFulfilledScaled: row.net_fulfilled_scaled,
      };
    } finally {
      await database.sql.end();
    }
  },
};

function requiredDatabaseUrl(): string {
  const value = process.env["DATABASE_URL"];
  if (value === undefined || value.length === 0)
    throw new Error("DATABASE_URL is required for real-stack E2E database assertions.");
  return value;
}

async function expectCallToFail(
  path: string,
  kind: "query" | "mutation",
  input: Envelope,
  role: E2ERole,
  code: string,
): Promise<void> {
  try {
    await call(path, kind, input, role);
  } catch (error) {
    if (error instanceof Error && error.message.includes(`${path} failed: ${code}`)) return;
    throw error;
  }
  throw new Error(`${path} unexpectedly succeeded; expected ${code}.`);
}

function actorFor(role: E2ERole): string {
  // One list, in `environment.ts`. A second copy here drifted the moment an actor
  // was added to the seed, which is exactly how it was found.
  return E2E_ACTORS[role];
}
