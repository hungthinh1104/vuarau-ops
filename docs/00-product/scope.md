# Current scope — depot transaction operating system

This is the delivered technical boundary of the current M25 technical candidate.
Core workflows through inspected intake, quality disposition, cashbook and workspace
operational profiles have automated implementation evidence. Technical completion is
still distinct from field readiness: provider PITR, owner policy acceptance, real-phone
deployment and H2–H6 observations remain external pilot gates.

Technical completion is not field validation. The distinction is defined in the
[product invariants](product-invariants.md) and measured by the
[validation plan](validation-plan.md).

## Delivered workflow surface

| Dimension           | Delivered boundary                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money Truth         | Customer lifecycle; Quick Sale; cash accounts, expenses, transfers and cash reconciliation; Sale correction; customer Payment/reversal/adjustment; account timeline, reconciliation and rebuild; supplier payable, Payment/reversal/adjustment and Purchase correction                                                                                                             |
| Goods Flow          | Product, Supplier and commercial QualityGrade lifecycle; direct Receiving or inspected GoodsArrival; quantity-only or gross/tare/net weighing; issue-code inspection evidence; accepted/quarantined/rejected/disposed disposition and reversal; per-Product/grade/unit inventory; adjustment, reclassification and reconciliation; exact-grade Delivery dispatch/completion/return |
| Operational Control | Supabase identity; workspace roles and capabilities; versioned operational profile; audit; immutable digest-verified documents; revocable sharing; customer-account activity and source-backed reports; logical export/restore and integrity checks                                                                                                                                |
| Reliability         | Client command identity, idempotent receipts, optimistic concurrency, transactional writes, append-only money/goods facts, offline Quick Sale queue and retry recovery                                                                                                                                                                                                             |
| Engineering         | Strict TypeScript, architecture boundaries, source-size/composition gates, docs and trace checks, Vitest projects, PostgreSQL integration, Next/Storybook builds and real-stack Playwright                                                                                                                                                                                         |

The runtime exposes **49 authenticated command procedures** and **48 authenticated
query procedures** across 16 bounded-context router namespaces. These counts
describe the current router modules; the authoritative contracts remain
[command-contracts.md](../06-api-contracts/command-contracts.md) and
[read-models.md](../06-api-contracts/read-models.md).

## End-to-end depot workflow

```text
Identity and workspace
  → Customer → Sale → customer account → Payment/correction
  → Supplier → Purchase → supplier account
    → direct Receiving → Inventory
    or GoodsArrival → weighing → Inspection → Disposition → accepted Inventory
  → Sale → Delivery → Return
  → Source documents → sharing/reports → reconciliation/export/restore
```

Commercial truth, financial truth and physical truth remain separate. A named
command may create a cross-dimension effect only where a business rule says so;
no UI or report supplies a second implementation of that policy.

## Deliberately out of scope

| Excluded                                                          | Boundary                                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| AI/LLM transaction entry                                          | AI may propose in a future milestone but may never bypass deterministic commands                                          |
| Pricing intelligence and automatic recommendations                | The explicit price-rule catalogue is in scope; intelligence, forecasting and automatic application remain out of scope    |
| Demand forecasting, supplier scoring and customer health scoring  | Require field evidence and enough history to justify a model                                                              |
| Tax invoicing, allocation and inventory valuation                 | Current documents make no tax claim; Payments are not allocated to Sales                                                  |
| Supplier quality claims, credits and billable-quantity settlement | Rejected/quarantined intake does not silently rewrite Purchase payable                                                    |
| General lot/expiry traceability and “bông hàng”                   | Supplier lot text is evidence only; canonical lot/expiry and “bông hàng” require separate definitions                     |
| Delivery route optimization                                       | Delivery truth exists; routing is a separate product problem                                                              |
| Offline mutation beyond Quick Sale                                | Payment, correction, catalog, goods and control commands remain online-only                                               |
| General rule builders, microservices, Kafka and Kubernetes        | The modular monolith and explicit rules remain sufficient                                                                 |
| Full event sourcing or double-entry accounting                    | Append-only account ledgers and inventory movements are canonical for their bounded purposes, not a general ledger        |
| Production policy invented by software                            | M22 defines minimum recovery targets; provider evidence/acceptance and public-read/retention policy remain explicit gates |

## Open policy boundary

Every known policy question is classified in the
[decision backlog](../09-decisions/decision-backlog.md). In particular:

- ASM-024 and ASM-025 require depot-owner validation before real Sale or Purchase
  recognition;
- ASM-026–029 have explicit temporary defaults and triggers;
- ASM-030 blocks real-data sharing until the named owners record policy;
- ASM-031 defines minimum recovery requirements, while provider drill evidence and
  owner acceptance still block production readiness;
- ASM-032–034 gate grade-management/reclassification authority and depot acceptance
  of direct versus inspected intake. `QualityGrade`, issue-code inspection and disposition
  are technically implemented but remain field-policy decisions;
- ASM-035–038 gate cross-dimension corrections after physical fulfilment/Receiving,
  partial customer-return money semantics and Supplier returns of accepted stock.
  These gaps must not be hidden with invented Return/Dispatch/Receipt/adjustment
  facts.
- ASM-039–048 keep valuation/COGS, cost effects, debt aging/allocation, inventory
  planning, stocktake, walk-in sales, shift close, bank reconciliation and Supplier
  performance unavailable until the field questions in the
  [next-phase policy worksheet](../09-decisions/policy-closure-worksheet.md)
  are answered. No dashboard, recommendation or AI surface may turn these gaps
  into zeros or inferred policy.

## Related

- [product-brief.md](product-brief.md)
- [product-invariants.md](product-invariants.md)
- [roadmap.md](roadmap.md)
- [../02-use-cases/use-case-catalog.md](../02-use-cases/use-case-catalog.md)
