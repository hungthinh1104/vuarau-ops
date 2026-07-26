import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Structured server logs, with a closed vocabulary.
 *
 * A depot's book of who owes what is the most sensitive thing this system holds,
 * and a log file is where it leaks without anybody noticing — because nobody reads
 * logs, they grep them, and the leak is discovered by whoever else has access.
 *
 * So the event type is closed and every field is an **identifier, an enum, or a
 * number** (BR-OPS-001). There is no `message`, no `detail`, and no
 * `Record<string, unknown>` — the shapes through which a customer name reaches a
 * log line one "just this once" at a time.
 *
 * What is deliberately absent: bearer tokens, customer names, phone numbers,
 * notes, product names, and every amount. A log that told you a payment of
 * 4.500.000 ₫ was recorded would be a log that told you what a customer owes.
 */

/** Closed. Adding a field means adding it here, in review, on purpose. */
export type LogEvent =
  | {
      readonly event: "startup";
      readonly appEnv: string;
      readonly port: number;
      readonly verification: "jwks" | "hs256";
    }
  | {
      readonly event: "request";
      readonly requestId: string;
      /** A procedure name from the router — `sale.post`, not a payload. */
      readonly procedure: string;
      readonly status: number;
      readonly durationMs: number;
    }
  | {
      readonly event: "command";
      /** Correlates this command with the HTTP request that carried it. */
      readonly requestId: string | null;
      readonly commandId: string;
      readonly commandType: string;
      readonly workspaceId: string;
      readonly actorId: string;
      readonly outcome: "accepted" | "rejected" | "replayed";
      /** A stable rejection code, from a closed set. Never a message. */
      readonly code: string | null;
      readonly durationMs: number;
    }
  | {
      readonly event: "health";
      readonly probe: "live" | "ready";
      readonly status: number;
      /** Which readiness check failed, by name. Never why in prose. */
      readonly failing: string | null;
    };

export type LogSink = (event: LogEvent) => void;

/**
 * One line of JSON per event, on stdout.
 *
 * `console.log` rather than a logging library: there is one destination, one
 * format, and no filtering to configure. A library would add a dependency to
 * decide what this file decides in six lines.
 */
const jsonSink: LogSink = (event) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(event));
};

let sink: LogSink = jsonSink;

/** Replaces the destination. Used by tests, and by nothing else. */
export function setLogSink(replacement: LogSink | null): void {
  sink = replacement ?? jsonSink;
}

export function log(event: LogEvent): void {
  sink(event);
}

/**
 * The current request's correlation id, carried without threading it through
 * every function between the transport and the command pipeline.
 *
 * `AsyncLocalStorage` rather than a parameter on `CommandDeps`: the id is a
 * property of the request, not of the business operation, and a command handler
 * that had to accept one could forget to pass it on. Absent — an operator tool at
 * a shell, a test — the correlation id is simply null, which is the truth.
 */
const requestScope = new AsyncLocalStorage<{ requestId: string }>();

export function withRequestId<T>(requestId: string, work: () => T): T {
  return requestScope.run({ requestId }, work);
}

export function currentRequestId(): string | null {
  return requestScope.getStore()?.requestId ?? null;
}
