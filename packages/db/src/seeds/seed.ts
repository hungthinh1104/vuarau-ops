import { createDatabase } from "../client.ts";
import { runMigrations } from "../migrate.ts";
import {
  actors,
  customers,
  products,
  qualityGrades,
  suppliers,
  workspaces,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceOperationalProfiles,
} from "../schema/index.ts";

/**
 * Development seed: two depots, every operational role, membership edge cases,
 * five customers, six products and three quality grades.
 *
 * It seeds **master data only** — no sales, no payments, and no ledger entries.
 * Financial history is created by commands, so that seeded data is produced the
 * same way real data is. A hand-written ledger row would be the one entry in the
 * system with no command and no actor behind it (BR-ACCOUNT-004).
 */
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_WORKSPACE_ID = "11111111-1111-4111-8111-111111111112";

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

/**
 * Membership cases that are useful when reviewing session/workspace authority:
 * a person may combine non-owner roles, lose access without losing history, have
 * no depot yet, belong to another depot, or work across two depots.
 */
const SEED_CASE_ACTORS = [
  {
    id: "22222222-2222-4222-8222-222222222207",
    supabaseUserId: "22222222-2222-4222-8222-222222222207",
    displayName: "Kế toán kiêm bán hàng",
  },
  {
    id: "22222222-2222-4222-8222-222222222208",
    supabaseUserId: "22222222-2222-4222-8222-222222222208",
    displayName: "Nhân viên bán hàng đã nghỉ",
  },
  {
    id: "22222222-2222-4222-8222-222222222209",
    supabaseUserId: "22222222-2222-4222-8222-222222222209",
    displayName: "Chủ vựa Thủ Đức",
  },
  {
    id: "22222222-2222-4222-8222-222222222210",
    supabaseUserId: "22222222-2222-4222-8222-222222222210",
    displayName: "Kho vận hai vựa",
  },
];

/**
 * A real account that belongs to no depot.
 *
 * Signing in and being a member of nothing is a state the product has to render
 * (`no_workspace_membership`, BR-AUTH-008) — it is the first minute of a new
 * person's account, and it is also what a revoked worker sees. Without a seeded
 * example it is a screen nobody ever looks at until a pilot participant hits it.
 */
const SEED_UNASSIGNED_ACTORS = [
  {
    id: "22222222-2222-4222-8222-222222222206",
    supabaseUserId: "22222222-2222-4222-8222-222222222206",
    displayName: "Người chưa được thêm vào vựa",
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
  {
    id: "33333333-3333-4333-8333-333333333304",
    name: "Chú Năm lấy hàng mỗi sáng",
    phone: "0987654321",
  },
  {
    id: "33333333-3333-4333-8333-333333333305",
    name: "Khách tạm ngưng giao dịch",
    phone: "0938123456",
    isActive: false,
  },
];

const PRODUCTS = [
  { id: "44444444-4444-4444-8444-444444444401", name: "Cà chua", price: 18_000 },
  { id: "44444444-4444-4444-8444-444444444402", name: "Rau muống", price: 5_000 },
  { id: "44444444-4444-4444-8444-444444444403", name: "Ớt hiểm", price: 250_000 },
  { id: "44444444-4444-4444-8444-444444444404", name: "Dưa leo", price: 12_000 },
  { id: "44444444-4444-4444-8444-444444444405", name: "Bắp cải", price: 15_000 },
  { id: "44444444-4444-4444-8444-444444444406", name: "Hành lá", price: 35_000 },
];
const QUALITY_GRADES = [
  {
    id: "55555555-5555-4555-8555-555555555501",
    name: "Loại 1",
    sortOrder: 10,
  },
  {
    id: "55555555-5555-4555-8555-555555555502",
    name: "Loại 2",
    sortOrder: 20,
  },
  {
    id: "55555555-5555-4555-8555-555555555503",
    name: "Hàng loại bỏ",
    sortOrder: 30,
    isActive: false,
  },
];

const SUPPLIERS = [
  { id: "66666666-6666-4666-8666-666666666601", name: "Nhà vườn Củ Chi", phone: "0908000001" },
  { id: "66666666-6666-4666-8666-666666666602", name: "Hợp tác xã Đà Lạt", phone: "0908000002" },
];

export async function seed(connectionString: string): Promise<void> {
  await runMigrations(connectionString);
  const { db, sql } = createDatabase(connectionString, { max: 1 });
  const now = new Date();

  try {
    await db
      .insert(workspaces)
      .values([
        { id: WORKSPACE_ID, name: "Vựa rau Bình Điền" },
        { id: SECOND_WORKSPACE_ID, name: "Vựa rau Thủ Đức" },
      ])
      .onConflictDoNothing();
    await db
      .insert(workspaceOperationalProfiles)
      .values([{ workspaceId: WORKSPACE_ID }, { workspaceId: SECOND_WORKSPACE_ID }])
      .onConflictDoNothing();
    await db
      .insert(actors)
      .values(
        [...SEED_ACTORS, ...SEED_UNASSIGNED_ACTORS, ...SEED_CASE_ACTORS].map((actor) => ({
          id: actor.id,
          supabaseUserId: actor.supabaseUserId,
          displayName: actor.displayName,
        })),
      )
      .onConflictDoNothing();
    await db
      .insert(workspaceMemberships)
      // Deliberately `SEED_ACTORS` only: the unassigned actor gets no membership,
      // which is the whole point of it.
      .values([
        ...SEED_ACTORS.map((actor) => ({
          workspaceId: WORKSPACE_ID,
          actorId: actor.id,
          role: actor.role,
        })),
        {
          workspaceId: WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[0]!.id,
          role: "accountant" as const,
        },
        {
          workspaceId: WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[1]!.id,
          role: "sales" as const,
          isActive: false,
        },
        {
          workspaceId: SECOND_WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[2]!.id,
          role: "owner" as const,
        },
        {
          workspaceId: WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[3]!.id,
          role: "warehouse" as const,
        },
        {
          workspaceId: SECOND_WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[3]!.id,
          role: "delivery" as const,
        },
      ])
      .onConflictDoNothing();
    await db
      .insert(workspaceMembershipRoles)
      .values([
        ...SEED_ACTORS.map((actor) => ({
          workspaceId: WORKSPACE_ID,
          actorId: actor.id,
          role: actor.role,
          assignedBy: SEED_ACTORS[0]!.id,
        })),
        {
          workspaceId: WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[0]!.id,
          role: "accountant" as const,
          assignedBy: SEED_ACTORS[0]!.id,
        },
        {
          workspaceId: WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[0]!.id,
          role: "sales" as const,
          assignedBy: SEED_ACTORS[0]!.id,
        },
        {
          workspaceId: WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[1]!.id,
          role: "sales" as const,
          assignedBy: SEED_ACTORS[0]!.id,
        },
        {
          workspaceId: SECOND_WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[2]!.id,
          role: "owner" as const,
          assignedBy: SEED_CASE_ACTORS[2]!.id,
        },
        {
          workspaceId: WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[3]!.id,
          role: "warehouse" as const,
          assignedBy: SEED_ACTORS[0]!.id,
        },
        {
          workspaceId: SECOND_WORKSPACE_ID,
          actorId: SEED_CASE_ACTORS[3]!.id,
          role: "delivery" as const,
          assignedBy: SEED_CASE_ACTORS[2]!.id,
        },
      ])
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
          isActive: customer.isActive ?? true,
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
    await db
      .insert(qualityGrades)
      .values(
        QUALITY_GRADES.map((grade) => ({
          id: grade.id,
          workspaceId: WORKSPACE_ID,
          name: grade.name,
          sortOrder: grade.sortOrder,
          isActive: grade.isActive ?? true,
          version: 1,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();

    await db
      .insert(suppliers)
      .values(
        SUPPLIERS.map((supplier) => ({
          id: supplier.id,
          workspaceId: WORKSPACE_ID,
          displayName: supplier.name,
          phone: supplier.phone,
          note: null,
          isActive: true,
          version: 1,
          createdAt: now,
          updatedAt: now,
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
    `Seeded ${WORKSPACE_ID} and ${SECOND_WORKSPACE_ID} with ` +
      `${SEED_ACTORS.length + SEED_UNASSIGNED_ACTORS.length + SEED_CASE_ACTORS.length} actors, ` +
      `${CUSTOMERS.length} customers, ${PRODUCTS.length} products, ` +
      `${QUALITY_GRADES.length} quality grades and ${SUPPLIERS.length} suppliers.`,
  );
}
