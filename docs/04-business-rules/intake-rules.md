# Inspected intake and quality rules

- **BR-INTAKE-001** — GoodsArrival is an append-only physical observation. It may link a confirmed Purchase, but recording arrival alone does not create sellable inventory or change supplier payable.
- **BR-INTAKE-002** — A Purchase-linked arrival must use the same supplier and every line must match one Purchase line by product, unit and immutable snapshot identity.
- **BR-INTAKE-003** — In `quantity_only` mode weighing is forbidden. In `gross_tare_net` mode every line requires one mass unit and must satisfy `gross = tare + net`; arrived quantity equals net weight.
- **BR-INTAKE-004** — Active cumulative inspection quantity cannot exceed the active arrival-line quantity. Issue-code id, code and name are captured as evidence snapshots.
- **BR-INTAKE-005** — QualityInspection is an append-only observation. It creates no inventory and may be reversed only after all active downstream dispositions are reversed.
- **BR-INTAKE-006** — QualityDisposition allocates only currently eligible inspected quantity. Allocation totals cannot exceed the source remainder and all quantities use the source unit.
- **BR-INTAKE-007** — Only `accepted` allocations create positive sellable InventoryMovement. `quarantined`, `rejected` and `disposed` remain physical/responsibility outcomes and do not increase inventory.
- **BR-INTAKE-008** — Accepted quantity may carry a commercial grade. Non-accepted outcomes must not carry a grade. A quarantined allocation may be resolved once through a later disposition and cannot be quarantined again.
- **BR-INTAKE-009** — Reversing an accepted disposition appends an exact inverse InventoryMovement. Correction order is downstream first: child disposition, parent disposition, inspection, then arrival.
- **BR-INTAKE-010** — An active GoodsArrival blocks Purchase void even before any quantity is accepted. Direct receipt and inspected intake are mutually exclusive for new facts.
- **BR-INTAKE-011** — Changing the operational profile affects new commands only. Historical reads and supported reversals remain available so evidence never becomes unreachable.
- **BR-INTAKE-012** — `transactionTime` records when the physical event occurred; `recordedAt` records when the system persisted it. Reports and audit retain both.
- **BR-INTAKE-013** — Backup V7 includes issue masters and every arrival, inspection, disposition, allocation, reversal and resulting inventory movement. Restore validates references and reconciles inventory before success.
- **BR-INTAKE-014** — Rejected or quarantined quantity does not automatically reduce Purchase payable. Supplier claim, credit and settlement are a separate future bounded context.
