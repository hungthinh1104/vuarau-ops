import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspace.ts";

export const qualityGrades = pgTable(
  "quality_grades",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("quality_grades_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("quality_grades_workspace_name_uq").on(table.workspaceId, table.name),
    index("quality_grades_workspace_order_idx").on(
      table.workspaceId,
      table.sortOrder,
      table.name,
      table.id,
    ),
  ],
);
