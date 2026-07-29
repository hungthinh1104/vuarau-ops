import { and, eq } from "drizzle-orm";
import type { CustomerId, WorkspaceId } from "@vuarau/domain-contracts";
import type { CustomerState } from "@vuarau/domain-kernel";
import { customers } from "../../schema/index.ts";
import { fromIso, toCustomerState } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createCustomerWriteRepositories = (tx: Tx) => ({
  customers: {
    async findById(
      workspaceId: WorkspaceId,
      customerId: CustomerId,
    ): Promise<CustomerState | null> {
      const rows = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, customerId)))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toCustomerState(row);
    },

    async findByIdForUpdate(
      workspaceId: WorkspaceId,
      customerId: CustomerId,
    ): Promise<CustomerState | null> {
      const rows = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, customerId)))
        .limit(1)
        .for("update");
      const row = rows[0];
      return row === undefined ? null : toCustomerState(row);
    },

    async update(customer: CustomerState, expectedVersion: number): Promise<boolean> {
      const updated = await tx
        .update(customers)
        .set({
          displayName: customer.displayName,
          phone: customer.phone,
          note: customer.note,
          isActive: customer.isActive,
          version: customer.version,
          updatedAt: fromIso(customer.updatedAt),
        })
        .where(
          and(
            eq(customers.workspaceId, customer.workspaceId),
            eq(customers.id, customer.id),
            eq(customers.version, expectedVersion),
          ),
        )
        .returning({ id: customers.id });
      return updated.length === 1;
    },

    async insert(customer: CustomerState): Promise<void> {
      await tx.insert(customers).values({
        id: customer.id,
        workspaceId: customer.workspaceId,
        displayName: customer.displayName,
        phone: customer.phone,
        note: customer.note,
        isActive: customer.isActive,
        version: customer.version,
        transactionTime: fromIso(customer.transactionTime),
        recordedAt: fromIso(customer.recordedAt),
        updatedAt: fromIso(customer.updatedAt),
      });
    },
  },
});
