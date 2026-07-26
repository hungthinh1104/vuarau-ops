import { createDatabase } from "../client.ts";
import { runMigrations } from "../migrate.ts";
import { actors, customers, products, workspaces, workspaceMemberships } from "../schema/index.ts";

/**
 * Minimal development seed: one depot, one worker, three customers, three
 * products.
 *
 * It seeds **master data only** — no sales, no payments, and no ledger entries.
 * Financial history is created by commands, so that seeded data is produced the
 * same way real data is. A hand-written ledger row would be the one entry in the
 * system with no command and no actor behind it (BR-ACCOUNT-004).
 */
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

/**
 * One actor per role, so a developer can exercise every permission path without
 * hand-editing membership rows.
 *
 * `supabaseUserId` is set on every one: an actor without it cannot authenticate
 * (BR-AUTH-005), which would make the seed useless for anything but SQL.
 * These are fixed development uuids, not credentials — they authorise nothing on
 * their own, because a real Supabase token still has to verify against them.
 */
const SEED_ACTORS = [
  {
    id: "22222222-2222-4222-8222-222222222201",
    supabaseUserId: "22222222-2222-4222-8222-222222222201",
    displayName: "Chủ vựa",
    role: "owner" as const,
  },
  {
    id: "22222222-2222-4222-8222-222222222202",
    supabaseUserId: "22222222-2222-4222-8222-222222222202",
    displayName: "Kế toán",
    role: "accountant" as const,
  },
  {
    id: "22222222-2222-4222-8222-222222222203",
    supabaseUserId: "22222222-2222-4222-8222-222222222203",
    displayName: "Nhân viên bán hàng",
    role: "sales" as const,
  },
  {
    id: "22222222-2222-4222-8222-222222222204",
    supabaseUserId: "22222222-2222-4222-8222-222222222204",
    displayName: "Nhân viên kho",
    role: "warehouse" as const,
  },
  {
    id: "22222222-2222-4222-8222-222222222205",
    supabaseUserId: "22222222-2222-4222-8222-222222222205",
    displayName: "Tài xế giao hàng",
    role: "delivery" as const,
  },
];

const CUSTOMERS = [
  {
    id: "33333333-3333-4333-8333-333333333301",
    name: "Chị Lan chợ Bình Điền",
    phone: "0901234567",
  },
  { id: "33333333-3333-4333-8333-333333333302", name: "Cô Bảy vựa Hóc Môn", phone: "0912345678" },
  { id: "33333333-3333-4333-8333-333333333303", name: "Anh Tuấn mới mở", phone: null },
];

const PRODUCTS = [
  { id: "44444444-4444-4444-8444-444444444401", name: "Cà chua", price: 18_000 },
  { id: "44444444-4444-4444-8444-444444444402", name: "Rau muống", price: 5_000 },
  { id: "44444444-4444-4444-8444-444444444403", name: "Ớt hiểm", price: 250_000 },
];

export async function seed(connectionString: string): Promise<void> {
  await runMigrations(connectionString);
  const { db, sql } = createDatabase(connectionString, { max: 1 });
  const now = new Date();

  try {
    await db
      .insert(workspaces)
      .values({ id: WORKSPACE_ID, name: "Vựa rau Bình Điền" })
      .onConflictDoNothing();
    await db
      .insert(actors)
      .values(
        SEED_ACTORS.map((actor) => ({
          id: actor.id,
          supabaseUserId: actor.supabaseUserId,
          displayName: actor.displayName,
        })),
      )
      .onConflictDoNothing();
    await db
      .insert(workspaceMemberships)
      .values(
        SEED_ACTORS.map((actor) => ({
          workspaceId: WORKSPACE_ID,
          actorId: actor.id,
          role: actor.role,
        })),
      )
      .onConflictDoNothing();

    await db
      .insert(customers)
      .values(
        CUSTOMERS.map((customer) => ({
          id: customer.id,
          workspaceId: WORKSPACE_ID,
          displayName: customer.name,
          phone: customer.phone,
          note: null,
          isActive: true,
          version: 1,
          transactionTime: now,
          recordedAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();

    await db
      .insert(products)
      .values(
        PRODUCTS.map((product) => ({
          id: product.id,
          workspaceId: WORKSPACE_ID,
          name: product.name,
          defaultUnitPriceMinor: product.price,
          currency: "VND" as const,
          isActive: true,
        })),
      )
      .onConflictDoNothing();
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith("seed.ts") === true) {
  const url = process.env["DATABASE_URL"];
  if (url === undefined) {
    console.error("DATABASE_URL is not set. See .env.example.");
    process.exit(1);
  }
  await seed(url);
  console.warn(
    `Seeded workspace ${WORKSPACE_ID} with ${SEED_ACTORS.length} actors ` +
      `(${SEED_ACTORS.map((a) => a.role).join(", ")}) and ${CUSTOMERS.length} customers.`,
  );
}
