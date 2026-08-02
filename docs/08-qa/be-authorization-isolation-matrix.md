# Backend authorization and workspace-isolation matrix

This matrix records evidence for the first backend audit slice. A row is only
closed when the behavior is exercised at the application, router/contract and
PostgreSQL layers where that layer owns a distinct risk.

| Boundary | Required property | Application evidence | Router/contract evidence | PostgreSQL evidence |
| --- | --- | --- | --- | --- |
| Command identity | `actorId` cannot impersonate the authenticated principal | `authorization.app.test.ts` — impersonation refusal | `router.contract.test.ts` — `TC-CUSTOMER-003` | workspace command tests preserve actor attribution |
| Membership | revoked/inactive members cannot command | `authorization.app.test.ts` — inactive membership | router auth procedures require the trusted principal | `workspace-discovery.db.test.ts` — revoke takes effect on next request |
| Capability | multi-role permissions are the normalized union | `authorization.app.test.ts` — `permissionsForRoles` | `router.contract.test.ts` — role-specific capabilities | `workspace-discovery.db.test.ts` — role set persists and reads back |
| Read isolation | valid entity ID plus foreign `workspaceId` is refused | shared command/read authorization tests | `router.contract.test.ts` — foreign workspace read | `read-models.db.test.ts`, `catalog-operations.db.test.ts`, `supplier-account.db.test.ts` |
| Write isolation | command cannot write to an unowned workspace | shared command authorization tests | `router.contract.test.ts` — foreign workspace command | `goods-truth.db.test.ts` and workspace-scoped repository tests |
| Membership isolation | workspace discovery returns only active memberships for the actor | session application tests | `router.contract.test.ts` — `session.workspaces` | `workspace-discovery.db.test.ts` — actor/workspace predicates |
| Mutation ordering | authorization is checked before mutation/idempotency consumption | authorization application tests | router maps refusal to domain error | DB suites assert no cross-workspace source rows are created |

This is an evidence map, not a module index. The canonical dependency map remains
[`REPO_MAP.md`](../10-ai-coding/REPO_MAP.md), and the machine-readable use-case
relationships remain [`trace-map.yml`](trace-map.yml).
