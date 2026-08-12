import { sql } from "drizzle-orm";
import {
  encodeCursor,
  vietnamBusinessDayRange,
  type OperationalReportDto,
  type Unit,
} from "@vuarau/domain-contracts";
import { classifyInventory } from "@vuarau/domain-kernel";
import { money } from "../row-mappers.ts";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";
import type { Page } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

type ScaleReportArgs = {
  workspaceId: string;
  businessDate: string | null;
  businessDayStartMinute: number;
  productId: string | null;
  unit: Unit | null;
  page: Page;
};

type RawRow = Record<string, unknown>;

export type ProjectionReportArgs = {
  readonly workspaceId: string;
  readonly businessDate: string | null;
  readonly businessDayStartMinute?: number;
  readonly productId: string | null;
  readonly unit: Unit | null;
  readonly page: Page;
};

type ProjectionRow = OperationalReportDto["page"]["items"][number];

export function nextProjectionCursor(
  rows: readonly Record<string, unknown>[],
  limit: number,
  timeField: string,
) {
  if (rows.length <= limit) return null;
  const row = rows[limit - 1]!;
  const rawTime = row[timeField];
  return encodeCursor({
    sortValue: rawTime === null ? "" : new Date(String(rawTime)).toISOString(),
    id: String(row["id"] ?? row["account_id"] ?? row["movement_id"] ?? row["expense_id"]),
  });
}

function amountTotal(raw: Record<string, unknown> | undefined, label: string) {
  return money(persistedBigintToSafeNumber(raw?.["amount"] ?? 0, `${label} total`), "VND");
}

export async function cashBalancesAtScale(
  tx: Tx,
  args: ProjectionReportArgs,
): Promise<OperationalReportDto> {
  const after = args.page.after;
  const values = (await tx.execute(sql`
    select a.id, a.display_name, a.is_active, a.currency,
      b.balance_minor, b.last_movement_transaction_time
    from cash_accounts a
    left join cash_balances b
      on b.workspace_id=a.workspace_id and b.cash_account_id=a.id
    where a.workspace_id=${args.workspaceId}::uuid
      and (
        ${after === null ? null : after.sortValue || null}::timestamptz is null
        or (
          ${after?.sortValue === "" ? sql`b.last_movement_transaction_time is null and a.id < ${after.id}::uuid` : sql`(coalesce(b.last_movement_transaction_time, '-infinity'::timestamptz), a.id) < (coalesce(${after?.sortValue ?? null}::timestamptz, '-infinity'::timestamptz), ${after?.id ?? null}::uuid)`}
        )
      )
    order by coalesce(b.last_movement_transaction_time, '-infinity'::timestamptz) desc, a.id desc
    limit ${args.page.limit + 1}
  `)) as Record<string, unknown>[];
  const total = (await tx.execute(sql`
    select coalesce(sum(coalesce(b.balance_minor, 0)), 0) as amount
    from cash_accounts a
    left join cash_balances b
      on b.workspace_id=a.workspace_id and b.cash_account_id=a.id
    where a.workspace_id=${args.workspaceId}::uuid
  `)) as Record<string, unknown>[];
  const items: ProjectionRow[] = values.slice(0, args.page.limit).map((row) => ({
    id: String(row["id"]),
    label: String(row["display_name"]),
    productId: null,
    productName: null,
    qualityGradeId: null,
    qualityGradeName: null,
    sourceType: "cash_account",
    sourceId: String(row["id"]),
    documentHref: `/cash/accounts/${String(row["id"])}`,
    transactionTime:
      row["last_movement_transaction_time"] === null
        ? null
        : new Date(String(row["last_movement_transaction_time"])).toISOString(),
    amount: money(
      persistedBigintToSafeNumber(row["balance_minor"] ?? 0, "cash balance row"),
      String(row["currency"]) as "VND",
    ),
    quantity: null,
    status: row["is_active"] === true ? "active" : "inactive",
  }));
  return {
    reportType: "cash_balances",
    businessDate: args.businessDate,
    timezone: "Asia/Ho_Chi_Minh",
    integrity: "healthy",
    diagnostics: [],
    totals: { amount: amountTotal(total[0], "cash balance"), quantities: [] },
    page: {
      items,
      nextCursor: nextProjectionCursor(values, args.page.limit, "last_movement_transaction_time"),
    },
  };
}

export async function cashMovementAtScale(
  tx: Tx,
  args: ProjectionReportArgs,
): Promise<OperationalReportDto> {
  const range =
    args.businessDate === null
      ? null
      : vietnamBusinessDayRange(args.businessDate, args.businessDayStartMinute ?? 0);
  const after = args.page.after;
  const values = (await tx.execute(sql`
    select m.id, m.amount_minor, m.currency, m.source_type, m.source_id,
      m.transaction_time, a.display_name
    from cash_movements m
    join cash_accounts a on a.workspace_id=m.workspace_id and a.id=m.cash_account_id
    where m.workspace_id=${args.workspaceId}::uuid
      ${range === null ? sql`` : sql`and m.transaction_time >= ${range.start}::timestamptz and m.transaction_time < ${range.end}::timestamptz`}
      ${after === null ? sql`` : sql`and (m.transaction_time < ${after.sortValue}::timestamptz or (m.transaction_time = ${after.sortValue}::timestamptz and m.id < ${after.id}::uuid))`}
    order by m.transaction_time desc, m.id desc
    limit ${args.page.limit + 1}
  `)) as Record<string, unknown>[];
  const total = (await tx.execute(sql`
    select coalesce(sum(m.amount_minor), 0) as amount
    from cash_movements m
    where m.workspace_id=${args.workspaceId}::uuid
      ${range === null ? sql`` : sql`and m.transaction_time >= ${range.start}::timestamptz and m.transaction_time < ${range.end}::timestamptz`}
  `)) as Record<string, unknown>[];
  const items: ProjectionRow[] = values.slice(0, args.page.limit).map((row) => {
    const amountMinor = persistedBigintToSafeNumber(row["amount_minor"], "cash movement row");
    return {
      id: String(row["id"]),
      label: `${String(row["display_name"])} · ${String(row["source_type"])}`,
      productId: null,
      productName: null,
      qualityGradeId: null,
      qualityGradeName: null,
      sourceType: String(row["source_type"]),
      sourceId: String(row["source_id"]),
      documentHref: `/cash/accounts/${String(row["id"])}`,
      transactionTime: new Date(String(row["transaction_time"])).toISOString(),
      amount: money(amountMinor, String(row["currency"]) as "VND"),
      quantity: null,
      status: amountMinor >= 0 ? "cash_in" : "cash_out",
    };
  });
  return {
    reportType: "cash_movement_report",
    businessDate: args.businessDate,
    timezone: "Asia/Ho_Chi_Minh",
    integrity: "healthy",
    diagnostics: [],
    totals: { amount: amountTotal(total[0], "cash movement"), quantities: [] },
    page: {
      items,
      nextCursor: nextProjectionCursor(values, args.page.limit, "transaction_time"),
    },
  };
}

export async function expenseAtScale(
  tx: Tx,
  args: ProjectionReportArgs,
): Promise<OperationalReportDto> {
  const range =
    args.businessDate === null
      ? null
      : vietnamBusinessDayRange(args.businessDate, args.businessDayStartMinute ?? 0);
  const after = args.page.after;
  const values = (await tx.execute(sql`
    select e.id, e.category, e.amount_minor, e.currency, e.transaction_time,
      a.display_name
    from expenses e
    join cash_accounts a on a.workspace_id=e.workspace_id and a.id=e.cash_account_id
    left join expense_reversals er on er.workspace_id=e.workspace_id and er.expense_id=e.id
    where e.workspace_id=${args.workspaceId}::uuid and er.id is null
      ${range === null ? sql`` : sql`and e.transaction_time >= ${range.start}::timestamptz and e.transaction_time < ${range.end}::timestamptz`}
      ${after === null ? sql`` : sql`and (e.transaction_time < ${after.sortValue}::timestamptz or (e.transaction_time = ${after.sortValue}::timestamptz and e.id < ${after.id}::uuid))`}
    order by e.transaction_time desc, e.id desc
    limit ${args.page.limit + 1}
  `)) as Record<string, unknown>[];
  const total = (await tx.execute(sql`
    select coalesce(sum(e.amount_minor), 0) as amount
    from expenses e
    left join expense_reversals er on er.workspace_id=e.workspace_id and er.expense_id=e.id
    where e.workspace_id=${args.workspaceId}::uuid and er.id is null
      ${range === null ? sql`` : sql`and e.transaction_time >= ${range.start}::timestamptz and e.transaction_time < ${range.end}::timestamptz`}
  `)) as Record<string, unknown>[];
  const items: ProjectionRow[] = values.slice(0, args.page.limit).map((row) => ({
    id: String(row["id"]),
    label: `${String(row["category"])} · ${String(row["display_name"])}`,
    productId: null,
    productName: null,
    qualityGradeId: null,
    qualityGradeName: null,
    sourceType: "expense",
    sourceId: String(row["id"]),
    documentHref: `/cash/expenses/${String(row["id"])}`,
    transactionTime: new Date(String(row["transaction_time"])).toISOString(),
    amount: money(
      persistedBigintToSafeNumber(row["amount_minor"], "expense row"),
      String(row["currency"]) as "VND",
    ),
    quantity: null,
    status: "expense",
  }));
  return {
    reportType: "expense_report",
    businessDate: args.businessDate,
    timezone: "Asia/Ho_Chi_Minh",
    integrity: "healthy",
    diagnostics: [],
    totals: { amount: amountTotal(total[0], "expense"), quantities: [] },
    page: {
      items,
      nextCursor: nextProjectionCursor(values, args.page.limit, "transaction_time"),
    },
  };
}

export async function inventoryBalancesAtScale(
  tx: Tx,
  args: ProjectionReportArgs,
): Promise<OperationalReportDto> {
  const after = args.page.after;
  const values = (await tx.execute(sql`
    select ib.product_id, ib.quality_grade_id, ib.unit, ib.quantity_scaled,
      ib.product_id::text || ':' || coalesce(ib.quality_grade_id::text, 'legacy') || ':' || ib.unit::text as id,
      ib.last_movement_transaction_time, p.name as product_name, q.name as grade_name
    from inventory_balances ib
    join products p on p.workspace_id=ib.workspace_id and p.id=ib.product_id
    left join quality_grades q on q.workspace_id=ib.workspace_id and q.id=ib.quality_grade_id
    where ib.workspace_id=${args.workspaceId}::uuid
      ${args.productId === null ? sql`` : sql`and ib.product_id=${args.productId}::uuid`}
      ${args.unit === null ? sql`` : sql`and ib.unit=${args.unit}::unit`}
      ${after === null ? sql`` : after.sortValue === "" ? sql`and ib.last_movement_transaction_time is null and ib.product_id::text || ':' || coalesce(ib.quality_grade_id::text, 'legacy') || ':' || ib.unit::text < ${after.id}` : sql`and (coalesce(ib.last_movement_transaction_time, '-infinity'::timestamptz) < ${after.sortValue}::timestamptz or (coalesce(ib.last_movement_transaction_time, '-infinity'::timestamptz) = ${after.sortValue}::timestamptz and ib.product_id::text || ':' || coalesce(ib.quality_grade_id::text, 'legacy') || ':' || ib.unit::text < ${after.id}))`}
    order by coalesce(ib.last_movement_transaction_time, '-infinity'::timestamptz) desc,
      ib.product_id::text || ':' || coalesce(ib.quality_grade_id::text, 'legacy') || ':' || ib.unit::text desc
    limit ${args.page.limit + 1}
  `)) as Record<string, unknown>[];
  const totals = (await tx.execute(sql`
    select ib.unit, coalesce(sum(ib.quantity_scaled), 0) as quantity
    from inventory_balances ib
    where ib.workspace_id=${args.workspaceId}::uuid
      ${args.productId === null ? sql`` : sql`and ib.product_id=${args.productId}::uuid`}
      ${args.unit === null ? sql`` : sql`and ib.unit=${args.unit}::unit`}
    group by ib.unit
  `)) as Record<string, unknown>[];
  const items: ProjectionRow[] = values.slice(0, args.page.limit).map((row) => {
    const id = `${String(row["product_id"])}:${row["quality_grade_id"] === null ? "legacy" : String(row["quality_grade_id"])}:${String(row["unit"])}`;
    const quantity = persistedBigintToSafeNumber(row["quantity_scaled"], "inventory balance row");
    return {
      id,
      label: `${String(row["product_name"])} · ${row["grade_name"] === null ? "Chưa phân hạng" : String(row["grade_name"])} · ${String(row["unit"])}`,
      productId: String(row["product_id"]),
      productName: String(row["product_name"]),
      qualityGradeId: row["quality_grade_id"] === null ? null : String(row["quality_grade_id"]),
      qualityGradeName: row["grade_name"] === null ? null : String(row["grade_name"]),
      sourceType: "product",
      sourceId: String(row["product_id"]),
      documentHref: `/products/${String(row["product_id"])}/inventory`,
      transactionTime:
        row["last_movement_transaction_time"] === null
          ? null
          : new Date(String(row["last_movement_transaction_time"])).toISOString(),
      amount: null,
      quantity: {
        valueScaled: quantity,
        unit: row["unit"] as Unit,
      },
      status: classifyInventory(quantity),
    };
  });
  return {
    reportType: "inventory_by_product_unit",
    businessDate: args.businessDate,
    timezone: "Asia/Ho_Chi_Minh",
    integrity: "healthy",
    diagnostics: [],
    totals: {
      amount: null,
      quantities: totals.map((row) => ({
        unit: row["unit"] as Unit,
        valueScaled: persistedBigintToSafeNumber(row["quantity"], "inventory balance total"),
      })),
    },
    page: {
      items,
      nextCursor: nextProjectionCursor(values, args.page.limit, "last_movement_transaction_time"),
    },
  };
}
const iso = (value: unknown): string => new Date(String(value)).toISOString();
const businessDateRange = (
  businessDate: string | null,
  businessDayStartMinute: number,
): { start: string | null; end: string | null } =>
  businessDate === null
    ? { start: null, end: null }
    : vietnamBusinessDayRange(businessDate, businessDayStartMinute);

const boundary = (
  page: Page,
): { transactionTime: string; recordedAt: string; id: string } | null => {
  if (page.after === null) return null;
  const separator = page.after.sortValue.indexOf("|");
  if (separator < 0) {
    return {
      transactionTime: page.after.sortValue,
      recordedAt: page.after.sortValue,
      id: page.after.id,
    };
  }
  return {
    transactionTime: page.after.sortValue.slice(0, separator),
    recordedAt: page.after.sortValue.slice(separator + 1),
    id: page.after.id,
  };
};

const nextCursor = (rows: RawRow[], limit: number): string | null => {
  if (rows.length <= limit) return null;
  const row = rows[limit - 1]!;
  return encodeCursor({
    sortValue: `${iso(row["transaction_time"])}|${iso(row["recorded_at"])}`,
    id: String(row["id"]),
  });
};

export async function customerActivityAtScale(tx: Tx, args: ScaleReportArgs) {
  const after = boundary(args.page);
  const date = businessDateRange(args.businessDate, args.businessDayStartMinute);
  const values = await tx.execute(sql`
    select e.*,
      case
        when e.source_type='sale_posting' then '/sales/' || e.source_id::text
        when e.source_type='sale_void' then '/sales/' ||
          coalesce((select sv.sale_id::text from sale_voids sv
                    where sv.workspace_id=e.workspace_id and sv.id=e.source_id), e.source_id::text)
        when e.source_type='payment' then '/payments/' || e.source_id::text
        when e.source_type='payment_reversal' then '/payments/' ||
          coalesce((select pr.payment_id::text from payment_reversals pr
                    where pr.workspace_id=e.workspace_id and pr.id=e.source_id), e.source_id::text)
        else '/account-adjustments/' || e.source_id::text
      end document_href
    from customer_account_entries e
    where e.workspace_id=${args.workspaceId}::uuid
      and (${date.start}::timestamptz is null or e.transaction_time>=${date.start}::timestamptz)
      and (${date.end}::timestamptz is null or e.transaction_time<${date.end}::timestamptz)
      and (${after?.transactionTime ?? null}::timestamptz is null
        or (e.transaction_time,e.recorded_at,e.id)
          < (${after?.transactionTime ?? null}::timestamptz,
             ${after?.recordedAt ?? null}::timestamptz,
             ${after?.id ?? null}::uuid))
    order by e.transaction_time desc, e.recorded_at desc, e.id desc
    limit ${args.page.limit + 1}
  `);
  const totals = await tx.execute(sql`
    select count(*)::int entry_count, coalesce(sum(e.amount_minor),0) amount_minor
    from customer_account_entries e
    where e.workspace_id=${args.workspaceId}::uuid
      and (${date.start}::timestamptz is null or e.transaction_time>=${date.start}::timestamptz)
      and (${date.end}::timestamptz is null or e.transaction_time<${date.end}::timestamptz)
  `);
  return {
    reportType: "customer_account_activity" as const,
    businessDate: args.businessDate,
    timezone: "Asia/Ho_Chi_Minh" as const,
    integrity: "healthy" as const,
    diagnostics: [],
    totals: {
      amount:
        persistedBigintToSafeNumber(
          totals[0]?.["entry_count"] ?? 0,
          "customer activity entry count",
        ) === 0
          ? null
          : money(
              persistedBigintToSafeNumber(
                totals[0]?.["amount_minor"] ?? 0,
                "customer activity amount",
              ),
              "VND",
            ),
      quantities: [],
    },
    page: {
      items: values.slice(0, args.page.limit).map((row) => ({
        id: String(row["id"]),
        label: String(row["source_type"]).replaceAll("_", " "),
        sourceType: String(row["source_type"]),
        sourceId: String(row["source_id"]),
        documentHref: String(row["document_href"]),
        transactionTime: iso(row["transaction_time"]),
        amount: money(
          persistedBigintToSafeNumber(row["amount_minor"], "customer activity row amount"),
          "VND",
        ),
        quantity: null,
        status: "canonical",
      })),
      nextCursor: nextCursor(values, args.page.limit),
    },
  };
}

export async function inventoryMovementReportAtScale(tx: Tx, args: ScaleReportArgs) {
  const after = boundary(args.page);
  const date = businessDateRange(args.businessDate, args.businessDayStartMinute);
  const values = await tx.execute(sql`
    select m.*,
      p.name as product_name,
      case
        when m.source_type='delivery_dispatch' then '/deliveries/' || m.source_id::text
        when m.source_type='delivery_return' then '/deliveries/' ||
          coalesce((select dr.delivery_id::text from delivery_returns dr
                    where dr.workspace_id=m.workspace_id and dr.id=m.source_id), m.source_id::text)
        when m.source_type='purchase_receipt' then '/receipts/' || m.source_id::text
        when m.source_type='purchase_receipt_reversal' then '/receipts/' ||
          coalesce((select rr.receipt_id::text from purchase_receipt_reversals rr
                    where rr.workspace_id=m.workspace_id and rr.id=m.source_id), m.source_id::text)
        else '/inventory-adjustments/' || m.source_id::text
      end document_href
    from inventory_movements m
    join products p on p.workspace_id=m.workspace_id and p.id=m.product_id
    where m.workspace_id=${args.workspaceId}::uuid
      and (${args.productId}::uuid is null or m.product_id=${args.productId}::uuid)
      and (${args.unit}::unit is null or m.unit=${args.unit}::unit)
      and (${date.start}::timestamptz is null or m.transaction_time>=${date.start}::timestamptz)
      and (${date.end}::timestamptz is null or m.transaction_time<${date.end}::timestamptz)
      and (${after?.transactionTime ?? null}::timestamptz is null
        or (m.transaction_time,m.recorded_at,m.id)
          < (${after?.transactionTime ?? null}::timestamptz,
             ${after?.recordedAt ?? null}::timestamptz,
             ${after?.id ?? null}::uuid))
    order by m.transaction_time desc, m.recorded_at desc, m.id desc
    limit ${args.page.limit + 1}
  `);
  const totals = await tx.execute(sql`
    select m.unit, coalesce(sum(m.quantity_scaled),0) quantity_scaled
    from inventory_movements m
    where m.workspace_id=${args.workspaceId}::uuid
      and (${args.productId}::uuid is null or m.product_id=${args.productId}::uuid)
      and (${args.unit}::unit is null or m.unit=${args.unit}::unit)
      and (${date.start}::timestamptz is null or m.transaction_time>=${date.start}::timestamptz)
      and (${date.end}::timestamptz is null or m.transaction_time<${date.end}::timestamptz)
    group by m.unit
  `);
  return {
    reportType: "inventory_movement_report" as const,
    businessDate: args.businessDate,
    timezone: "Asia/Ho_Chi_Minh" as const,
    integrity: "healthy" as const,
    diagnostics: [],
    totals: {
      amount: null,
      quantities: totals.map((row) => ({
        unit: row["unit"] as Unit,
        valueScaled: persistedBigintToSafeNumber(
          row["quantity_scaled"],
          "inventory movement total quantity",
        ),
      })),
    },
    page: {
      items: values.slice(0, args.page.limit).map((row) => ({
        id: String(row["id"]),
        label: String(row["source_type"]).replaceAll("_", " "),
        productId: String(row["product_id"]),
        productName: String(row["product_name"]),
        qualityGradeId: row["quality_grade_id"] ? String(row["quality_grade_id"]) : null,
        qualityGradeName: row["quality_grade_name"] ? String(row["quality_grade_name"]) : null,
        sourceType: String(row["source_type"]),
        sourceId: String(row["source_id"]),
        documentHref: String(row["document_href"]),
        transactionTime: iso(row["transaction_time"]),
        amount: null,
        quantity: {
          valueScaled: persistedBigintToSafeNumber(
            row["quantity_scaled"],
            "inventory movement row quantity",
          ),
          unit: row["unit"] as Unit,
        },
        status: "canonical",
      })),
      nextCursor: nextCursor(values, args.page.limit),
    },
  };
}
