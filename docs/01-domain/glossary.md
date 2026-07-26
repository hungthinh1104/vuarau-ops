# Glossary

Vietnamese depot vocabulary and the exact code identifier each maps to. When a
term appears in a use case or rule, it means what it means here.

## Business terms

| Vietnamese         | English                 | Code identifier                      | Notes                                           |
| ------------------ | ----------------------- | ------------------------------------ | ----------------------------------------------- |
| vựa                | wholesale depot         | `Workspace`                          | One depot = one workspace = one tenant boundary |
| chủ vựa            | depot owner             | `Actor` (role)                       | Roles are not modelled yet — see ASM-007        |
| khách hàng         | customer                | `Customer`                           | The party that owes money                       |
| đơn hàng           | order                   | `Order`                              | A sale to one customer                          |
| nháp               | draft                   | `OrderStatus.draft`                  | Being typed; changes nothing financially        |
| chốt đơn           | confirm the order       | `ConfirmOrder` command               | The moment debt is created                      |
| công nợ            | debt owed by a customer | debt ledger balance                  | Never a stored editable number                  |
| sổ nợ              | debt book               | `debt_ledger_entries`                | Append-only, the source of truth                |
| thanh toán         | payment                 | `Payment`                            | Money received from or for a customer           |
| trả một phần       | partial payment         | a `Payment` smaller than the balance | Not a distinct type                             |
| huỷ thanh toán     | reverse a payment       | `ReverseCustomerPayment`             | Compensates; never deletes                      |
| điều chỉnh công nợ | adjust debt manually    | `AdjustCustomerDebt`                 | Requires a stated reason                        |
| lý do              | reason                  | `reason`, `reasonCode`               | Mandatory on adjustments and reversals          |

## Units (đơn vị tính)

| Vietnamese | Code value | Meaning                                                              |
| ---------- | ---------- | -------------------------------------------------------------------- |
| kg         | `kg`       | kilogram                                                             |
| gram       | `gram`     | gram                                                                 |
| lạng       | `lang`     | 100 g by dictionary definition — **not** auto-converted, see ASM-011 |
| bó         | `bo`       | a bundle (rau muống, hành) — no fixed mass                           |
| thùng      | `thung`    | a carton/crate                                                       |
| rổ         | `ro`       | a basket                                                             |
| kiện       | `kien`     | a bale/package                                                       |
| cái        | `cai`      | a countable item                                                     |

Units are never converted into one another. A depot prices per unit as sold.

## Technical terms with domain meaning

| Term                   | Meaning here                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Command**            | A named business intent that changes state. Carries actor, workspace, idempotency key, and business occurrence time. There is no generic update. |
| **Aggregate**          | A consistency boundary loaded, decided upon, and saved as a unit: `Order`, `Payment`, `Customer`.                                                |
| **Ledger entry**       | One immutable, signed movement of customer debt. Positive increases what the customer owes.                                                      |
| **Debt summary**       | A projection equal to the sum of a customer's ledger entries. Rebuildable, never authoritative.                                                  |
| **Compensating entry** | A new ledger entry that offsets an earlier one. The original stays.                                                                              |
| **`transactionTime`**  | When the business event happened, per the person recording it. Drives debt aging.                                                                |
| **`recordedAt`**       | When the system accepted the write. Drives audit and debugging.                                                                                  |
| **Idempotency key**    | Client-supplied retry token. Same key + same payload ⇒ exactly one effect.                                                                       |
| **`expectedVersion`**  | The aggregate version the caller believed it was changing. Mismatch ⇒ conflict, never a silent overwrite.                                        |
| **Capability**         | Server's answer to "may this be done now?", returned so the UI agrees with the server. Never a substitute for validation.                        |
| **Rejection code**     | Stable machine-readable refusal. Messages change; codes do not.                                                                                  |
| **Minor unit**         | The integer unit money is stored in. For VND the exponent is 0 — one minor unit is one đồng.                                                     |
| **Milli-unit**         | The integer unit quantity is stored in, scale 1000. 1.5 kg = `1500`.                                                                             |

## Related

- [context-map.md](context-map.md)
- [../07-data/ledger-model.md](../07-data/ledger-model.md)
- [../07-data/time-semantics.md](../07-data/time-semantics.md)
