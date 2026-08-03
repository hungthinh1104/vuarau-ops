# Observability, alerts, and incident correlation

## Signals

Structured logs contain only safe identifiers/enums/numbers:

```text
request   requestId · procedure · status · durationMs
command   requestId · commandId · workspaceId · actorId · type · outcome/code · durationMs
query     requestId · workspaceId · actorId · permission · outcome/code · durationMs
integrity requestId · workspaceId · checkType · healthy/attention
health    probe · status · failing
exception requestId · procedure · transport code
```

The Prometheus endpoint `/metrics` derives counters and latency summaries from the
same closed events. It deliberately drops request, command, actor and workspace
identifiers from labels to avoid high cardinality and business-data leakage.
Unexpected tRPC failures emit an `exception` event with no message, stack, cause,
payload, SQL or business amount. Expected domain refusals are already represented
by command/query outcome codes and are not duplicated as exceptions.

## Correlation procedure

1. Start with the response `x-request-id`.
2. Find the request log and its command/query log.
3. For a command, use `commandId` to find `command_receipts` and the audit record.
4. Use the audit aggregate/source id to open the canonical Sale, Payment,
   Purchase, Receipt, movement, Delivery, document or adjustment.
5. Compare the canonical history with its projection/reconciliation; never repair
   by editing a ledger or movement.

The web client renders the response id as `Mã truy vết` on query and command
failure states whenever a response exists. It does not invent an id when a
request disappears before a response, so an unknown command outcome continues
to use its unchanged command identity for safe retry.

## Actionable alert definitions

| Alert                | Window and threshold                                           | First action                                                        |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| API not ready        | readiness 503 for 2 minutes                                    | stop traffic; check PostgreSQL reachability/config                  |
| Command failures     | HTTP 5xx >1% for 5 minutes                                     | correlate request ids; suspend affected command                     |
| Rejection anomaly    | one rejection code >5× 7-day same-hour baseline for 10 minutes | inspect deploy/client change; do not treat business refusals as 500 |
| Replay surge         | replayed commands >20% for 10 minutes                          | inspect network/client retry loop; verify exact-one effects         |
| Integrity attention  | any `attention` result                                         | stop affected workflow and preserve reconciliation evidence         |
| Latency budget       | p95 above the production-scale budget for 15 minutes           | capture EXPLAIN/BUFFERS before adding index/cache                   |
| Public rate limit    | 429 >30/minute for 5 minutes                                   | inspect share-token abuse and edge logs; revoke exposed share       |
| Backup/restore drill | scheduled drill missing or failed                              | production readiness fails; escalate to deployment operator         |

P0 means duplicate/lost/cross-workspace/corrupt canonical truth: suspend immediately.
P1 means a workflow cannot safely continue: disable/suspend that workflow until a
verified fix. Incident records retain release SHA, request/command ids, timestamps,
impact, evidence, containment, correction and regression test.
