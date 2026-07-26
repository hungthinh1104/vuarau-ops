# ADR-0008 — Idempotency records for retry-safe commands

**Status:** accepted · 2026-07-26

## Context

Depot phones run on 4G that drops mid-request. The failure mode that matters is
not "the request failed" — the client can retry that. It is "the request
succeeded and the response was lost", after which a retry would confirm the order
a second time and double the customer's debt.

Buttons also get tapped twice when the UI does not visibly respond.

## Decision

1. Every command carries a client-supplied `idempotencyKey` (8–200 characters).
2. `command_receipts` stores `(workspace_id, idempotency_key)` **unique**, along
   with the command type, a SHA-256 hash of the canonicalised payload, a status,
   and the serialised successful result.
3. Before executing, the pipeline looks up the key:
   - **no record** → insert one as `in_progress`, execute, store the result, mark
     `completed`, all in the command's transaction;
   - **completed, same payload hash** → return the stored result, execute nothing
     (BR-COMMAND-001);
   - **completed, different hash** → `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`
     (BR-COMMAND-002);
   - **in_progress** → `COMMAND_IN_PROGRESS`, the one retryable code.
4. The unique index — not the read — is the real mechanism. Two concurrent replays
   both pass the lookup; one loses the insert and is handled as a replay.
5. Creation commands also carry client-supplied aggregate ids, so a duplicate is
   structurally impossible as well as detected.
6. Failed commands do **not** consume the key. A client may fix the payload and
   reuse it.

## Alternatives considered

| Alternative                                         | Why not                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Natural deduplication on business fields            | "Same customer, same amount, same minute" wrongly merges two genuine 50.000 ₫ cash payments taken a minute apart.     |
| Server-generated ids + client dedupe                | The client cannot dedupe what it never got a response for.                                                            |
| At-least-once delivery with idempotent effects only | Works for a pure ledger append; fails for `ConfirmOrder`, which must also transition state and return a DTO.          |
| Time-window deduplication                           | Wrong when the retry arrives after the window, wrong when two genuine identical commands arrive inside it.            |
| Storing only the hash, not the result               | The retry would get "already done" instead of the data it needs. The client asked a question and deserves the answer. |

## Consequences

**Good.** A dropped connection is harmless. Double-tap is harmless. Offline
capture already has the mechanism it will need. The stored result means a retry is
indistinguishable from the original call.

**Bad.** `command_receipts` grows unboundedly and stores a JSON result per command
— a retention policy is needed (ASM-014, not yet written). Clients must generate
and persist keys locally, including across app restarts, or the guarantee is void.

**Neutral.** The payload hash canonicalises key order before hashing, so a client
that reorders JSON fields is not falsely rejected.

## Revisit when

- Receipt volume or row size makes retention a real problem — the answer is a
  retention window plus pruning, not weaker idempotency.
- A command becomes long-running enough that `in_progress` needs a timeout and a
  recovery path rather than a retryable error.
