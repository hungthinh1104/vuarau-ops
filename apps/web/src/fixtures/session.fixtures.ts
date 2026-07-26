import type {
  ActorWorkspacesDto,
  Money,
  SessionDto,
  WorkspaceRole,
  WorkspaceSummaryDto,
} from "@vuarau/domain-contracts";
import { permissionsForRole } from "@vuarau/domain-contracts";
import {
  ACCOUNTANT_ACTOR_ID,
  OTHER_WORKSPACE_ID,
  OWNER_ACTOR_ID,
  SALES_ACTOR_ID,
  WAREHOUSE_ACTOR_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures/ids";

/** Every amount in these fixtures. VND has no minor unit below the đồng. */
export const vnd = (amountMinor: number): Money => ({ amountMinor, currency: "VND" });

/**
 * Sessions built from the **real** role table, not a hand-written permission list.
 *
 * `permissionsForRole` is the same function the server expands a role with
 * (ADR-0011). A fixture that listed permissions by hand would let a story show a
 * void button to a `sales` worker and still pass, which is precisely the bug the
 * capability tests exist to catch.
 */
function sessionFor(actorId: SessionDto["actorId"], role: WorkspaceRole): SessionDto {
  return {
    actorId,
    workspaceId: WORKSPACE_ID,
    role,
    permissions: [...permissionsForRole(role)],
  };
}

export const ownerSession = sessionFor(OWNER_ACTOR_ID, "owner");
export const accountantSession = sessionFor(ACCOUNTANT_ACTOR_ID, "accountant");

/** Holds `sale.post` but **not** `sale.void` — the distinction most stories need. */
export const salesSession = sessionFor(SALES_ACTOR_ID, "sales");

/** Reads only. No `debt.read`, so an account screen refuses them outright. */
export const warehouseSession = sessionFor(WAREHOUSE_ACTOR_ID, "warehouse");

export const WORKSPACE_NAME = "Vựa Ba Hưng — chợ đầu mối Bình Điền";

/**
 * What `session.workspaces` answers (BR-AUTH-008), built from the same role table
 * as the sessions above.
 *
 * Two depots with **different roles** on purpose: an owner in one and a sales
 * worker in the other. A picker that carried one permission set for both would
 * enable a void control in the depot where the person may not void, and a fixture
 * with one entry could never catch it.
 */
export const workspaceChoices: readonly WorkspaceSummaryDto[] = [
  {
    workspaceId: WORKSPACE_ID,
    name: WORKSPACE_NAME,
    role: "owner",
    permissions: [...permissionsForRole("owner")],
  },
  {
    workspaceId: OTHER_WORKSPACE_ID,
    name: "Vựa Sáu Tâm — chợ Thủ Đức",
    role: "sales",
    permissions: [...permissionsForRole("sales")],
  },
];

export const ownerWorkspaces: ActorWorkspacesDto = {
  actorId: OWNER_ACTOR_ID,
  workspaces: [...workspaceChoices],
};
