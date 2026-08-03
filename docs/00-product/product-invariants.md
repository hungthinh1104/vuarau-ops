# Product-level invariants

These invariants govern the whole transaction operating system. Context-specific
rules refine them but may not weaken them.

1. **Commercial truth, financial truth, and physical truth are separate
   dimensions.** A Sale or Purchase agreement, a customer or supplier account
   effect, and a goods movement are distinct facts even when one workflow links
   them.
2. **No lifecycle event silently creates an effect in another dimension.** Every
   cross-dimension effect is named in a command contract and protected by a
   business rule. `PostSale`, `ConfirmPurchase`, Receiving, Dispatch and Return
   must not borrow one another's meaning.
3. **Every money and goods effect has exactly one attributable source.** Canonical
   ledger entries and inventory movements identify their workspace, source type,
   source id, actor, command and business time; retries do not create a second
   effect.
4. **Correction never erases history.** Voids, reversals, returns, replacements
   and adjustments append attributable facts. They do not rewrite the original
   transaction.
5. **Projections and reports are disposable views, never canonical truth.**
   Customer balances, supplier balances, inventory quantities and operational
   reports can be rebuilt from canonical source-linked entries.
6. **AI may propose but never bypass deterministic commands.** Any future
   suggestion remains reviewable input; authorization, validation, idempotency,
   effects and audit stay in the existing command path.
7. **Automated verification is not field validation.** Tests can prove the
   implemented contract and integrity properties. Only observed depot use can
   validate recognition semantics, usability and operational fit.
8. **A posted Sale has a fulfilment identity.** Draft text may be unresolved
   while a worker is typing, but posting always requires an active canonical
   workspace Product. Quality/Grade is a workspace policy and is optional for a
   workspace that records ungraded quantity; the current grade-aware path keeps
   that choice explicit rather than claiming that every depot needs a Grade.
   Immutable lines keep canonical ids and human-readable snapshots.
9. **Commercial grade belongs to physical quantity, not Product identity.** Under
   the current grade-aware model, Inventory, Receiving, Sale fulfilment, Delivery
   and Return preserve exact `Product + QualityGrade + unit`; reclassification
   appends a conserving movement pair and never rewrites history. Condition,
   Defect and disposition/inspection workflows are distinct concepts and are not
   implemented merely by calling them grades.

## Evidence vocabulary

- **Technically proven:** an automated or inspected artifact demonstrates the
  implementation on the stated stack.
- **Field-validated:** a named depot participant has used or confirmed the
  behavior under the validation plan, with recorded evidence.
- **Still hypothetical:** the intended outcome has neither sufficient technical
  proof nor field evidence, or requires an unresolved owner decision.

See the [decision backlog](../09-decisions/decision-backlog.md) for policy status
and the [validation plan](validation-plan.md) for field hypotheses.
