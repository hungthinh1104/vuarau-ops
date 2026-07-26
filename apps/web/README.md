# apps/web — intentionally not scaffolded

This directory is a placeholder. **No UI is built in this phase**
([scope](../../docs/00-product/scope.md)).

Next.js and React are not installed. Scaffolding an App Router project now would
add a large dependency tree and a build pipeline to a repository whose backend
contracts are still settling, for zero delivered value — and the brief explicitly
excludes production UI.

## What is already in place for it

The backend was designed so that the web app can be added without changing it:

- `@vuarau/domain-contracts` is dependency-free apart from Zod and is safe to
  import from browser code. Branded ids, `Money`, DTO schemas, and the stable
  rejection-code catalogue all come from there.
- `AppRouter` is exported from `@vuarau/api`, so a tRPC client gets full type
  inference with no code generation step.
- DTOs already carry server-computed `capabilities`, so the UI can disable a
  control for exactly the reason the server would refuse it — without
  re-implementing a rule
  ([capabilities](../../docs/06-api-contracts/capabilities.md)).
- Errors arrive as a stable `{ code, message, details, retryable }` envelope
  ([error contract](../../docs/06-api-contracts/error-contract.md)). Branch on
  `code`; never on `message`.

## When it is built

The product constraints it must serve are in
[docs/00-product/product-brief.md](../../docs/00-product/product-brief.md):
users aged roughly 40–60, unstable 4G, order entry in seconds, offline capture.

Client-supplied ids and idempotency keys are already part of every command, which
is the part of offline support that had to be decided at the backend
([ADR-0008](../../docs/09-decisions/ADR-0008-idempotency-records.md)). The sync
engine itself is future work.
