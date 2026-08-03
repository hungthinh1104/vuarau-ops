# Supply Commitment state machine

```text
draft --confirm(expectedVersion)--> confirmed
  |                                  |
  +--cancel(reason)----------------> cancelled
```

Only a draft can be edited. Confirmation requires a non-empty line set and a
catalog Product on every line. Confirmed and cancelled facts are immutable;
correction creates a new draft with `replacesSupplyCommitmentId` after the
original is cancelled.

The lifecycle is commercial only. It does not imply Purchase confirmation,
supplier payable, physical Arrival, Receipt or inventory. Those transitions are
owned by their own bounded contexts.

Every successful mutation increments the optimistic `version`; retries replay
the original command result through the command receipt.

Related: [rules](../04-business-rules/supply-commitment-rules.md),
[use cases](../02-use-cases/supply-commitment-use-cases.md),
[state catalog](state-catalog.md).
