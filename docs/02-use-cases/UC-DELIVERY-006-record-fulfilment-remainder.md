# UC-DELIVERY-006 — Record a fulfilment-remainder decision

**Actor:** owner or warehouse/accounting role with Delivery correction authority.
**Trigger:** a posted Sale has a positive physical remainder and the operator must
record what happens next.

- **Truth dimension:** operational uncertainty about fulfilment; this is not a new
  Delivery and creates no money or inventory movement.
- **Command:** `delivery.recordFulfilmentRemainderCase`.
- **Authority:** the server checks the current canonical fulfilment calculation,
  workspace authority and command identity.
- **Lifecycle:** an `opened` fact is followed by one explicit decision. A later
  correction supersedes the prior decision; no row is edited in place.
- **Unknown outcome:** retry the identical command identity. Duplicate opens,
  stale corrections and a command for a zero remainder fail closed.
- **UI/read model:** the Operations Board may show
  `fulfilment_remainder_unresolved` with source facts and next action. Inspecting
  fulfilment alone does not own this mutation.
- **Effects:** none on customer account, payable, inventory or Sale history.

**Rules/tests:** BR-DELIVERY-009 · TC-DELIVERY-009, TC-DELIVERY-010.

## Related

- [depot operations](depot-operations-use-cases.md)
- [command registry](../10-ai-coding/command-registry.yml)
