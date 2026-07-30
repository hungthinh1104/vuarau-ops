import { sql } from "drizzle-orm";
import { encodeCursor, type Unit } from "@vuarau/domain-contracts";
import { money } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

type ScaleReportArgs = {
  workspaceId: string;
  businessDate: string | null;
  productId: string | null;
  unit: Unit | null;
  page: Page;
};

type RawRow = Record<string, unknown>;
const iso = (value: unknown): string => new Date(String(value)).toISOString();
const businessDateRange = (
  businessDate: string | null,
): { start: string | null; end: string | null } => {
  if (businessDate === null) return { start: null, end: null };
  const start = new Date(`${businessDate}T00:00:00+07:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
};

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
  const date = businessDateRange(args.businessDate);
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
    select count(*)::int entry_count, coalesce(sum(e.amount_minor),0)::bigint amount_minor
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
        Number(totals[0]?.["entry_count"] ?? 0) === 0
          ? null
          : money(Number(totals[0]?.["amount_minor"] ?? 0), "VND"),
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
        amount: money(Number(row["amount_minor"]), "VND"),
        quantity: null,
        status: "canonical",
      })),
      nextCursor: nextCursor(values, args.page.limit),
    },
  };
}

export async function inventoryMovementReportAtScale(tx: Tx, args: ScaleReportArgs) {
  const after = boundary(args.page);
  const date = businessDateRange(args.businessDate);
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
    join products p on p.id=m.product_id
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
    select m.unit, coalesce(sum(m.quantity_scaled),0)::bigint quantity_scaled
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
        valueScaled: Number(row["quantity_scaled"]),
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
          valueScaled: Number(row["quantity_scaled"]),
          unit: row["unit"] as Unit,
        },
        status: "canonical",
      })),
      nextCursor: nextCursor(values, args.page.limit),
    },
  };
}
