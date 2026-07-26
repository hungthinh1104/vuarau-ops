import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { workspaceRoleEnum } from "./enums.ts";

/** A depot (vựa). The tenant boundary every business row is filtered by. */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
