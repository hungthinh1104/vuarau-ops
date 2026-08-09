import { beforeEach, describe, it } from "vitest";
import type { CustomerId } from "@vuarau/domain-contracts";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID, activeCustomer } from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { assertCustomerReadContract } from "../../testing/adapter-contracts.ts";

describe("in-memory repository contract", () => {
  let harness: Harness;
  const secondCustomerId = "00000000-0000-4000-8000-000000009901" as CustomerId;
  const foreignCustomerId = "00000000-0000-4000-8000-000000009902" as CustomerId;

  beforeEach(() => {
    harness = createHarness();
    harness.db.seedCustomer({
      ...activeCustomer,
      id: secondCustomerId,
      displayName: "Khách thứ hai",
    });
    harness.db.seedCustomer({
      ...activeCustomer,
      id: foreignCustomerId,
      workspaceId: OTHER_WORKSPACE_ID,
      displayName: "Khách ngoài vựa",
    });
  });

  it("TC-ADAPTER-INMEMORY-001 applies paging and workspace isolation", async () => {
    const adapter = await harness.db.unitOfWork().transaction(async (repositories) => ({
      search: repositories.customerReads.search,
      get: repositories.customerReads.get,
    }));
    await assertCustomerReadContract({
      adapter,
      workspaceId: WORKSPACE_ID,
      foreignWorkspaceId: OTHER_WORKSPACE_ID,
      firstCustomerId: activeCustomer.id,
      secondCustomerId,
      foreignCustomerId,
    });
  });
});
