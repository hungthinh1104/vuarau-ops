# Purchase state machine

```text
CreatePurchaseDraft
        |
        v
      draft --DiscardPurchaseDraft--> discarded
        |
        +----ConfirmPurchase---------> confirmed
```

`confirmed` and `discarded` are terminal stored states. A confirmed Purchase is
never edited. `VoidPurchase` appends a separate `purchase_voids` record and one
supplier-ledger compensation; it does not mutate the Purchase status.

Receiving is a separate aggregate and read dimension. `unreceived`,
`partially_received` and `fully_received` are derived from immutable Receipt and
reversal rows and are not Purchase status values.

The valid correction sequence is:

```text
reverse active Receipts
→ void confirmed Purchase
→ optional new Purchase linked by replacesPurchaseId
→ optional new Receipts
```
