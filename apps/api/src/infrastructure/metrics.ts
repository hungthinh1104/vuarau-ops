import type { LogEvent } from "./logging.ts";

type CounterKey = `${string}|${string}`;

const counters = new Map<CounterKey, number>();
const latency = new Map<string, { count: number; sumMs: number; maxMs: number }>();

const increment = (family: string, label: string): void => {
  const key: CounterKey = `${family}|${label}`;
  counters.set(key, (counters.get(key) ?? 0) + 1);
};

const observeLatency = (operation: string, durationMs: number): void => {
  const current = latency.get(operation) ?? { count: 0, sumMs: 0, maxMs: 0 };
  latency.set(operation, {
    count: current.count + 1,
    sumMs: current.sumMs + durationMs,
    maxMs: Math.max(current.maxMs, durationMs),
  });
};

/** Consumes only the closed, business-data-free log vocabulary. */
export function observeOperationalEvent(event: LogEvent): void {
  if (event.event === "request") {
    increment("http_requests", `${event.procedure}:${event.status}`);
    observeLatency(`request:${event.procedure}`, event.durationMs);
  } else if (event.event === "command") {
    increment("commands", `${event.commandType}:${event.outcome}`);
    if (event.code !== null) increment("rejections", event.code);
    observeLatency(`command:${event.commandType}`, event.durationMs);
  } else if (event.event === "query") {
    increment("queries", `${event.queryType}:${event.outcome}`);
    if (event.code !== null) increment("rejections", event.code);
    observeLatency(`query:${event.queryType}`, event.durationMs);
  } else if (event.event === "integrity") {
    increment("integrity_checks", `${event.checkType}:${event.status}`);
  } else if (event.event === "health") {
    increment("health_checks", `${event.probe}:${event.status}`);
  }
}

const metricName = (value: string): string => value.toLowerCase().replaceAll(/[^a-z0-9_]/g, "_");

/**
 * Prometheus text without workspace, actor, token, amount, note, or payload
 * labels. Operation/rejection names are bounded code vocabulary.
 */
export function renderMetrics(): string {
  const lines = [
    "# HELP vuarau_events_total Safe operational event count.",
    "# TYPE vuarau_events_total counter",
  ];
  for (const [key, value] of [...counters].sort(([a], [b]) => a.localeCompare(b))) {
    const separator = key.indexOf("|");
    const family = key.slice(0, separator);
    const label = key.slice(separator + 1);
    lines.push(
      `vuarau_events_total{family="${metricName(family)}",result="${metricName(label)}"} ${value}`,
    );
  }
  lines.push(
    "# HELP vuarau_operation_latency_ms Safe operation latency summary.",
    "# TYPE vuarau_operation_latency_ms summary",
  );
  for (const [operation, value] of [...latency].sort(([a], [b]) => a.localeCompare(b))) {
    const label = metricName(operation);
    lines.push(`vuarau_operation_latency_ms_count{operation="${label}"} ${value.count}`);
    lines.push(`vuarau_operation_latency_ms_sum{operation="${label}"} ${value.sumMs}`);
    lines.push(`vuarau_operation_latency_ms_max{operation="${label}"} ${value.maxMs}`);
  }
  return `${lines.join("\n")}\n`;
}

export function resetMetricsForTests(): void {
  counters.clear();
  latency.clear();
}
