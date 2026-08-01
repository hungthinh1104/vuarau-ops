import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  cashbookModeEnum,
  deliveryModeEnum,
  intakeModeEnum,
  weighingModeEnum,
  inventoryModeEnum,
  purchasingModeEnum,
  qualityGradeModeEnum,
  workspaceRoleEnum,
} from "./enums.ts";

/** A depot (vựa). The tenant boundary every business row is filtered by. */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});


/**
 * Versioned, explicit operating choices for one depot. This is not a general
 * feature-flag bag: each column changes command semantics and is audited.
 */
export const workspaceOperationalProfiles = pgTable(
  "workspace_operational_profiles",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    purchasingMode: purchasingModeEnum("purchasing_mode")
      .notNull()
      .default("purchase_receiving"),
    inventoryMode: inventoryModeEnum("inventory_mode").notNull().default("movement_ledger"),
    qualityGradeMode: qualityGradeModeEnum("quality_grade_mode").notNull().default("required"),
    deliveryMode: deliveryModeEnum("delivery_mode").notNull().default("sale_fulfilment"),
    cashbookMode: cashbookModeEnum("cashbook_mode").notNull().default("disabled"),
    intakeMode: intakeModeEnum("intake_mode").notNull().default("direct_receipt"),
    weighingMode: weighingModeEnum("weighing_mode").notNull().default("quantity_only"),
    businessDayStartMinute: integer("business_day_start_minute").notNull().default(0),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "workspace_operational_profiles_day_start_ck",
      sql`${table.businessDayStartMinute} between 0 and 1439`,
    ),
    check(
      "workspace_operational_profiles_dependencies_ck",
      sql`${table.inventoryMode} <> 'disabled'
        or (${table.purchasingMode} = 'disabled'
          and ${table.qualityGradeMode} = 'disabled'
          and ${table.deliveryMode} = 'disabled')`,
    ),
    check(
      "workspace_operational_profiles_intake_dependencies_ck",
      sql`${table.intakeMode} <> 'inspected_arrival'
        or (${table.purchasingMode} <> 'disabled' and ${table.inventoryMode} <> 'disabled')`,
    ),
    check(
      "workspace_operational_profiles_weighing_dependencies_ck",
      sql`${table.weighingMode} <> 'gross_tare_net'
        or ${table.intakeMode} = 'inspected_arrival'`,
    ),
    check("workspace_operational_profiles_version_ck", sql`${table.version} >= 1`),
  ],
);

/**
 * A person who issues commands. Kept as a local table rather than pointing
 * straight at Supabase's `auth.users` so that the audit trail still resolves if
 * the auth provider changes.
 */
export const actors = pgTable(
  "actors",
  {
    id: uuid("id").primaryKey(),
    /**
     * The `sub` claim of a verified Supabase JWT.
     *
     * `text`, not `uuid`: JWT `sub` is a string by specification, and this column
     * mirrors an identity an external system issues. Supabase happens to emit a
     * uuid today; constraining our schema to that would make us wrong the moment
     * it does not.
     *
     * Nullable on purpose: seeds and future importers need an actor to attribute
     * rows to, and an actor with no verified identity simply cannot
     * authenticate — the correct outcome, not a gap (BR-AUTH-005).
     */
    supabaseUserId: text("supabase_user_id"),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One subject maps to at most one actor, so resolution is unambiguous.
    unique("actors_supabase_user_id_unique").on(table.supabaseUserId),
  ],
);

/**
 * The single source of truth for "may this actor act in this workspace, and as
 * what". `role` drives the permission check in the command pipeline
 * (BR-AUTH-004); `is_active` revokes access without deleting the audit trail of
 * who was once a member (BR-AUTH-003).
 */
export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    /**
     * Defaults to `owner` so that the migration cannot lock an existing depot out
     * of its own data — every pre-existing membership meant unrestricted access.
     * Knowingly over-permissive until roles are assigned; see ASM-018.
     */
    role: workspaceRoleEnum("role").notNull().default("owner"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.actorId] }),
    index("workspace_memberships_actor_idx").on(table.actorId),
  ],
);

/**
 * Normalized operational roles for one lifecycle membership (ADR-0021).
 *
 * `workspace_memberships.role` remains a transitional primary projection during
 * the dual-read migration. New authorization reads this relation and falls back
 * to the projection only when an old/imported row has not been backfilled yet.
 */
export const workspaceMembershipRoles = pgTable(
  "workspace_membership_roles",
  {
    workspaceId: uuid("workspace_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    role: workspaceRoleEnum("role").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid("assigned_by").references(() => actors.id),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.actorId, table.role] }),
    foreignKey({
      columns: [table.workspaceId, table.actorId],
      foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.actorId],
      name: "workspace_membership_roles_membership_fk",
    }).onDelete("cascade"),
    index("workspace_membership_roles_actor_idx").on(table.actorId),
  ],
);
