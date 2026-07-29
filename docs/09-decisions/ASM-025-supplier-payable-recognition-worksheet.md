# ASM-025 owner worksheet — when does supplier payable arise?

## Why this needs the owner

The software currently creates supplier payable when a Purchase is confirmed.
Receiving records physical arrival separately and does not create or change the
payable. Automated tests prove that separation; they do not prove that confirmation
is the depot's commercial recognition event.

## Walk through these real cases

Use one recent supplier transaction for each case that occurs:

1. Price and quantity are agreed before the truck arrives.
2. Received weight differs from the agreed Purchase.
3. Goods arrive in several receipts.
4. Goods are damaged, rejected, or returned after arrival.

For each case, ask:

- At what exact event does the depot say “we now owe the supplier this amount”?
- Is the amount based on the agreement, received quantity, accepted quantity, or
  a later supplier statement?
- What evidence establishes the transaction time?
- If the current `ConfirmPurchase` moment is wrong, what canonical fact should
  create the payable instead?

## Owner decision

```text
Recognition event:
Amount basis:
Evidence used by the depot:
Exceptions:
Current ConfirmPurchase behavior accepted? yes / no
Owner:
Facilitator:
Date:
```

If the answer is **no**, stop real Purchase confirmation and open an ADR plus
rule/case/test change. Do not make Receiving silently move supplier money.
