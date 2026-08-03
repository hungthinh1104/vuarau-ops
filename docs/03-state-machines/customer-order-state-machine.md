# Customer Order state machine

```text
CreateCustomerOrderDraft
          │
          ▼
      ┌────────┐  UpdateCustomerOrderDraft
      │ draft  │◀────────────────────────┐
      └───┬────┘                         │
          │ ConfirmCustomerOrder         │
          │ CancelCustomerOrder          │
          ▼                              │
   ┌─────────────┐                 ┌─────┴─────┐
   │ confirmed   │                 │   draft   │
   └──────┬──────┘                 └───────────┘
          │ CancelCustomerOrder
          ▼
   ┌─────────────┐
   │  cancelled  │
   └─────────────┘
```

`confirmed` and `cancelled` are terminal lifecycle states. Confirmation and
cancellation increment the version; editing a confirmed order is refused. A
replacement is a new draft with `replacesCustomerOrderId`, never an update to
the historical order.

The order lifecycle is commercial only. Sale posting owns receivable recognition;
Delivery owns handover; inventory commands own goods movements. No order
transition writes any of those facts.

## Related

- [state catalog](state-catalog.md)
- [Customer Order rules](../04-business-rules/customer-order-rules.md)
