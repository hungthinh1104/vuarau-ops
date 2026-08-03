# ADR-0020 — application-enforced workspace isolation

**Status:** accepted

**Decision:** 2026-07-29

**Closes:** ASM-009

## Context

Every authenticated business table shares one PostgreSQL database. RLS is not
configured. Before multi-tenant production, the system needs one unambiguous
authority for tenant isolation rather than a claim that two incomplete mechanisms
protect it.

## Decision

Workspace isolation is enforced by the application transaction boundary:

1. JWT verification resolves one local actor.
2. `runCommand` and `runQuery` authorize active membership before reading business
   data.
3. Repository inputs require `workspaceId`; composite joins and foreign keys keep
   source relationships in that workspace.
4. The tRPC surface exports no unauthenticated procedure builder.
5. `pnpm security:surface` fails if a command/query procedure is not rooted in the
   authenticated builders or if the public-route allowlist changes.
6. PostgreSQL and API tests exercise foreign workspace identifiers across money,
   goods, document, report, restore and membership boundaries.

RLS is not a second, partially duplicated policy. The database credential is an
operator capability and must not be exposed to users, browsers, support sessions,
or public networks.

## Production gate

Multi-tenant deployment is refused unless:

- `security:surface`, contract tests and PostgreSQL isolation tests pass in CI;
- the API database role is private, least-privilege for the application schema,
  and inaccessible to end users;
- backup/operator access is separately controlled and audited;
- no ad-hoc endpoint bypasses `runCommand` or `runQuery`.

A future RLS migration requires its own ADR and parity tests. It may add defense in
depth but may not become a divergent copy of role/business policy.

## Consequences

- ASM-009 is decided, not deferred.
- A compromised application process can reach multiple workspaces; network,
  secret, support-access and database-role controls therefore remain P0.
- Isolation tests and the surface checker are deployment evidence, not a claim
  that a production credential has already been provisioned.

## Alternatives considered

- PostgreSQL RLS now: rejected because it would duplicate an already broad
  application authorization policy before parity tests and an operator-role model
  exist.
- Workspace-specific databases: rejected for the current product scale because it
  would multiply migration, backup and restore operations without removing the
  application authorization boundary.
- Unscoped repositories with filtering at the transport edge: rejected because a
  missed filter would become a direct cross-workspace disclosure.

## Revisit when

Revisit before any direct database access is delegated outside the private
application/operator boundary, or when a reviewed RLS design can prove policy
parity through PostgreSQL isolation tests.
