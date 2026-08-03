import { performance } from "node:perf_hooks";
import { createDatabase } from "../client.ts";
import { runMigrations } from "../migrate.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL is required for the M22 production-scale rehearsal.");
}

const WORKSPACE_ID = "f2200000-0000-4000-8000-000000000001";
const ACTOR_ID = "f2200000-0000-4000-8000-000000000002";
const SUPPLIER_ID = "f2200000-0000-4000-8000-000000000003";
const COMMAND_ID = "f2200000-0000-4000-8000-000000000004";

const database = createDatabase(DATABASE_URL, { max: 4 });
const { sql } = database;

const uuidExpression = (prefix: string, series = "i"): string =>
  `('${prefix.padEnd(8, "0")}-0000-4000-8000-' || lpad(to_hex(${series}),12,'0'))::uuid`;

async function seed(): Promise<void> {
  const existing = await sql<{ name: string }[]>`
    select name from workspaces where id=${WORKSPACE_ID}::uuid
  `;
  if (existing[0]?.name === "m22-scale:ready") return;
  if (existing.length > 0) {
    throw new Error("M22 scale workspace exists but is incomplete; use a fresh database.");
  }

  await sql.begin(async (tx) => {
    await tx`insert into workspaces(id,name) values (${WORKSPACE_ID}::uuid,'m22-scale:seeding')`;
    await tx`
      insert into actors(id,supabase_user_id,display_name)
      values (${ACTOR_ID}::uuid,'m22-scale-actor','M22 scale actor')
    `;
    await tx`
      insert into workspace_memberships(workspace_id,actor_id,role,is_active)
      values (${WORKSPACE_ID}::uuid,${ACTOR_ID}::uuid,'owner',true)
    `;
    await tx.unsafe(`
      insert into customers(
        id,workspace_id,display_name,phone,note,is_active,version,
        transaction_time,recorded_at,updated_at
      )
      select ${uuidExpression("f221")},'${WORKSPACE_ID}'::uuid,
        'Scale customer '||i,null,null,true,1,now(),now(),now()
      from generate_series(1,10000) i
    `);
    await tx.unsafe(`
      insert into products(
        id,workspace_id,name,aliases,preferred_unit,default_unit_price_minor,
        currency,is_active,version,created_at,updated_at
      )
      select ${uuidExpression("f222")},'${WORKSPACE_ID}'::uuid,
        'Scale product '||i,'{}','kg',null,'VND',true,1,now(),now()
      from generate_series(1,10000) i
    `);
    await tx`
      insert into suppliers(
        id,workspace_id,display_name,phone,note,is_active,version,created_at,updated_at
      ) values (
        ${SUPPLIER_ID}::uuid,${WORKSPACE_ID}::uuid,'Scale supplier',null,null,true,1,now(),now()
      )
    `;
    await tx`
      insert into command_receipts(
        command_id,workspace_id,idempotency_key,command_type,payload_hash,status,result,recorded_at
      ) values (
        ${COMMAND_ID}::uuid,${WORKSPACE_ID}::uuid,'m22-scale','M22ScaleSeed',
        repeat('0',64),'completed','{}'::jsonb,now()
      )
    `;
    await tx.unsafe(`
      insert into command_receipts(
        command_id,workspace_id,idempotency_key,command_type,payload_hash,status,result,recorded_at
      )
      select ${uuidExpression("f22d")},'${WORKSPACE_ID}'::uuid,'m22-scale-'||i,
        'M22ScaleSeed',repeat('0',64),'completed','{}'::jsonb,now()
      from generate_series(1,10000) i
    `);
    await tx.unsafe(`
      insert into sales(
        id,workspace_id,customer_id,status,currency,total_amount_minor,note,version,
        transaction_time,recorded_at,posted_at,discarded_at,due_at,replaces_sale_id
      )
      select ${uuidExpression("f223")},'${WORKSPACE_ID}'::uuid,
        ${uuidExpression("f221", "((i-1)%10000)+1")},'posted','VND',1000,null,2,
        timestamp '2026-01-01' + (i%86400)*interval '1 second',
        timestamp '2026-02-01' + (i%86400)*interval '1 second',
        timestamp '2026-02-01' + (i%86400)*interval '1 second',null,null,null
      from generate_series(1,100000) i
    `);
    await tx.unsafe(`
      insert into sale_lines(
        id,workspace_id,sale_id,product_id,product_name,quantity_scaled,unit,
        unit_price_minor,line_total_minor,currency,position
      )
      select ${uuidExpression("f224")},'${WORKSPACE_ID}'::uuid,
        ${uuidExpression("f223")},${uuidExpression("f222", "((i-1)%10000)+1")},
        'Scale product',1000,'kg',1000,1000,'VND',0
      from generate_series(1,100000) i
    `);
    await tx.unsafe(`
      insert into purchases(
        id,workspace_id,supplier_id,status,currency,total_amount_minor,note,due_at,
        version,transaction_time,recorded_at,confirmed_at,discarded_at,replaces_purchase_id
      )
      select ${uuidExpression("f225")},'${WORKSPACE_ID}'::uuid,'${SUPPLIER_ID}'::uuid,
        'confirmed','VND',1000,null,null,2,
        timestamp '2026-01-01' + (i%86400)*interval '1 second',
        timestamp '2026-02-01' + (i%86400)*interval '1 second',
        timestamp '2026-02-01' + (i%86400)*interval '1 second',null,null
      from generate_series(1,100000) i
    `);
    await tx.unsafe(`
      insert into purchase_lines(
        id,workspace_id,purchase_id,product_id,product_name,quantity_scaled,unit,
        unit_price_minor,line_total_minor,currency
      )
      select ${uuidExpression("f226")},'${WORKSPACE_ID}'::uuid,
        ${uuidExpression("f225")},${uuidExpression("f222", "((i-1)%10000)+1")},
        'Scale product',1000,'kg',1000,1000,'VND'
      from generate_series(1,100000) i
    `);
    await tx.unsafe(`
      insert into customer_account_entries(
        id,workspace_id,customer_id,amount_minor,currency,source_type,source_id,
        reversal_of_entry_id,reason_code,reason,transaction_time,recorded_at,actor_id,command_id
      )
      select ${uuidExpression("f227")},'${WORKSPACE_ID}'::uuid,
        ${uuidExpression("f221", "((i-1)%10000)+1")},
        case when i%2=0 then 1000 else -500 end,'VND','manual_adjustment',
        ${uuidExpression("f227")},null,'opening_balance','scale',
        timestamp '2026-01-01' + (i%86400)*interval '1 second',
        timestamp '2026-02-01' + (i%86400)*interval '1 second',
        '${ACTOR_ID}'::uuid,'${COMMAND_ID}'::uuid
      from generate_series(1,400000) i
    `);
    await tx.unsafe(`
      insert into supplier_account_entries(
        id,workspace_id,supplier_id,amount_minor,currency,source_type,source_id,
        reversal_of_entry_id,reason_code,reason,transaction_time,recorded_at,actor_id,command_id
      )
      select ${uuidExpression("f228")},'${WORKSPACE_ID}'::uuid,'${SUPPLIER_ID}'::uuid,
        1000,'VND','manual_adjustment',${uuidExpression("f228")},
        null,'opening_balance','scale',
        timestamp '2026-01-01' + (i%86400)*interval '1 second',
        timestamp '2026-02-01' + (i%86400)*interval '1 second',
        '${ACTOR_ID}'::uuid,'${COMMAND_ID}'::uuid
      from generate_series(1,100000) i
    `);
    await tx.unsafe(`
      insert into inventory_movements(
        id,workspace_id,product_id,quantity_scaled,unit,source_type,source_id,
        source_line_id,reversal_of_movement_id,reason_code,reason,transaction_time,
        recorded_at,actor_id,command_id
      )
      select ${uuidExpression("f229")},'${WORKSPACE_ID}'::uuid,
        ${uuidExpression("f222", "((i-1)%10000)+1")},
        case when i%2=0 then 1000 else -500 end,'kg','inventory_adjustment',
        ${uuidExpression("f229")},null,null,'count_correction','scale',
        timestamp '2026-01-01' + (i%86400)*interval '1 second',
        timestamp '2026-02-01' + (i%86400)*interval '1 second',
        '${ACTOR_ID}'::uuid,'${COMMAND_ID}'::uuid
      from generate_series(1,500000) i
    `);
    await tx.unsafe(`
      insert into customer_account_balances(
        workspace_id,customer_id,balance_minor,currency,entry_count,
        last_entry_transaction_time,updated_at
      )
      select '${WORKSPACE_ID}'::uuid,customer_id,sum(amount_minor),'VND',count(*),
        max(transaction_time),now()
      from customer_account_entries where workspace_id='${WORKSPACE_ID}'::uuid
      group by customer_id
    `);
    await tx.unsafe(`
      insert into supplier_account_balances(
        workspace_id,supplier_id,balance_minor,currency,entry_count,
        last_entry_transaction_time,updated_at
      )
      select '${WORKSPACE_ID}'::uuid,supplier_id,sum(amount_minor),'VND',count(*),
        max(transaction_time),now()
      from supplier_account_entries where workspace_id='${WORKSPACE_ID}'::uuid
      group by supplier_id
    `);
    await tx.unsafe(`
      insert into inventory_balances(
        workspace_id,product_id,unit,quantity_scaled,movement_count,
        last_movement_transaction_time,updated_at
      )
      select '${WORKSPACE_ID}'::uuid,product_id,unit,sum(quantity_scaled),count(*),
        max(transaction_time),now()
      from inventory_movements where workspace_id='${WORKSPACE_ID}'::uuid
      group by product_id,unit
    `);
    await tx.unsafe(`
      insert into deliveries(
        id,workspace_id,sale_id,status,note,cancellation_reason,version,
        transaction_time,recorded_at,dispatched_at,delivered_at,actor_id
      )
      select ${uuidExpression("f22a")},'${WORKSPACE_ID}'::uuid,
        ${uuidExpression("f223")},'dispatched',null,null,2,
        timestamp '2026-01-01' + (i%86400)*interval '1 second',
        timestamp '2026-02-01' + (i%86400)*interval '1 second',
        timestamp '2026-01-01' + (i%86400)*interval '1 second',null,'${ACTOR_ID}'::uuid
      from generate_series(1,25000) i
    `);
    await tx.unsafe(`
      insert into delivery_lines(
        id,workspace_id,delivery_id,sale_line_id,product_id,product_name,
        quantity_scaled,unit
      )
      select ${uuidExpression("f22b")},'${WORKSPACE_ID}'::uuid,
        ${uuidExpression("f22a")},${uuidExpression("f224")},
        ${uuidExpression("f222", "((i-1)%10000)+1")},'Scale product',1000,'kg'
      from generate_series(1,25000) i
    `);
    await tx.unsafe(`
      insert into documents(
        id,workspace_id,document_type,source_type,source_id,version,snapshot,digest,
        generated_at,generated_by
      )
      select ${uuidExpression("f22c")},'${WORKSPACE_ID}'::uuid,'sale_receipt','sale',
        ${uuidExpression("f223")},1,jsonb_build_object('scale',i),repeat('0',64),
        now(),'${ACTOR_ID}'::uuid
      from generate_series(1,10000) i
    `);
    await tx`update workspaces set name='m22-scale:ready' where id=${WORKSPACE_ID}::uuid`;
  });
}

type Evidence = {
  name: string;
  budgetMs: number;
  sequentialScanPolicy: "forbidden" | "canonical_aggregate";
  p95Ms: number;
  planMs: number;
  sharedHits: number;
  sharedReads: number;
  sequentialScan: boolean;
};

const checks = [
  {
    name: "customer_timeline",
    budgetMs: 75,
    query: `select * from customer_account_entries
      where workspace_id='${WORKSPACE_ID}' and customer_id='f2210000-0000-4000-8000-000000000001'
      order by transaction_time desc,recorded_at desc,id desc limit 101`,
  },
  {
    name: "supplier_timeline",
    budgetMs: 75,
    query: `select * from supplier_account_entries
      where workspace_id='${WORKSPACE_ID}' and supplier_id='${SUPPLIER_ID}'
      order by transaction_time desc,recorded_at desc,id desc limit 101`,
  },
  {
    name: "inventory_movements",
    budgetMs: 75,
    query: `select * from inventory_movements
      where workspace_id='${WORKSPACE_ID}' and product_id='f2220000-0000-4000-8000-000000000001'
        and unit='kg'
      order by transaction_time desc,recorded_at desc,id desc limit 101`,
  },
  {
    name: "delivery_fulfilment",
    budgetMs: 100,
    query: `select dl.* from deliveries d join delivery_lines dl
      on dl.workspace_id=d.workspace_id and dl.delivery_id=d.id
      where d.workspace_id='${WORKSPACE_ID}' and d.sale_id='f2230000-0000-4000-8000-000000000001'
      order by d.transaction_time desc,d.recorded_at desc,d.id desc`,
  },
  {
    name: "operational_report_page",
    budgetMs: 100,
    query: `select * from customer_account_entries
      where workspace_id='${WORKSPACE_ID}'
      order by transaction_time desc,recorded_at desc,id desc limit 101`,
  },
  {
    name: "customer_activity_report_total",
    budgetMs: 250,
    sequentialScanPolicy: "canonical_aggregate",
    query: `select count(*),coalesce(sum(amount_minor),0)
      from customer_account_entries where workspace_id='${WORKSPACE_ID}'`,
  },
  {
    name: "inventory_report_totals",
    budgetMs: 250,
    sequentialScanPolicy: "canonical_aggregate",
    query: `select unit,count(*),coalesce(sum(quantity_scaled),0)
      from inventory_movements where workspace_id='${WORKSPACE_ID}' group by unit`,
  },
  {
    name: "document_read",
    budgetMs: 25,
    query: `select * from documents where workspace_id='${WORKSPACE_ID}'
      and source_type='sale' and source_id='f2230000-0000-4000-8000-000000000001'
      order by version desc limit 1`,
  },
  {
    name: "idempotency_replay",
    budgetMs: 10,
    query: `select * from command_receipts where workspace_id='${WORKSPACE_ID}'
      and idempotency_key='m22-scale'`,
  },
  {
    name: "customer_reconciliation",
    budgetMs: 75,
    query: `select count(*),sum(amount_minor) from customer_account_entries
      where workspace_id='${WORKSPACE_ID}' and customer_id='f2210000-0000-4000-8000-000000000001'`,
  },
] satisfies ReadonlyArray<{
  name: string;
  budgetMs: number;
  sequentialScanPolicy?: "canonical_aggregate";
  query: string;
}>;

const percentile95 = (values: number[]): number =>
  values.toSorted((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] ?? 0;

async function evidenceFor(check: (typeof checks)[number]): Promise<Evidence> {
  const explained = await sql.unsafe<Record<string, unknown>[]>(
    `explain (analyze,buffers,format json) ${check.query}`,
  );
  const root = (explained[0]?.["QUERY PLAN"] as Array<Record<string, unknown>> | undefined)?.[0];
  if (root === undefined) throw new Error(`No EXPLAIN output for ${check.name}.`);
  const planText = JSON.stringify(root);
  const timings: number[] = [];
  for (let index = 0; index < 21; index += 1) {
    const started = performance.now();
    await sql.unsafe(check.query);
    if (index > 0) timings.push(performance.now() - started);
  }
  return {
    name: check.name,
    budgetMs: check.budgetMs,
    sequentialScanPolicy: check.sequentialScanPolicy ?? "forbidden",
    p95Ms: Number(percentile95(timings).toFixed(2)),
    planMs: Number(root["Execution Time"] ?? 0),
    sharedHits: Number(root["Shared Hit Blocks"] ?? 0),
    sharedReads: Number(root["Shared Read Blocks"] ?? 0),
    sequentialScan: /"Node Type":"Seq Scan"/.test(planText),
  };
}

try {
  await runMigrations(DATABASE_URL);
  await seed();
  await sql`analyze`;
  const evidence: Evidence[] = [];
  for (const check of checks) evidence.push(await evidenceFor(check));
  const failed = evidence.filter(
    (row) =>
      row.p95Ms > row.budgetMs || (row.sequentialScan && row.sequentialScanPolicy === "forbidden"),
  );
  console.warn(
    JSON.stringify(
      {
        dataset: {
          customers: 10_000,
          products: 10_000,
          sales: 100_000,
          purchases: 100_000,
          ledgerAndMovementRows: 1_000_000,
        },
        evidence,
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) {
    throw new Error(`M22 performance budgets failed: ${failed.map((row) => row.name).join(", ")}`);
  }
} finally {
  await sql.end();
}
