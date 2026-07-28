import {
  E2E_ACTORS,
  E2E_API_PORT,
  E2E_WORKSPACE_ID,
  mintAccessToken,
  type E2ERole,
} from "./environment.ts";

/**
 * A thin, deliberately untyped tRPC caller for **arranging** test data.
 *
 * Specs use it to create a customer or seed a starting balance before driving the
 * browser, and to read back what the browser wrote. It talks to the same running
 * API the browser does — so an assertion made here is an assertion about the same
 * database rows the UI just changed.
 *
 * It does not share the browser's typed client on purpose. That client is bundled
 * for the browser, and importing it into Node to save a few lines would mean the
 * arrange step and the act step could not fail independently.
 */
const BASE = `http://127.0.0.1:${E2E_API_PORT}`;

type Envelope = Record<string, unknown>;

async function call(
  path: string,
  kind: "query" | "mutation",
  input: Envelope,
  role: E2ERole,
): Promise<unknown> {
  const token = await mintAccessToken(role);
  const url =
    kind === "query"
      ? `${BASE}/${path}?input=${encodeURIComponent(JSON.stringify(input))}`
      : `${BASE}/${path}`;

  const response = await fetch(url, {
    method: kind === "query" ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    ...(kind === "mutation" ? { body: JSON.stringify(input) } : {}),
  });

  const body = (await response.json()) as
    | { result: { data: unknown } }
    | { error: { message: string; data?: { domainError?: { code: string } } } };

  if ("error" in body) {
    const code = body.error.data?.domainError?.code ?? "UNKNOWN";
    throw new Error(`${path} failed: ${code} — ${body.error.message}`);
  }
  return body.result.data;
}

function envelope(extra: Envelope = {}): Envelope {
  return {
    commandId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    workspaceId: E2E_WORKSPACE_ID,
    actorId: "",
    occurredAt: new Date().toISOString(),
    ...extra,
  };
}

export const api = {
  async createCustomer(displayName: string, role: E2ERole = "owner"): Promise<string> {
    const customerId = crypto.randomUUID();
    await call(
      "customer.create",
      "mutation",
      {
        ...envelope({ actorId: actorFor(role) }),
        payload: { customerId, displayName, phone: null, note: null },
      },
      role,
    );
    return customerId;
  },

  /** Gives a customer an opening receivable so a payment has something to reduce. */
  async openingBalance(customerId: string, amountMinor: number): Promise<void> {
    await call(
      "debt.adjust",
      "mutation",
      {
        ...envelope({ actorId: actorFor("owner") }),
        payload: {
          adjustmentId: crypto.randomUUID(),
          customerId,
          direction: "increase",
          amount: { amountMinor, currency: "VND" },
          reasonCode: "opening_balance",
          reason: "Số dư đầu kỳ cho kiểm thử tự động",
        },
      },
      "owner",
    );
  },

  async balance(
    customerId: string,
  ): Promise<{ balance: { amountMinor: number }; classification: string }> {
    return (await call(
      "account.balance",
      "query",
      { workspaceId: E2E_WORKSPACE_ID, customerId },
      "owner",
    )) as { balance: { amountMinor: number }; classification: string };
  },

  async timeline(customerId: string): Promise<{
    items: {
      id: string;
      amount: { amountMinor: number };
      runningBalance: { amountMinor: number };
      source: { type: string; document: { type: string; id: string } };
    }[];
  }> {
    return (await call(
      "account.timeline",
      "query",
      { workspaceId: E2E_WORKSPACE_ID, customerId, from: null, to: null, cursor: null, limit: 50 },
      "owner",
    )) as {
      items: {
        id: string;
        amount: { amountMinor: number };
        runningBalance: { amountMinor: number };
        source: { type: string; document: { type: string; id: string } };
      }[];
    };
  },

  async payments(
    customerId: string,
  ): Promise<{ items: { id: string; amount: { amountMinor: number } }[] }> {
    return (await call(
      "payment.list",
      "query",
      {
        workspaceId: E2E_WORKSPACE_ID,
        customerId,
        status: null,
        from: null,
        to: null,
        cursor: null,
        limit: 50,
      },
      "owner",
    )) as { items: { id: string; amount: { amountMinor: number } }[] };
  },

  async expectWorkspaceAccessDenied(customerId: string): Promise<void> {
    await expectCallToFail(
      "account.timeline",
      "query",
      {
        workspaceId: crypto.randomUUID(),
        customerId,
        from: null,
        to: null,
        cursor: null,
        limit: 50,
      },
      "owner",
      "WORKSPACE_ACCESS_DENIED",
    );
  },

  /**
   * Moves a draft's version out from under the browser, so a spec can produce a
   * genuine `SALE_VERSION_CONFLICT` rather than simulating one.
   */
  async updateDraftElsewhere(saleId: string, expectedVersion: number): Promise<void> {
    await call(
      "sale.updateDraft",
      "mutation",
      {
        ...envelope({ actorId: actorFor("owner"), expectedVersion }),
        payload: {
          saleId,
          lines: [
            {
              lineId: crypto.randomUUID(),
              // Null, like a line a worker types: there is no product master
              // (BR-SALE-019).
              productId: null,
              productName: "Sửa từ máy khác",
              quantity: { valueScaled: 1_000, unit: "kg" },
              unitPrice: { amountMinor: 1_000, currency: "VND" },
            },
          ],
          note: null,
          dueAt: null,
        },
      },
      "owner",
    );
  },

  async sales(customerId: string): Promise<{
    items: {
      id: string;
      status: string;
      version: number;
      totalAmount: { amountMinor: number };
      lineCount: number;
    }[];
  }> {
    return (await call(
      "sale.list",
      "query",
      {
        workspaceId: E2E_WORKSPACE_ID,
        customerId,
        status: null,
        financialState: null,
        from: null,
        to: null,
        cursor: null,
        limit: 50,
      },
      "owner",
    )) as {
      items: {
        id: string;
        status: string;
        version: number;
        totalAmount: { amountMinor: number };
        lineCount: number;
      }[];
    };
  },
};

async function expectCallToFail(
  path: string,
  kind: "query" | "mutation",
  input: Envelope,
  role: E2ERole,
  code: string,
): Promise<void> {
  try {
    await call(path, kind, input, role);
  } catch (error) {
    if (error instanceof Error && error.message.includes(`${path} failed: ${code}`)) return;
    throw error;
  }
  throw new Error(`${path} unexpectedly succeeded; expected ${code}.`);
}

function actorFor(role: E2ERole): string {
  // One list, in `environment.ts`. A second copy here drifted the moment an actor
  // was added to the seed, which is exactly how it was found.
  return E2E_ACTORS[role];
}
