# Depot-day casebook — end-to-end transaction truth rehearsal

This casebook is the synthetic operating day used to test **product completeness**,
not just handler coverage. It deliberately crosses Money Truth, Goods Flow and
Operational Control and includes mistakes, partial work and unknown outcomes.

A step marked **STOP** is not permission to invent a workaround. It names a policy
or model gap that must be resolved before M23.17 can execute the whole day.

## Participants

- **Owner:** policy, roles, exceptional corrections, integrity/recovery.
- **Accountant:** supplier/customer money and corrections.
- **Sales:** customer/Sale capture and ordinary posting under the accepted role policy.
- **Warehouse/receiver:** Receiving, grade, inventory and dispatch.
- **Delivery worker:** physical handover/return; no implicit money authority.

## Opening state

One isolated workspace contains real-like but synthetic master data:

- Supplier `Nông trại A`;
- Products `Cà chua` and `Rau muống`;
- commercial grades `Loại 1`, `Loại 2` only if ASM-032 has accepted that taxonomy;
- existing Customer `Chị Lan` with an explainable opening balance;
- no demo transactions, no hidden seed balance, integrity `healthy`.

Every command uses a client identity, business time and actor/workspace authority.

## D1 — Purchase and accepted Receiving

1. Accountant creates Purchase P1: 100 kg Cà chua at the agreed unit price.
2. Accountant confirms P1. Under current policy this creates one supplier payable
   and **no inventory movement**.
3. Receiver accepts 70 kg as Loại 1 and 20 kg as Loại 2 in Receipt R1.
4. Inventory now contains two separate Product/grade/unit balances. Supplier
   payable is unchanged by Receiving.
5. Receiving progress says 90 kg accepted, 10 kg remaining.

Checks: partial quantity, exact grade identity, source links, no payable duplication,
Receipt retry returns the original result.

### D1-X — damaged/rejected arrival

Supplier also presents quantity the receiver does not accept.

**STOP if ASM-033 is unresolved.** Do not record rejected goods as accepted Receipt
then immediately spoil/adjust them merely to make totals add up. The event requires
a validated rejected-arrival meaning before it becomes canonical data.

## D2 — Quick Sale and partial fulfilment

1. Sales selects Chị Lan and records Sale S1 for 30 kg Cà chua Loại 1.
2. Historical price may be recalled only by explicit worker action; Product identity
   remains the exact canonical Product id, never inferred from display text.
3. Posting S1 creates customer receivable and no inventory movement.
4. Warehouse creates Delivery D1 for 20 kg and dispatches it. Inventory decreases
   by 20 kg; customer debt does not move.
5. Fulfilment reads 30 ordered, 20 dispatched, 10 remaining.
6. A second Delivery D2 dispatches the remaining 10 kg using a fresh Delivery
   identity. Fulfilment becomes complete.

Checks: repeat legitimate action, partial fulfilment, exact Product/grade/unit,
negative inventory remains attributable if current ASM-027 policy permits it.

## D3 — unknown network outcome

During one command submission the client loses the response after sending.

1. UI enters `unknown_network_outcome` and locks creation of a new intent.
2. Worker retries **the identical command identity and payload**.
3. Server either completes it or returns the stored original result.
4. No duplicate Sale/Payment/Receipt/Delivery or audit effect is created.

A UI that tells the worker to “try again” with a fresh identity fails this case.

## D4 — customer payment

1. Accountant/sales role with `payment.record` records 300,000 VND received.
2. Customer account gets exactly one negative entry.
3. If the payment is later found partly wrong, a partial reversal appends the
   compensating amount; the original payment remains visible.
4. Customer detail and report source links explain the resulting balance.

## D5 — Sale correction after Delivery

After D1/D2 already moved goods, the depot discovers S1 has the wrong commercial
price or customer document.

The existing void/replacement flow can correct Money Truth, but physical Delivery
facts remain on S1 while replacement S2 starts with fresh fulfilment.

**STOP until ASM-035 is decided.** Never generate fake Delivery Return + Dispatch
facts when goods did not physically move. M23.15 must define how the correction
chain presents or references prior fulfilment while preserving immutable sources.

## D6 — partial customer goods return

Customer physically returns 5 kg from a delivered line.

1. `RecordDeliveryReturn` can truthfully append +5 kg inventory if the depot accepts
   the physical return.
2. It deliberately changes no customer money.

**STOP before applying any financial/commercial consequence while ASM-037 is
unresolved.** Do not infer refund/debt reduction from quantity. Record the physical
fact only if that is itself operationally correct, then stop the synthetic day at
the unresolved business decision.

## D7 — Purchase correction after Receiving

**Case ID:** CASE-PURCHASE-CORRECTION-001

After R1 already accepted stock, accountant discovers P1 has the wrong price,
Supplier or commercial document.

The current void/replacement path can correct supplier payable; existing Receipts
remain sourced to P1 and replacement P2 begins with fresh receiving progress.

If an approved, effective workspace `purchase_correction` policy authorizes the
supported `commercial_replacement_only` strategy, append a commercial void for
P1 and record the policy version. Keep R1 attached to P1, keep its inventory
movement unchanged, and let replacement P2 begin at zero received quantity.
Compensate supplier payable exactly once. If the policy is absent, expired,
unsupported or not yet field-authorized, stop; never reverse and re-receive 90 kg
unless the goods actually cross the accepted-stock boundary again.

## D8 — return accepted stock to Supplier

The next day, part of previously accepted stock is discovered unsuitable and the
depot sends it back to Supplier.

**STOP until ASM-038 is decided.** A generic negative inventory adjustment records
quantity leaving but cannot truthfully explain a Supplier return or any payable
credit if those are business facts the depot expects to see.

## D9 — internal inventory quality operations

For already accepted stock:

1. Warehouse reclassifies 10 kg Loại 2 → Loại 1 using one conserving movement pair.
2. Warehouse records 4 kg spoilage as an explicit negative adjustment with reason.
3. Neither action changes customer or supplier money.
4. Inventory report retains Product + grade + unit identity and source links.

Checks: reclassification conservation, repeated adjustment uses a fresh business
identity, unknown outcome locks mutation, legacy unclassified history stays
visible rather than being assigned an arbitrary grade.

## D10 — end-of-shift explanation

Owner/accountant must be able to answer without SQL or developer intervention:

1. What did customers buy and what do they owe now?
2. What did the depot buy and what does it owe Suppliers now?
3. What stock exists per Product/grade/unit and why?
4. What deliveries remain outstanding or have returns?
5. Are customer, supplier and inventory projections consistent with canonical
   ledgers/movements?
6. Can every report row navigate to its source or explicitly state why it has no
   source document?
7. Are any offline commands blocked/unknown rather than silently replaced?

A failed integrity read is **not healthy**. Projection drift may be rebuilt only
when canonical sources are healthy; source corruption stops recovery.

## M23.17 exit condition

The complete day may be marked technically rehearsed only when:

- no step uses a fake money or goods movement to satisfy another screen;
- all P0/P1 event paths have correction, partial/repeat, unknown-outcome and
  reconciliation behavior where applicable;
- ASM-033 and ASM-035–038 are either decided with traced implementation or the
  selected real shadow-pilot scope explicitly proves those events cannot occur;
- final Money Truth and Goods Truth reconcile independently from canonical facts;
- the exact release SHA and test evidence are recorded.
