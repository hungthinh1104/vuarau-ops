# Device smoke check — one real phone, one real deployment

**Nothing in this document is done.** Every box is unticked, and a box is ticked
only by somebody who performed the step on a real phone against a real deployment.
Filling one in from a laptop, from an emulator, or from confidence is the one way
this checklist becomes worse than not having it.

Run it **after** deploying and **before** the observed session. It takes about
fifteen minutes and it is the only thing that catches the class of problem that
survives everything else: a certificate a phone rejects, an email that lands in
spam, a rewrite that works on `localhost` and not behind a proxy, a viewport that
puts a control under the keyboard.

---

## Three kinds of evidence, and they are not interchangeable

This is the distinction the whole document exists to protect. Each answers a
different question, and none of them substitutes for another.

| Evidence             | Answers                                         | Produced by                                                                  | What it cannot tell you                                        |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Automated**        | Do the rules hold against a real server and DB? | `pnpm verify` — 5 Vitest projects, Playwright                                | Anything about a phone, a network, or a person                 |
| **Deployment smoke** | Does _this deployment_ work at all?             | This checklist, once, by the facilitator                                     | Whether anybody can use it. It is run by somebody who built it |
| **Real-user pilot**  | Can a depot worker record their own sale?       | An observed session ([pilot-worksheet.md](../00-product/pilot-worksheet.md)) | Nothing else can produce this                                  |

A green `pnpm verify` says the product is safe to put in front of somebody. A
completed checklist below says the deployment is reachable. **Neither is evidence
for H2**, and neither may be reported as if it were
([validation-plan.md](../00-product/validation-plan.md)).

The order matters: automated first, then smoke, then a person. A pilot session
spent discovering that the email code never arrives is a session that measured the
facilitator's morning.

---

## Before you start

- [ ] A **real phone**, not a desktop browser in device-emulation mode. The
      keyboard, the viewport and the certificate store are all different.
- [ ] **Mobile data, not wifi.** The product's hardest requirement is a connection
      that drops, and a depot has no wifi at the loading bay.
- [ ] The deployment passes `ops:check-env` and `/health/ready` returns 200.
- [ ] `ops:pilot-readiness` passes.
- [ ] An email address you can actually read on that phone.

Record the phone, the network and the deployment, because "it worked" is not a
finding unless somebody knows where:

```text
Phone / OS / browser:   ____________________
Network:                ____________________
Deployed URL:           ____________________
Date and tester:        ____________________
```

---

## The checklist

### 1. Reach it

- [ ] Open the deployed HTTPS URL in the phone's browser.
- [ ] The page loads, and the browser shows no certificate warning.
- [ ] The sign-in screen appears — not "chưa cấu hình đăng nhập", which means the
      Supabase variables did not reach the build.

### 2. Sign in

- [ ] Enter the email. Tap **Gửi mã đăng nhập**.
- [ ] The code arrives. **Note how long it took, and whether it went to spam.**
- [ ] Enter the code. Tap **Xác nhận**.
- [ ] You end up at the depot picker, not at an error.

```text
Code arrival time:  ______ s        In spam?  ☐ yes  ☐ no
```

### 3. Choose the depot

- [ ] The picker lists the pilot depot **by the name the server holds**.
- [ ] It lists **nothing else**.
- [ ] Choosing it opens the customer list.

### 4. Find a customer

- [ ] Search for a customer imported from the depot's own list.
- [ ] The name is spelled correctly, with its diacritics intact.
- [ ] **No demo customer appears.** "Chị Lan chợ Bình Điền", "Cô Bảy vựa Hóc Môn"
      and "Anh Tuấn mới mở" are seed data; any of them here means the seed ran
      against the pilot database.

### 5. Post a one-line sale

- [ ] Open the customer, tap the sale action.
- [ ] Enter one line: an item, a quantity, a unit, a price.
- [ ] The line total is right, and the running total is right.
- [ ] Tap **Chốt đơn**. The posted sale appears.
- [ ] **Every control is reachable with one thumb**, and nothing sits under the
      keyboard when a numeric field is focused.

### 6. Check what it did to the balance

- [ ] The posted sale screen shows the account entry it produced — one entry, for
      the sale total.
- [ ] Open the customer. The balance moved by exactly that amount, in that
      direction, and reads as **nợ** rather than as a negative number.
- [ ] The timeline shows the sale, with the business time you entered.

### 7. Record a payment

- [ ] Record a payment smaller than the balance.
- [ ] The balance drops by exactly that amount.
- [ ] The timeline shows the payment beside the sale.

### 8. Sign out and back in

- [ ] Sign out.
- [ ] Sign in again with a fresh code.
- [ ] You are asked to choose the depot again — selection is never remembered
      across a session for you.

### 9. The data is still there

- [ ] The sale from step 5 is still on the customer's timeline.
- [ ] The payment from step 7 is still there.
- [ ] The balance is the same number as before signing out.

### 10. Drop the connection and recover

The most important step, and the one most likely to be skipped because it is
awkward. It is the failure the product was designed around.

- [ ] Start a new one-line sale and fill it in.
- [ ] **Turn on airplane mode**, then tap **Chốt đơn**.
- [ ] The screen says the outcome is unknown — **not** that it failed. A worker
      who reads "thất bại" taps again, and a second tap with a fresh key is a
      second sale.
- [ ] Turn airplane mode off. Resend from the same screen.
- [ ] Open the customer's timeline. **Exactly one** entry for that sale.
- [ ] The balance moved by the sale total **once**.

```text
Entries created:  ______   (must be exactly 1)
```

## Execution record for every step

Complete this alongside the ten steps. A timestamp, request ID, anonymised
screenshot reference, sale ID, account-entry count, or operator initials may be
used as evidence. Do not retain OTPs, tokens, customer names, or amounts here.

| Step | Expected result                                                        | Evidence to retain                             | Stop condition                                                 | Reset after smoke                                            |
| ---- | ---------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| 1    | HTTPS page and sign-in form load without certificate warning           | timestamp, URL, screenshot reference           | Certificate warning, wrong host, or unconfigured sign-in       | none                                                         |
| 2    | A real six-digit email OTP reaches the phone and resolves to a session | timestamp, delivery latency, operator initials | OTP unavailable, invalid unexpectedly, or authentication fails | sign out after the check                                     |
| 3    | Only the declared pilot workspace appears and opens                    | screenshot reference, workspace ID             | Extra/missing workspace or access denied                       | sign out if selection persisted unexpectedly                 |
| 4    | A real imported customer is findable; no fixture customer appears      | anonymised search reference, operator initials | Demo/fixture customer or wrong customer data                   | discard the workspace if fixture/foreign data is present     |
| 5    | One sale posts with the displayed total and reachable controls         | sale ID, request ID, timestamp                 | Cannot post, wrong total, or inaccessible control              | record it for reconciliation; never delete it directly       |
| 6    | Exactly one account effect and matching timeline/balance appear        | account-entry count, sale ID                   | Missing/duplicate/mismatched financial effect                  | stop and preserve evidence                                   |
| 7    | One payment reduces the balance once                                   | payment ID/request ID, entry count             | Missing/duplicate/mismatched effect                            | stop and preserve evidence                                   |
| 8    | Fresh sign-in works and workspace selection is not retained            | timestamp, operator initials                   | Session/auth regression                                        | sign out                                                     |
| 9    | Sale, payment, and balance persist after fresh sign-in                 | IDs and account-entry count                    | Any persisted state differs                                    | stop and preserve evidence                                   |
| 10   | Same retry produces exactly one financial effect                       | original request ID, sale ID, entry count      | Any retry ambiguity, duplicate, or lost effect                 | **stop the pilot immediately**; do not retry with a new sale |

---

## Result

```text
Steps completed:            ____ / 10
Steps that failed:          ____________________________________________

What went wrong, verbatim:



Is the deployment usable for an observed session?   ☐ yes   ☐ no
```

**A failure in step 10 stops the pilot.** A duplicated receivable is the one defect
that costs a depot real money to discover, and it is the reason the automated suite
asserts it four different ways. Finding it here means something in the deployment —
a proxy retrying a POST, a load balancer with two instances and no shared
idempotency view — has broken a guarantee the application makes.

A failure anywhere else is a bug to fix before the session, not necessarily a stop.

## Related

- [deployment-contract.md](deployment-contract.md) — what the environment must satisfy
- [../00-product/pilot-onboarding.md](../00-product/pilot-onboarding.md) — preparing the depot
- [../00-product/pilot-worksheet.md](../00-product/pilot-worksheet.md) — the observed session itself
- [../00-product/validation-plan.md](../00-product/validation-plan.md) — what each kind of evidence settles
