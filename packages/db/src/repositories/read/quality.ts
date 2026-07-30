import type { SQL } from "drizzle-orm";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { qualityGrades } from "../../schema/index.ts";
import { toIso } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createQualityGradeReadRepositories = (tx: Tx) => ({
  qualityGradeReads: {
    async list(args: { workspaceId: string; query: string; isActive: boolean | null; page: Page }) {
      const filters: SQL[] = [eq(qualityGrades.workspaceId, args.workspaceId)];
      if (args.isActive !== null) filters.push(eq(qualityGrades.isActive, args.isActive));
      if (args.query.length > 0) {
        filters.push(
          or(sql`vuarau_fold(${qualityGrades.name}) ILIKE vuarau_fold(${`%${args.query}%`})`)!,
        );
      }
      if (args.page.after !== null) {
        filters.push(
          sql`(${qualityGrades.sortOrder}, ${qualityGrades.name}, ${qualityGrades.id})
              > (${Number(args.page.after.sortValue.split(":")[0])},
                 ${args.page.after.sortValue.slice(args.page.after.sortValue.indexOf(":") + 1)},
                 ${args.page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(qualityGrades)
        .where(and(...filters))
        .orderBy(asc(qualityGrades.sortOrder), asc(qualityGrades.name), asc(qualityGrades.id))
        .limit(fetchLimit(args.page));
      return paged(
        rows.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          name: row.name,
          sortOrder: row.sortOrder,
          isActive: row.isActive,
          version: row.version,
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        })),
        args.page,
        (row) => ({ sortValue: `${row.sortOrder}:${row.name}`, id: row.id }),
      );
    },
    async get(workspaceId: string, qualityGradeId: string) {
      const rows = await tx
        .select()
        .from(qualityGrades)
        .where(
          and(eq(qualityGrades.workspaceId, workspaceId), eq(qualityGrades.id, qualityGradeId)),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined
        ? null
        : {
            id: row.id,
            workspaceId: row.workspaceId,
            name: row.name,
            sortOrder: row.sortOrder,
            isActive: row.isActive,
            version: row.version,
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          };
    },
  },
});
