import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  vnd,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../testing/command-test-harness.ts";
import { createCustomer } from "../modules/customer/create-customer.handler.ts";
import { adjustCustomerDebt } from "../modules/account/adjust-debt.handler.ts";
import { setLogSink, withRequestId, type LogEvent } from "./logging.ts";

let harness: Harness;
let captured: LogEvent[];

beforeEach(() => {
  harness = createHarness();
  captured = [];
  setLogSink((event) => captured.push(event));
});

afterEach(() => {
  setLogSink(null);
});

/**
 * BR-OPS-001 / TC-OPS-004 — server logs carry identifiers and no business data.
 *
 * A depot's book of who owes what is the most sensitive thing this system holds,
 * and a log file is where it leaks without anybody noticing — because nobody reads
 * logs, they grep them, and the leak is found by whoever else has access.
 *
 * These tests run a **real command** carrying a real customer name, a real phone
 * number and a real amount, and then assert that none of them appears anywhere in
 * what was logged. Asserting on the type would prove the type; this proves the
 * pipeline.
 */
describe("BR-OPS-001 / TC-OPS-004 — what a command writes to the log", () => {
  const NAME = "Chị Lan chợ Bình Điền";
  const PHONE = "0901234567";
  const NOTE = "nợ cũ từ sổ giấy";

  const createInput = {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    payload: {
      customerId: "00000000-0000-4000-8000-0000000000f1",
      displayName: NAME,
      phone: PHONE,
      note: NOTE,
    },
  };

  const logged = (): string => JSON.stringify(captured);

  it("logs one line per accepted command, naming only identifiers", async () => {
    const result = await createCustomer(harness.ctx, createInput);
    expect(result.ok).toBe(true);

    const commands = captured.filter((event) => event.event === "command");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      event: "command",
      commandId: COMMAND_ID,
      commandType: "CreateCustomer",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      outcome: "accepted",
      code: null,
    });
  });

  it("never writes the customer's name, phone or note", async () => {
    await createCustomer(harness.ctx, createInput);

    expect(logged()).not.toContain(NAME);
    expect(logged()).not.toContain(PHONE);
    expect(logged()).not.toContain(NOTE);
  });

  it("never writes an amount, on the command that exists to move one", async () => {
    // `AdjustCustomerDebt` moves a balance with no underlying document — the
    // sharpest command in the system, and the one whose amount would be most
    // interesting in a log.
    await adjustCustomerDebt(harness.ctx, {
      commandId: COMMAND_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: TRANSACTION_TIME,
      payload: {
        adjustmentId: "00000000-0000-4000-8000-0000000000f2",
        customerId: CUSTOMER_ID,
        direction: "increase",
        amount: vnd(4_500_000),
        reasonCode: "opening_balance",
        reason: NOTE,
      },
    });

    expect(logged()).not.toContain("4500000");
    expect(logged()).not.toContain("4.500.000");
    expect(logged()).not.toContain(NOTE);
  });

  it("logs a refusal as a code, never as a message", async () => {
    // A `warehouse` worker holds no `debt.adjust`.
    const result = await adjustCustomerDebt(harness.contextFor(harness.ctx.principal.actorId), {
      ...createInput,
      payload: {
        adjustmentId: "00000000-0000-4000-8000-0000000000f3",
        customerId: CUSTOMER_ID,
        direction: "increase",
        amount: vnd(1),
        reasonCode: "opening_balance",
        reason: "",
      },
    });
    expect(result.ok).toBe(false);

    const commands = captured.filter((event) => event.event === "command");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ outcome: "rejected" });
    if (commands[0]?.event !== "command") return;
    // A code from the closed rejection set, and nothing that could be prose a
    // handler happened to interpolate a name into.
    expect(commands[0].code).toMatch(/^[A-Z_]+$/);
  });

  it("carries the request's correlation id when there is one, and null when there is not", async () => {
    await createCustomer(harness.ctx, createInput);
    const withoutRequest = captured.find((event) => event.event === "command");
    expect(withoutRequest).toMatchObject({ requestId: null });

    captured = [];
    await withRequestId("req-1234", async () => {
      await createCustomer(harness.contextFor(ACTOR_ID), {
        ...createInput,
        commandId: "00000000-0000-4000-8000-0000000000f4",
        idempotencyKey: "second-key",
        payload: { ...createInput.payload, customerId: "00000000-0000-4000-8000-0000000000f5" },
      });
    });
    expect(captured.find((event) => event.event === "command")).toMatchObject({
      requestId: "req-1234",
    });
  });

  it("distinguishes a replay from a first acceptance", async () => {
    // BR-COMMAND-001. Worth logging separately: "one command, two log lines" is
    // what a retry over flaky 4G looks like, and reading it as two sales is the
    // mistake this distinction prevents.
    await createCustomer(harness.ctx, createInput);
    captured = [];
    await createCustomer(harness.ctx, createInput);

    expect(captured.filter((event) => event.event === "command")).toMatchObject([
      { outcome: "replayed" },
    ]);
  });
});
