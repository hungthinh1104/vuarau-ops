# ADR-0030 — Keep product-specific extensions outside the core fact boundary

**Status:** accepted and implemented as a boundary contract · 2026-08-04

## Context

The core operating cycle must remain deterministic while the product may later
serve different depot variants or add AI, OCR, forecasting and experimental
workflows. Allowing those ideas to write directly into money, goods, policy or
read-model tables would create a second business-rule implementation and make
historical results irreproducible.

## Decision

Reserve extension capabilities in a typed domain-contract declaration. The
domain kernel accepts only proposal output or an existing canonical command as
an extension execution mode. Direct core effects are not representable by the
declaration schema and are rejected by the kernel guard.

The boundary is deliberately not a plugin runtime, activation API, database
table or UI route. A future extension earns a separate vertical slice only
after it has its own typed effect contract, authorization, idempotency,
concurrency, transaction, audit, correction, PostgreSQL, recovery and field
evidence. The core branch may record the boundary without pretending those
capabilities are supported.

## Consequences

**Good:** future experiments cannot silently become a second source of truth;
the core command pipeline remains the only way to create business effects.

**Cost:** extension authors must build and verify a complete adapter before an
extension can affect the operating cycle.

**Not solved:** no product-specific extension, AI, OCR, forecasting, supplier
score or route optimization is implemented by this decision.

## Alternatives considered

| Alternative                                          | Why rejected                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Let each experiment write through its own repository | Creates unreviewed money/goods effects and bypasses core invariants.                                             |
| Add a generic plugin/event bus now                   | Makes unsupported semantics executable without a typed effect contract.                                          |
| Keep the boundary only in documentation              | A future adapter could accidentally bypass the documented intent; the kernel guard makes the refusal executable. |

## Revisit when

Revisit when a named extension has an approved product definition and complete
canonical effect, policy, correction, persistence, recovery and real-stack
evidence. Until then its declaration remains reserved or experimental outside
the core runtime.

## Related

- [extension boundary rules](../04-business-rules/extension-boundary-rules.md)
- [ADR-0028](ADR-0028-versioned-workspace-policy-registry.md)
- [scope](../00-product/scope.md)
