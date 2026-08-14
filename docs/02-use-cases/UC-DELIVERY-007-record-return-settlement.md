# UC-DELIVERY-007 — Settle the consequence of a physical return

**Actor:** owner or accounting role with return-settlement authority.
**Trigger:** a physical customer Return has been recorded and its commercial or
financial consequence must be named.

- **Truth dimension:** commercial/financial uncertainty after a physical fact;
  it is separate from receiving the returned goods.
- **Command:** `delivery.recordReturnSettlement`.
- **Authority:** the server requires explicit settlement authority and a Return
  belonging to the workspace's dispatched Delivery.
- **Current V1 option:** `goods_only` records that returned goods have no money
  effect. Refund, credit and replacement outcomes remain policy-blocked.
- **Correction:** settlement is append-only and a later correction links the
  superseded decision. A physical Return is never rewritten.
- **UI/read model:** the Operations Board may show
  `return_settlement_unresolved`; the physical Return remains visible after a
  goods-only settlement.
- **Effects:** `goods_only` creates no customer debt, refund or credit and no
  inventory movement; the movement belongs only to the physical Return command.

**Rules/tests:** BR-DELIVERY-008 · TC-DELIVERY-009, TC-DELIVERY-010.

## Related

- [depot operations](depot-operations-use-cases.md)
- [command registry](../10-ai-coding/command-registry.yml)
