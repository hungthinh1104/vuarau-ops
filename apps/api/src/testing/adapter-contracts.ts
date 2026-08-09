import assert from "node:assert/strict";
import type { CustomerId, WorkspaceId } from "@vuarau/domain-contracts";
import type { CustomerReadRepository } from "../infrastructure/persistence/read-ports.ts";

export type CustomerReadAdapter = Pick<CustomerReadRepository, "search" | "get">;

/**
 * The smallest shared repository contract worth running twice: deterministic
 * keyset paging and workspace isolation. It deliberately knows nothing about
 * Drizzle or the in-memory store, so either adapter can diverge without making
 * the test itself choose one implementation's shape.
 */
export async function assertCustomerReadContract(args: {
  readonly adapter: CustomerReadAdapter;
  readonly workspaceId: WorkspaceId;
  readonly foreignWorkspaceId: WorkspaceId;
  readonly firstCustomerId: CustomerId;
  readonly secondCustomerId: CustomerId;
  readonly foreignCustomerId: CustomerId;
}): Promise<void> {
  const first = await args.adapter.search({
    workspaceId: args.workspaceId,
    query: "",
    isActive: true,
    page: { after: null, limit: 1 },
  });
  assert.equal(first.rows.length, 1);
  const cursor = first.next;
  assert.notEqual(cursor, null, "two local customers must produce a continuation cursor");

  const second = await args.adapter.search({
    workspaceId: args.workspaceId,
    query: "",
    isActive: true,
    page: { after: cursor, limit: 1 },
  });
  assert.equal(second.rows.length, 1);
  assert.notEqual(first.rows[0]!.id, second.rows[0]!.id);

  const all = await args.adapter.search({
    workspaceId: args.workspaceId,
    query: "",
    isActive: true,
    page: { after: null, limit: 10 },
  });
  assert.deepEqual(
    new Set(all.rows.map((row) => row.id)),
    new Set([args.firstCustomerId, args.secondCustomerId]),
  );
  assert.ok(all.rows.every((row) => row.workspaceId === args.workspaceId));
  assert.equal(await args.adapter.get(args.workspaceId, args.foreignCustomerId), null);
  assert.equal(args.foreignWorkspaceId === args.workspaceId, false);
}
