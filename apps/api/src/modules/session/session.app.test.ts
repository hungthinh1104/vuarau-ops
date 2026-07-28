import { beforeEach, describe, expect, it } from "vitest";
import { permissionsForRole } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  FOREIGN_ACTOR_ID,
  OTHER_WORKSPACE_ID,
  OTHER_WORKSPACE_NAME,
  REVOKED_ACTOR_ID,
  SALES_ACTOR_ID,
  WORKSPACE_ID,
  WORKSPACE_NAME,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { getSession, getWorkspaceDetail, listActorWorkspaces } from "./session.queries.ts";
import {
  addWorkspaceMember,
  changeWorkspaceMemberRole,
  reactivateWorkspaceMember,
} from "./manage-membership.handler.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

/**
 * BR-AUTH-008 / TC-AUTH-014 — which depots a caller may act in.
 *
 * This is the read that replaced a list configured in the browser. The property
 * that matters is not that it returns rows: it is that **the answer is a function
 * of the verified token and of nothing else**. There is no input to this query,
 * so every test here works by changing the identity and nothing but the identity.
 */
describe("BR-AUTH-008 / TC-AUTH-014 — workspace discovery", () => {
  it("returns the caller's own depots, named, with their permissions", async () => {
    const result = await listActorWorkspaces(harness.contextFor(ACTOR_ID));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.actorId).toBe(ACTOR_ID);
    expect(result.value.workspaces).toEqual([
      {
        workspaceId: WORKSPACE_ID,
        name: WORKSPACE_NAME,
        role: "owner",
        permissions: [...permissionsForRole("owner")],
      },
    ]);
  });

  it("does not show a depot the caller is not a member of", async () => {
    // FOREIGN_ACTOR_ID belongs to OTHER_WORKSPACE_ID only. Knowing an id is not
    // access, and neither is holding a valid token (BR-CUSTOMER-002).
    const mine = await listActorWorkspaces(harness.contextFor(ACTOR_ID));
    const theirs = await listActorWorkspaces(harness.contextFor(FOREIGN_ACTOR_ID));

    expect(mine.ok && mine.value.workspaces.map((w) => w.workspaceId)).toEqual([WORKSPACE_ID]);
    expect(theirs.ok && theirs.value.workspaces.map((w) => w.workspaceId)).toEqual([
      OTHER_WORKSPACE_ID,
    ]);
  });

  it("shows nothing to an actor whose membership was revoked", async () => {
    // Not an error, and not a depot they can be shown and then refused at. A
    // revoked worker sees exactly what a stranger sees (BR-AUTH-003).
    const result = await listActorWorkspaces(harness.contextFor(REVOKED_ACTOR_ID));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.workspaces).toEqual([]);
  });

  it("carries the permissions of the role held in each depot, not one role overall", async () => {
    // The same person is an owner in one depot and a sales worker in another.
    // A picker that showed one permission set for both would enable a void
    // button in the depot where they may not void.
    harness.db.grantMembership(OTHER_WORKSPACE_ID, ACTOR_ID, "sales", true);

    const result = await listActorWorkspaces(harness.contextFor(ACTOR_ID));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const byId = new Map(result.value.workspaces.map((w) => [w.workspaceId, w]));
    expect(byId.get(WORKSPACE_ID)?.permissions).toContain("sale.void");
    expect(byId.get(OTHER_WORKSPACE_ID)?.role).toBe("sales");
    expect(byId.get(OTHER_WORKSPACE_ID)?.permissions).not.toContain("sale.void");
    expect(byId.get(OTHER_WORKSPACE_ID)?.permissions).toContain("sale.post");
  });

  it("orders by name, so a picker does not reshuffle under somebody's thumb", async () => {
    harness.db.grantMembership(OTHER_WORKSPACE_ID, ACTOR_ID, "sales", true);

    const result = await listActorWorkspaces(harness.contextFor(ACTOR_ID));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // "Vựa rau Bình Điền" before "Vựa rau Thủ Đức" — by name, not by id.
    expect(result.value.workspaces.map((w) => w.name)).toEqual([
      OTHER_WORKSPACE_NAME,
      WORKSPACE_NAME,
    ]);
  });

  it("gives two identities two different answers, from identity alone", async () => {
    // The query takes no argument beyond the context, so this is the whole of its
    // input surface. If these two agreed, the actor filter would not be applied.
    const owner = await listActorWorkspaces(harness.contextFor(ACTOR_ID));
    const sales = await listActorWorkspaces(harness.contextFor(SALES_ACTOR_ID));

    expect(owner.ok && owner.value.actorId).toBe(ACTOR_ID);
    expect(sales.ok && sales.value.actorId).toBe(SALES_ACTOR_ID);
    expect(owner.ok && owner.value.workspaces[0]?.role).toBe("owner");
    expect(sales.ok && sales.value.workspaces[0]?.role).toBe("sales");
  });
});

describe("BR-AUTH-007 / TC-AUTH-015 — self-service membership administration", () => {
  const envelope = (key: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: key,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: "2026-07-20T05:00:00.000Z",
  });

  it("lets an owner inspect members while a sales worker is refused by the server", async () => {
    const owner = await getWorkspaceDetail(harness.ctx, WORKSPACE_ID);
    expect(owner.ok).toBe(true);
    if (!owner.ok) return;
    expect(owner.value.members.some((member) => member.actorId === SALES_ACTOR_ID)).toBe(true);

    const sales = await getWorkspaceDetail(harness.contextFor(SALES_ACTOR_ID), WORKSPACE_ID);
    expect(sales.ok).toBe(false);
    if (sales.ok) return;
    expect(sales.error.code).toBe("PERMISSION_DENIED");
  });

  it("adds an existing actor once and replays the same command safely", async () => {
    const command = {
      ...envelope("member-add-foreign"),
      payload: {
        actorId: FOREIGN_ACTOR_ID,
        role: "warehouse" as const,
        reason: "Bổ sung nhân sự kho",
      },
    };
    const first = await addWorkspaceMember(harness.ctx, command);
    const replay = await addWorkspaceMember(harness.ctx, command);

    expect(first.ok).toBe(true);
    expect(replay).toEqual(first);
    const detail = await getWorkspaceDetail(harness.ctx, WORKSPACE_ID);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(
      detail.value.members.filter((member) => member.actorId === FOREIGN_ACTOR_ID),
    ).toHaveLength(1);
  });

  it("changes another member's role and the next authorization read sees it", async () => {
    const changed = await changeWorkspaceMemberRole(harness.ctx, {
      ...envelope("member-role-sales-accountant"),
      payload: {
        actorId: SALES_ACTOR_ID,
        expectedRole: "sales",
        role: "accountant",
        reason: "Chuyển sang phụ trách sổ",
      },
    });
    expect(changed.ok).toBe(true);

    const session = await getSession(harness.contextFor(SALES_ACTOR_ID), WORKSPACE_ID);
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.value.role).toBe("accountant");
    expect(session.value.permissions).toContain("debt.adjust");
  });

  it("refuses self-role changes and non-owner administration", async () => {
    const self = await changeWorkspaceMemberRole(harness.ctx, {
      ...envelope("member-role-self"),
      payload: {
        actorId: ACTOR_ID,
        expectedRole: "owner",
        role: "accountant",
        reason: "Tự đổi vai trò",
      },
    });
    expect(self.ok).toBe(false);
    if (self.ok) return;
    expect(self.error.code).toBe("WORKSPACE_MEMBER_SELF_ROLE_CHANGE_DENIED");

    const sales = await reactivateWorkspaceMember(harness.contextFor(SALES_ACTOR_ID), {
      ...envelope("member-reactivate-denied"),
      actorId: SALES_ACTOR_ID,
      payload: { actorId: REVOKED_ACTOR_ID, reason: "Không đủ quyền" },
    });
    expect(sales.ok).toBe(false);
    if (sales.ok) return;
    expect(sales.error.code).toBe("PERMISSION_DENIED");
  });

  it("reactivates a revoked membership without deleting its identity", async () => {
    const activated = await reactivateWorkspaceMember(harness.ctx, {
      ...envelope("member-reactivate"),
      payload: { actorId: REVOKED_ACTOR_ID, reason: "Quay lại làm việc" },
    });
    expect(activated.ok).toBe(true);

    const session = await getSession(harness.contextFor(REVOKED_ACTOR_ID), WORKSPACE_ID);
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.value.role).toBe("owner");
  });
});
