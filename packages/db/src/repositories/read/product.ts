import { and, asc, eq, or, sql, SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { products } from "../../schema/index.ts";
import { unitSchema } from "@vuarau/domain-contracts";
import { toIso } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createProductReadRepositories = (tx: Tx) => ({
  productReads: {
    async search(args: {
      workspaceId: string;
      query: string;
      isActive: boolean | null;
      page: Page;
    }) {
      const filters: SQL[] = [eq(products.workspaceId, args.workspaceId)];
      if (args.isActive !== null) filters.push(eq(products.isActive, args.isActive));
      if (args.query.length > 0) {
        const pattern = `%${args.query}%`;
        filters.push(
          or(
            sql`vuarau_fold(${products.name}) ILIKE vuarau_fold(${pattern})`,
            sql`EXISTS (SELECT 1 FROM unnest(${products.aliases}) alias WHERE vuarau_fold(alias) ILIKE vuarau_fold(${pattern}))`,
          )!,
        );
      }
      if (args.page.after !== null) {
        filters.push(
          sql`(${products.name}, ${products.id}) > (${args.page.after.sortValue}, ${args.page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(products)
        .where(and(...filters))
        .orderBy(asc(products.name), asc(products.id))
        .limit(fetchLimit(args.page));
      return paged(
        rows.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          displayName: row.name,
          aliases: row.aliases,
          preferredUnit: row.preferredUnit === null ? null : unitSchema.parse(row.preferredUnit),
          isActive: row.isActive,
          version: row.version,
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        })),
        args.page,
        (row) => ({ sortValue: row.displayName, id: row.id }),
      );
    },
    async get(workspaceId: string, productId: string) {
      const rows = await tx
        .select()
        .from(products)
        .where(and(eq(products.workspaceId, workspaceId), eq(products.id, productId)))
        .limit(1);
      const row = rows[0];
      return row === undefined
        ? null
        : {
            id: row.id,
            workspaceId: row.workspaceId,
            displayName: row.name,
            aliases: row.aliases,
            preferredUnit: row.preferredUnit === null ? null : unitSchema.parse(row.preferredUnit),
            isActive: row.isActive,
            version: row.version,
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          };
    },
  },
});
