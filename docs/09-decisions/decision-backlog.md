# Decision backlog — business policy, decided and undecided

Every entry is classified. There are four classifications, and **no entry is left
with an ambiguous default**:

| Classification            | Meaning                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **decided**               | Answered. The rule, the case and the test exist. Not a default any more.                                  |
| **deferred with trigger** | Still open, with a stated default **and a named event that forces the decision**.                         |
| **operational action**    | Not a design question. Somebody has to go and do something.                                               |
| **policy-blocked**        | No safe policy default exists; the capability stays unavailable until field evidence closes the question. |

A "deferred" entry without a trigger is just a guess with better manners, so every
deferred row below names the event that ends the deferral.

## The register

| ID      | Question                                                                                         | Classification            | Answer / default                                                                                                                                                                                                                                                                        | Trigger or owner                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASM-001 | Can a customer balance go negative?                                                              | **decided**               | Yes — `customer_credit` (BR-ACCOUNT-007, BR-ACCOUNT-009)                                                                                                                                                                                                                                | —                                                                                                                                                                                 |
| ASM-002 | Does the receivable arise at posting, delivery, or invoicing?                                    | **decided**               | **Posting** (ADR-0014, BR-SALE-020)                                                                                                                                                                                                                                                     | —                                                                                                                                                                                 |
| ASM-003 | Can a payment exceed the receivable?                                                             | **decided**               | Yes — follows ASM-001                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                 |
| ASM-004 | Can a payment stay unallocated to a sale?                                                        | **decided/configurable**  | Yes — unallocated remains valid; an approved `manual` or `specific_sale` policy may add append-only attribution                                                                                                                                                                         | —                                                                                                                                                                                 |
| ASM-005 | Can a posted sale be cancelled?                                                                  | **decided**               | It is **voided**, not cancelled (BR-SALE-012)                                                                                                                                                                                                                                           | —                                                                                                                                                                                 |
| ASM-006 | Are partial payment reversals allowed?                                                           | **decided**               | Yes (BR-PAYMENT-003)                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                 |
| ASM-007 | What permission is required to adjust a balance?                                                 | **decided**               | `debt.adjust` — owner, accountant (ADR-0011)                                                                                                                                                                                                                                            | —                                                                                                                                                                                 |
| ASM-008 | How do product price changes affect posted sales?                                                | **decided**               | Never — lines snapshot name and price (BR-SALE-011)                                                                                                                                                                                                                                     | —                                                                                                                                                                                 |
| ASM-009 | Is workspace isolation enforced by RLS or the application?                                       | **decided**               | **Application layer**, with a mandatory surface/isolation deployment gate ([ADR-0020](ADR-0020-application-workspace-isolation.md))                                                                                                                                                     | —                                                                                                                                                                                 |
| ASM-010 | How is a wrong posted sale corrected?                                                            | **decided**               | `VoidSale` + optional replacement (BR-ACCOUNT-010)                                                                                                                                                                                                                                      | —                                                                                                                                                                                 |
| ASM-011 | Are units convertible (lạng → gram)?                                                             | **deferred with trigger** | **No conversion at all**                                                                                                                                                                                                                                                                | First depot that quotes one product in two units                                                                                                                                  |
| ASM-012 | Should duplicate customer names be blocked?                                                      | **deferred with trigger** | **Allowed, no warning**                                                                                                                                                                                                                                                                 | First support report of a misattributed balance                                                                                                                                   |
| ASM-013 | Does the API need a compiled `dist/` build?                                                      | **decided**               | No — Node 24 runs TypeScript directly                                                                                                                                                                                                                                                   | —                                                                                                                                                                                 |
| ASM-014 | How long are `command_receipts` retained?                                                        | **deferred with trigger** | **Forever** — no pruning                                                                                                                                                                                                                                                                | The table passes 10 M rows or query latency degrades                                                                                                                              |
| ASM-015 | Does a customer have a credit limit?                                                             | **deferred with trigger** | **No such concept**                                                                                                                                                                                                                                                                     | A depot asks to block a sale on outstanding balance                                                                                                                               |
| ASM-016 | What makes a balance "overdue"? Payment terms?                                                   | **decided/configurable**  | Explicit `dueAt` or a versioned effective `payment_terms_aging` snapshot; no term is never overdue (BR-AGING-005, BR-SALE-017)                                                                                                                                                          | Owner selects the approved workspace policy before using aging                                                                                                                    |
| ASM-017 | Is the role→permission mapping right beyond `debt.adjust`?                                       | **operational action**    | Least-privilege defaults, unconfirmed                                                                                                                                                                                                                                                   | Depot owner confirms the table                                                                                                                                                    |
| ASM-018 | Existing memberships were backfilled as `owner`                                                  | **operational action**    | Deliberate; roles need assigning                                                                                                                                                                                                                                                        | Operator assigns real roles before go-live                                                                                                                                        |
| ASM-019 | May a customer with a non-zero balance be deactivated?                                           | **deferred with trigger** | **Yes** — balance preserved and surfaced (BR-CUSTOMER-003)                                                                                                                                                                                                                              | First depot that deactivates a customer in debt                                                                                                                                   |
| ASM-020 | Do large adjustments or voids need a second approver?                                            | **deferred with trigger** | **No** — one actor, fully attributed                                                                                                                                                                                                                                                    | A depot reports a disputed adjustment or void                                                                                                                                     |
| ASM-021 | Do abandoned sale drafts expire?                                                                 | **deferred with trigger** | **No** — drafts live forever, harmlessly                                                                                                                                                                                                                                                | The draft list becomes unusable in daily use                                                                                                                                      |
| ASM-022 | Are reads audited?                                                                               | **deferred with trigger** | **No** — only state changes are audited                                                                                                                                                                                                                                                 | A depot needs to know who looked at a balance                                                                                                                                     |
| ASM-023 | Has a depot owner confirmed that debt arises at chốt đơn?                                        | **operational action**    | Not yet asked                                                                                                                                                                                                                                                                           | Facilitator, before the first real sale is recorded                                                                                                                               |
| ASM-024 | Does `PostSale` mean commercial agreement or physical handover?                                  | **operational action**    | Current software treats it as commercial/financial recognition, separate from Delivery; this is not field-validated                                                                                                                                                                     | Depot owner + facilitator, before the first real posted Sale                                                                                                                      |
| ASM-025 | When does supplier payable arise?                                                                | **operational action**    | Current software recognizes it at `ConfirmPurchase`, not Receiving; this is not field-validated                                                                                                                                                                                         | Depot owner + facilitator, before the first real confirmed Purchase                                                                                                               |
| ASM-026 | What defines the depot business-day boundary?                                                    | **decided/configurable**  | Workspace profile selects a Vietnam-local start minute; default 00:00 (ADR-0024)                                                                                                                                                                                                        | Owner selects it during onboarding and changes it only with an audited reason                                                                                                     |
| ASM-027 | Does negative inventory block dispatch?                                                          | **deferred with trigger** | **No block**; preserve the attributable movement and surface the negative projection                                                                                                                                                                                                    | First dispatch that would cross below zero, or an owner requests a hard stock gate                                                                                                |
| ASM-028 | How are stocktakes, losses, damage, gifts, and weighing errors recorded?                         | **deferred with trigger** | Explicit `AdjustInventory` with direction, reason code and mandatory explanation; no silent correction                                                                                                                                                                                  | First stocktake discrepancy or incident that the current reason set cannot represent unambiguously                                                                                |
| ASM-029 | How is cash collected during delivery recorded and handed over?                                  | **deferred with trigger** | Cashbook supports an employee-held CashAccount, a separate Customer Payment and CashTransfer to drawer/bank; collection authority, approval and handover UX remain unvalidated                                                                                                          | Before the first delivery on which the driver collects cash                                                                                                                       |
| ASM-030 | What are document-sharing, customer-data retention, and public-read policies?                    | **operational action**    | No real customer data is publicly shared until a written policy is approved                                                                                                                                                                                                             | Depot owner/data controller + deployment operator, before real-data sharing or production retention                                                                               |
| ASM-031 | What are production RPO, RTO, backup retention, encryption, and restore-drill requirements?      | **decided**               | RPO ≤15 min, RTO ≤60 min, PITR ≤15 min, encrypted daily backup retained 35 days, quarterly/high-risk-migration drill ([recovery rehearsal](../11-operations/recovery-rehearsal.md))                                                                                                     | Deployment operator records provider evidence; depot owner accepts before production                                                                                              |
| ASM-032 | Is commercial grade required for every new Sale/Receipt quantity?                                | **decided/configurable**  | Workspace profile selects `required` or `disabled`; disabled uses an explicit null grade bucket and never a fake default (ADR-0024)                                                                                                                                                     | Depot owner + receiving/sales workers, before the first real Sale or Receipt ([worksheet](quality-policy-worksheet.md))                                                           |
| ASM-033 | Does Receipt mean accepted inventory, and how are damaged/rejected arrivals represented?         | **operational action**    | ADR-0026 implements Arrival → Inspection → Disposition; only accepted allocations create inventory. Supplier claims, credits and billable-quantity settlement remain unmodelled                                                                                                         | Depot owner + receiver, before the first real Receiving session ([worksheet](quality-policy-worksheet.md))                                                                        |
| ASM-034 | Who may manage/reclassify grade, and is approval required?                                       | **operational action**    | Current defaults allow owner/warehouse to manage grades and reclassify with a reason and no second approval; this is not field-validated                                                                                                                                                | Depot owner + warehouse lead, before pilot goods operations ([worksheet](quality-policy-worksheet.md))                                                                            |
| ASM-035 | How is Sale fulfilment represented when a posted Sale is corrected after Dispatch/Delivery?      | **operational action**    | Current software keeps Delivery on the original Sale and gives a replacement Sale fresh fulfilment; no physical movement may be fabricated to make the replacement look fulfilled                                                                                                       | Depot owner + sales + warehouse, before shadow pilot permits correction of a physically fulfilled Sale ([worksheet](cross-dimension-correction-worksheet.md))                     |
| ASM-036 | How is accepted Receiving represented when a confirmed Purchase is corrected/replaced afterward? | **operational action**    | Core strategy is `commercial_replacement_only`: an approved effective workspace policy records policy lineage, keeps Receipts/inventory on the original Purchase, and gives the replacement fresh receiving progress; no reverse/re-receive may be fabricated without physical movement | Depot owner + accountant + receiver validate the operating contract before shadow pilot permits correction after Receiving ([worksheet](cross-dimension-correction-worksheet.md)) |
| ASM-037 | What commercial/financial consequence follows a partial customer goods return?                   | **operational action**    | `RecordDeliveryReturn` changes inventory only. It does not infer debt reduction, refund, exchange value or credit from quantity because those policies are not field-validated                                                                                                          | Depot owner + sales/accountant + delivery/warehouse, before the first real partial return ([worksheet](cross-dimension-correction-worksheet.md))                                  |
| ASM-038 | How are previously accepted goods returned to a Supplier, and what happens to supplier payable?  | **operational action**    | No Supplier-return fact exists. A generic negative inventory adjustment must not masquerade as a Supplier return when source/payable consequences matter                                                                                                                                | Depot owner + accountant + receiver, before the first real return of accepted stock to a Supplier ([worksheet](cross-dimension-correction-worksheet.md))                          |
| ASM-039 | Which inventory valuation basis and cost timing define reproducible COGS?                        | **policy-blocked**        | A typed, approved workspace valuation policy can now produce a source-backed inventory-value read; reproducible COGS, cost timing and profit remain unavailable until field policy closes the broader question                                                                          | Owner + accountant, before COGS or margin reporting ([worksheet](policy-closure-worksheet.md))                                                                                    |
| ASM-040 | How do waste, returns, claims, credits and corrections affect cost and profit?                   | **policy-blocked**        | Raw observations are available without effect; no cross-dimension cost policy exists, so do not infer COGS, margin or payable effects                                                                                                                                                   | Owner + accountant + warehouse, before cost effects are reported ([worksheet](policy-closure-worksheet.md))                                                                       |
| ASM-041 | What terms, allocation and collection priority define customer debt reporting?                   | **policy-blocked**        | Terms and allocation are implemented through approved versioned policies; collection action history and collection-priority recommendations remain unavailable                                                                                                                          | Owner + accountant, before collection actions ([worksheet](policy-closure-worksheet.md))                                                                                          |
| ASM-042 | Which minimum, target, lead-time and reorder values define inventory risk?                       | **policy-blocked**        | A fixed-threshold `stock_planning_reorder` adapter is implemented for explicit Product/grade/unit rules; lead-time, velocity, forecast and broader stock-risk actions remain unavailable                                                                                                | Owner + warehouse + purchaser, before reorder or stock-risk actions ([worksheet](policy-closure-worksheet.md))                                                                    |
| ASM-043 | Does a stocktake need a session, variance approval and reopen path?                              | **policy-blocked**        | A policy-backed session/count/approve/reopen workflow is implemented with exact movement compensation; owner approval of the broader field operating contract remains outstanding                                                                                                       | Owner + warehouse, before field rollout of session/variance operations ([worksheet](policy-closure-worksheet.md))                                                                 |
| ASM-044 | How should anonymous or walk-in cash sales represent identity, payment and returns?              | **policy-blocked**        | Current Sale requires a real Customer; no fake customer or inferred debt path is allowed                                                                                                                                                                                                | Owner + sales + accountant, before anonymous-sale implementation ([worksheet](policy-closure-worksheet.md))                                                                       |
| ASM-045 | What must be counted, signed off and corrected at shift or business-day close?                   | **policy-blocked**        | `ReconciliationObservation` can preserve raw close evidence, but reports and integrity reads are not a close event; no close state is exposed                                                                                                                                           | Owner + accountant + workers, before close workflow implementation ([worksheet](policy-closure-worksheet.md))                                                                     |
| ASM-046 | How are bank deposits and external statements matched to Cashbook facts?                         | **policy-blocked**        | `ReconciliationObservation` can preserve raw statement facts, but no statement-matching or settlement policy exists; Cashbook source facts remain unchanged                                                                                                                             | Owner + accountant, before deposit reconciliation implementation ([worksheet](policy-closure-worksheet.md))                                                                       |
| ASM-047 | Which Supplier relationship facts and authorities must be maintained?                            | **policy-blocked**        | `SupplierObservation` now preserves source-linked role, supplier/product/grade references, source area, traceability and pickup/packing/transport responsibilities; no inferred master-data authority or role is activated                                                              | Owner + purchaser + warehouse, before Supplier catalogue expansion ([worksheet](policy-closure-worksheet.md))                                                                     |
| ASM-048 | Which Supplier delivery, quality, return and credit facts support performance decisions?         | **policy-blocked**        | `SupplierObservation` now preserves source-linked terms, promised/actual/accepted/rejected quantities and timing, observed price and claim references; no score, ranking, payable or recommendation is derived                                                                          | Owner + purchaser + receiver, before performance or recommendation surfaces ([worksheet](policy-closure-worksheet.md))                                                            |

Forty-eight entries remain in the register. Status counts are intentionally not hard-coded here; the table is authoritative as configurable decisions and implementation close prior assumptions. ASM-024 and ASM-025 have owner-validation worksheets because
a contrary answer can invalidate the transaction time at which current money
effects are recognized. ASM-030 remains a deployment action. ASM-031 now has
minimum requirements, while provider evidence and owner acceptance remain a
production gate rather than repository evidence.

### How ASM-039–ASM-048 interact with raw evidence

The **policy-blocked** classification applies to the remaining derived outcome
in the question: reproducible COGS/profit, cost effects, aging/allocation, reorder risk, stocktake
approval semantics, walk-in commercial semantics, operational close, settlement
matching, Supplier relationship policy and Supplier performance decisions. It does
not forbid the separately scoped, source-backed inventory-value read or a raw
observation when that result has no unapproved money, goods or management effect.

The next technical slice may therefore capture source-backed observations such as
purchase/handling/transport/loss amounts, agreed due-date evidence, promised and
accepted quantities, count evidence, reconciliation notes, bank statement lines,
Supplier roles, delivery/quality observations and customer demand/order requests. Such evidence is not a COGS
calculation, overdue label, reorder recommendation or Supplier score. The
[configurable operating model](../01-domain/operating-model.md) defines the
boundary; each observation still needs its own contract, authorization,
append-only correction path, persistence parity and restore evidence before it is
called implemented.

---

## What closed this round, and why it matters

### ASM-001 / ASM-003 — negative balances · **decided: yes**

A payment larger than the receivable is accepted and the balance goes negative,
meaning the depot owes the customer credit. That is now a named classification
(`customer_credit`) rather than an unlabelled minus sign, so a client cannot
render it as a debt by accident (BR-ACCOUNT-009).

Refusing overpayment would reject a genuine business event — a customer paying
ahead for tomorrow's load — and the rejection would be _invisible_ in the data,
since no record of the attempt would exist.

### ASM-005 — cancelling a posted sale · **decided: it is voided**

`cancelled` was one word doing two jobs: throwing away a half-typed draft, and
undoing a completed sale. They differ in the only way that matters — the first
moves no money and the second moves all of it.

They are now two operations. `DiscardSaleDraft` for the first;
`VoidSale` for the second, with a full compensating entry, a mandatory reason
code, and a different permission.

### ASM-010 — correcting a posted sale · **decided: void plus replacement**

Was: a compensating `AdjustCustomerDebt`. The balance came out right, but the sale
document still showed the wrong total, and only the ledger explained the difference
— in free text.

Now: `VoidSale` compensates the whole posting, and an optional replacement sale
carries `replacesSaleId`. The document and the balance agree, the correction names
which sale was wrong and why, and `AdjustCustomerDebt` is explicitly no longer the
path (BR-ACCOUNT-010).

### ASM-008 — price changes · **decided: snapshots, re-affirmed at posting**

Lines snapshot product name, quantity, unit and unit price. Posting re-affirms the
snapshot, because a draft may have sat overnight and the numbers finally agreed are
the ones in the row at the moment of posting (BR-SALE-011).

### ASM-002 — when the receivable arises · **decided: at posting**

The trigger was "before the first depot records real sales", and the pilot is that.
A deferred entry sitting at its own trigger is not a deferral any more; it is a
guess with a calendar.

**Decided:** the receivable arises when a sale is posted, and at no other event.
Argued in [ADR-0014](ADR-0014-debt-recognition-at-posting.md), stated as
BR-SALE-020 (P0), illustrated by CASE-SALE-013, held by TC-SALE-028.

**Nothing about the software changed**, which is the point worth being clear about:
the decision ratifies what was already happening. What changed is that it is now a
claim somebody can be wrong about, rather than a default nobody had revisited.

**What it still owes — ASM-023.** No depot owner has said it is right. That is an
operational action, not an open design question, and it has an instrument: the four
questions in
[ASM-002-debt-recognition-worksheet.md](ASM-002-debt-recognition-worksheet.md).
Ask them before the first real sale, because this remains the least reversible
entry in the register — the ledger is append-only, so a contrary answer leaves
every `sale_posting` entry carrying a `transactionTime` that is too early, and no
repair is available that the design permits.

---

## The ones that will still hurt if left

### ASM-024 / ASM-025 — recognition semantics · **operational**

The implementation currently keeps physical movement separate from financial
recognition: `PostSale` creates the customer receivable while Delivery records
dispatch and return; `ConfirmPurchase` creates the supplier payable while
Receiving records stock arrival. That is technically coherent, but it is not
evidence that a depot uses those commercial moments.

The owner must validate both before real transactions are entered. Use
[ASM-024-post-sale-meaning-worksheet.md](ASM-024-post-sale-meaning-worksheet.md)
and
[ASM-025-supplier-payable-recognition-worksheet.md](ASM-025-supplier-payable-recognition-worksheet.md).
Until signed, describe the behavior as **technically proven and field-unvalidated**,
not as settled depot policy.

### ASM-015 / ASM-016 — credit limits and overdue balances · **partially closed**

`design.md` describes an `over_credit_limit` state and customer risk surfaces.
Credit control is now an explicit policy-backed Sale-posting capability:
`information_only` and same-currency `hard_block` are deterministic and tested;
`warning` and `approval_required` remain unavailable because their workflows do
not exist. Payment terms and aging are implemented as a separate explicit
policy-backed capability: posting snapshots the effective terms, and aging
returns unavailable without effective terms and allocation policies.

**Do not invent credit limits or collection recommendations.** A credit limit at
the wrong threshold refuses real sales; a collection rule with the wrong terms puts
customers on a chase list who are not late. Historical due dates are now preserved
by the Sale's policy snapshot, so a later policy version cannot rewrite the past.

### ASM-017 / ASM-018 — the role table is a guess, and everyone is an owner · **operational**

**ASM-017.** Only `debt.adjust` was specified. Every other role→permission pairing
is a least-privilege default a developer chose. The three that most need a depot
owner's answer:

- may a **delivery driver record the cash they collect**? Defaulted to _no_, which
  is safe and quite possibly wrong for how these depots actually work;
- may **sales post sales**? Defaulted to _yes_, because that is the job — but
  posting is the moment the receivable is created, so it deserves a decision;
- may **sales void sales**? Defaulted to _no_. Somebody who can both create and
  erase a sale can make a load disappear with nothing missing from the balance.

**ASM-018.** Migration `0002` backfilled `workspace_memberships.role` as `owner` —
the only choice that could not lock an existing depot out of its own data. It means
that immediately after migrating, **every existing member holds `debt.adjust` and
`sale.void`**.

Closing ASM-018 is not a code change: assign real roles, then verify no unintended
owners remain.

---

## Quality-policy gates — ASM-032 / ASM-033 / ASM-034

The grade-aware implementation proves that the software can preserve an exact
commercial grade through Receiving, inventory, Sale fulfilment, Delivery, Return
and reclassification. It does **not** prove that every depot quantity should be
forced through a grade, that Receipt is the right representation for damaged
arrivals, or that the default quality permissions match real work.

ADR-0024 closes the universal-grade software assumption: the owner selects required grading or explicit ungraded quantity in the workspace profile. The worksheet still determines the correct selection and who may manage/reclassify grades. A rejected answer must not be converted into a passing grade by seeding `Loại 1`, `Mặc định` or `Không phân hạng` unless the depot actually uses that category.

ADR-0026 implements Condition/Defect evidence, photos, quarantine and disposition
for the physical intake workflow. Supplier-quality claims, credits and billable
quantity remain outside that workflow until ASM-033 defines their money and
settlement consequences. ASM-034 supplements, rather than replaces, the wider
ASM-017 role-permission review.

---

## Cross-dimension correction gates — ASM-035 / ASM-036 / ASM-037 / ASM-038

The use-case completeness audit found four events where current commercial/money
truth can be repaired while physical truth remains attached to the original
source, or vice versa. That is not automatically a bug: immutable source facts
should remain where they happened. The gap is that the **replacement or return
workflow has no agreed representation of the relationship across dimensions**.

Do not repair these cases by inventing physical events. A price correction after
Delivery must not create a fake Return + Dispatch; a Purchase price correction
after Receiving must not reverse and re-receive stock that never moved. Likewise,
a physical customer return does not imply a particular refund/debt policy, and a
generic inventory decrease is not automatically a Supplier return.

Use the [cross-dimension correction worksheet](cross-dimension-correction-worksheet.md).
Until the relevant answer is recorded, the shadow pilot either excludes the event
or stops and records it as a product gap. A guessed default is not readiness.

---

## New design boundaries — multi-role, quality management and “bông hàng”

A worker doing several jobs now has one active membership with a normalized role set and deterministic permission union under [ADR-0021](ADR-0021-multi-role-workspace-membership.md). Owner remains exclusive; role-policy validation under ASM-017 is still required, but the runtime/migration/backup model is implemented.

Commercial `QualityGrade` remains distinct from condition and defect evidence.
[ADR-0022](ADR-0022-quality-inspection-and-lot-boundary.md) set the boundary and
[ADR-0026](ADR-0026-inspected-intake-and-quality-disposition.md) now implements
GoodsArrival, issue-code inspection, quarantine and authorized disposition. Only
accepted quantity becomes inventory. Supplier claim/credit and canonical lot/expiry
semantics remain unresolved and are not silently added to Grade, Receipt or payable.

[ADR-0024](ADR-0024-workspace-operational-profile.md) adds one versioned, audited workspace operational profile so depots can select only stable workflows they actually use, including direct versus inspected intake and weighing mode. It is not a generic feature-flag or rule-builder system.

[ADR-0025](ADR-0025-cashbook-separate-from-debt.md) implements CashAccount and append-only cash movements without collapsing physical cash into customer debt or supplier payable.

A bill covering several days is now decided as a source-backed customer statement,
not a Sale spanning several days. [ADR-0023](ADR-0023-multi-day-statement-not-multi-day-sale.md)
freezes opening/change/closing balances and source entries in an immutable printable
snapshot. “Bông hàng” itself remains a field-discovery term until its lifecycle and
settlement meaning are observed.

---

## How to close an item

1. Get the answer from the depot owner.
2. Write an ADR if the decision has architectural consequences.
3. Update the rule, the case, and the test.
4. Change the row above to **decided**, linking the ADR. Do not delete the row —
   the history of what was once uncertain is useful, and the next person will
   otherwise assume it was never in question.

## Related

- [ADR-0014-debt-recognition-at-posting.md](ADR-0014-debt-recognition-at-posting.md)
- [ASM-002-debt-recognition-worksheet.md](ASM-002-debt-recognition-worksheet.md)
- [ASM-024-post-sale-meaning-worksheet.md](ASM-024-post-sale-meaning-worksheet.md)
- [ASM-025-supplier-payable-recognition-worksheet.md](ASM-025-supplier-payable-recognition-worksheet.md)
- [cross-dimension-correction-worksheet.md](cross-dimension-correction-worksheet.md)
- [ADR-0012-sale-void-and-replacement.md](ADR-0012-sale-void-and-replacement.md)
- [ADR-0020-application-workspace-isolation.md](ADR-0020-application-workspace-isolation.md)
- [../04-business-rules/sale-rules.md](../04-business-rules/sale-rules.md)
- [../04-business-rules/customer-account-rules.md](../04-business-rules/customer-account-rules.md)
- [../02-use-cases/use-case-catalog.md](../02-use-cases/use-case-catalog.md)
