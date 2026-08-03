# Extension boundary rules

These rules keep the core operating platform stable before product-specific
variants, AI, OCR, forecasting or experiments are built. The declaration in
`packages/domain-contracts/src/extension/` is a review contract, not an
activation registry.

### BR-EXTENSION-001 — Extensions cannot write core facts directly

An extension may produce a proposal or invoke an existing canonical command.
It may not write money, quantity, inventory, debt, payable, cash, policy or
read-model effects directly. The canonical command remains responsible for
authorization, idempotency, optimistic concurrency, transaction boundaries,
audit and correction semantics.

### BR-EXTENSION-002 — Reserved capabilities stay outside core until complete

Product variants, AI transaction entry, OCR capture, forecasting, supplier
scoring, route optimization and other experiments are reserved capabilities,
not supported core workflows. A capability is not available merely because it
has a declaration or a UI idea. Activation requires its own typed contract,
deterministic implementation, policy and source lineage, correction path,
PostgreSQL/recovery evidence and production acceptance.

## Related

- [UC-POLICY-001](../02-use-cases/UC-POLICY-001-manage-workspace-policy-version.md)
- [ADR-0030](../09-decisions/ADR-0030-core-extension-boundary.md)
- [workspace policy rules](workspace-policy-rules.md)
