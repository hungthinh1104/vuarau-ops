# M23 cross-dimension correction worksheet — ASM-035 to ASM-038

Use this worksheet with the depot owner plus the worker who actually performs the
relevant flow. Record concrete recent examples, not preferred software behavior.

## ASM-035 — Sale correction after physical fulfilment

Ask about a Sale whose price/customer/quantity document is discovered wrong **after**
goods already left the depot.

1. Does this happen in practice? Give the last example.
2. If only price/customer was wrong, do the goods physically move again? If not,
   what document should the corrected Sale show as already fulfilled?
3. Must the original Delivery remain attached to the original Sale for audit?
4. What should a worker see when opening the replacement Sale: inherited fulfilment,
   a link to predecessor fulfilment, or something else?

**Stop condition:** never manufacture Return + Dispatch movements when no goods
physically moved merely to make the replacement appear fulfilled.

## ASM-036 — Purchase correction after Receiving

Ask about a confirmed Purchase whose price/supplier/document is found wrong after
goods were already accepted into stock.

1. Does correcting the Purchase mean the goods are received again? Usually it
   should not — confirm with the depot.
2. Should the replacement Purchase display the existing accepted quantity?
3. Must original Receipts remain attached to the original Purchase for audit?
4. What happens if only some Purchase lines had already been received?

**Stop condition:** never reverse and re-receive stock unless goods actually leave
and re-enter the accepted inventory boundary.

## ASM-037 — Partial customer goods return

Use a real example: customer returns 5 kg from a delivered 20 kg line.

1. Is the physical return always accepted? Can it be rejected?
2. Does accepted return reduce debt, create customer credit, trigger cash refund,
   exchange goods, or sometimes have no financial consequence?
3. How is the value calculated: original line price, negotiated amount, or a new
   explicit adjustment?
4. Who is allowed to approve that financial consequence?
5. Can several returns occur against one Delivery/Sale?

**Stop condition:** `RecordDeliveryReturn` currently changes inventory only. Do not
silently infer customer money from returned quantity.

## ASM-038 — Supplier return after accepted Receiving

Use a real example: accepted stock is later found damaged and sent back to the
Supplier.

1. Does the depot physically return it, discard it, or negotiate price without
   returning goods?
2. Does supplier payable reduce automatically, by negotiated amount, or not at all?
3. Is the return linked to the original Receipt/Purchase?
4. Can only part of a grade/unit quantity be returned?
5. Who records/approves it and what proof is kept?

**Stop condition:** a generic negative inventory adjustment is not a Supplier
return if the business needs to explain where the goods went and why payable moved.

## Recording the answer

For each ASM record: participant/role, date, concrete example, current paper flow,
accepted software meaning, exceptions, and whether the answer changes canonical
facts or only derived presentation. Architectural consequences require an ADR,
rule, case, test and migration/restore review before the item may become `decided`.
