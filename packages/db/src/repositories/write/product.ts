import { and, eq } from "drizzle-orm";
import type { ProductId, WorkspaceId } from "@vuarau/domain-contracts";
import type { ProductState } from "@vuarau/domain-kernel";
import { products } from "../../schema/index.ts";
import { fromIso } from "../row-mappers.ts";
import { toProductState } from "../shared/write-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createProductWriteRepositories = (tx: Tx) => ({
  products: {
    async findById(workspaceId: WorkspaceId, productId: ProductId): Promise<ProductState | null> {
      const rows = await tx
        .select()
        .from(products)
        .where(and(eq(products.workspaceId, workspaceId), eq(products.id, productId)))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toProductState(row);
    },
    async findByIdForUpdate(
      workspaceId: WorkspaceId,
      productId: ProductId,
    ): Promise<ProductState | null> {
      const rows = await tx
        .select()
        .from(products)
        .where(and(eq(products.workspaceId, workspaceId), eq(products.id, productId)))
        .limit(1)
        .for("update");
      const row = rows[0];
      return row === undefined ? null : toProductState(row);
    },
    async insert(product: ProductState): Promise<void> {
      await tx.insert(products).values({
        id: product.id,
        workspaceId: product.workspaceId,
        name: product.displayName,
        aliases: [...product.aliases],
        preferredUnit: product.preferredUnit,
        isActive: product.isActive,
        version: product.version,
        createdAt: fromIso(product.createdAt),
        updatedAt: fromIso(product.updatedAt),
      });
    },
    async update(product: ProductState, expectedVersion: number): Promise<boolean> {
      const rows = await tx
        .update(products)
        .set({
          name: product.displayName,
          aliases: [...product.aliases],
          preferredUnit: product.preferredUnit,
          isActive: product.isActive,
          version: product.version,
          updatedAt: fromIso(product.updatedAt),
        })
        .where(
          and(
            eq(products.workspaceId, product.workspaceId),
            eq(products.id, product.id),
            eq(products.version, expectedVersion),
          ),
        )
        .returning({ id: products.id });
      return rows.length === 1;
    },
  },
});
