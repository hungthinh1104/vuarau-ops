import { boolean, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
export const actors = pgTable("actors", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The single source of truth for "may this actor act in this workspace".
 * Roles are not modelled yet (ASM-007) — membership is currently all-or-nothing.
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
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.actorId] }),
    index("workspace_memberships_actor_idx").on(table.actorId),
  ],
);
