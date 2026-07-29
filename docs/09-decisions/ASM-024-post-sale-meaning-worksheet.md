# ASM-024 owner worksheet — what does `PostSale` mean?

## Why this needs the owner

The software currently treats `PostSale` as the commercial agreement: it freezes
the Sale and creates the customer receivable. Physical handover is recorded later
and independently by Delivery. Automated tests prove that implementation; they do
not prove that the recognition moment matches depot practice.

## Walk through these real cases

Use one recent transaction for each case that occurs:

1. The price and quantities are agreed before goods leave the depot.
2. Quantities change while loading or at the customer.
3. Goods are dispatched today but accepted tomorrow.
4. The customer rejects or returns part of the load.

For each case, ask:

- At what exact event does the depot say “the customer now owes this amount”?
- What paper, message, spoken confirmation, or action proves that event?
- Can goods leave before that agreement? Can agreement happen before goods leave?
- If the current `PostSale` moment is wrong, which existing Sale or Delivery fact
  contains the correct business time?

## Owner decision

```text
Recognition event:
Evidence used by the depot:
Exceptions:
Current PostSale behavior accepted? yes / no
Owner:
Facilitator:
Date:
```

If the answer is **no**, stop real posting and open an ADR plus rule/case/test
change. Do not reinterpret existing ledger entries silently.
