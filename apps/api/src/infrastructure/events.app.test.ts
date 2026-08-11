import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@vuarau/domain-kernel";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures";
import type { Repositories, UnitOfWork } from "./persistence/ports.ts";
import type { JwtVerifier } from "./auth/jwt-verifier.ts";
import { createEventsHandler } from "./events.ts";
import type { InvalidationBus } from "./invalidation.ts";
import { createHarness } from "../testing/command-test-harness.ts";
import type { CommandDeps } from "../modules/shared/command-pipeline.ts";

class TestResponse extends EventEmitter {
  statusCode = 0;
  writableEnded = false;
  body = "";

  writeHead(statusCode: number): this {
    this.statusCode = statusCode;
    return this;
  }

  write(chunk: string): boolean {
    this.body += chunk;
    return true;
  }

  end(chunk?: string): this {
    if (chunk !== undefined) this.body += chunk;
    this.writableEnded = true;
    this.emit("close");
    return this;
  }
}

function request(): IncomingMessage {
  return Object.assign(new EventEmitter(), {
    method: "GET",
    url: `/events?workspaceId=${WORKSPACE_ID}`,
    headers: { authorization: "Bearer test-token" },
  }) as unknown as IncomingMessage;
}

function setupStream(): {
  readonly response: TestResponse;
  readonly request: IncomingMessage;
  readonly setMembershipActive: (active: boolean) => void;
  readonly setTokenValid: (valid: boolean) => void;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
  readonly verifier: JwtVerifier;
  readonly deps: CommandDeps;
  readonly bus: InvalidationBus;
} {
  const harness = createHarness();
  let membershipActive = true;
  let tokenValid = true;
  const unsubscribe = vi.fn();
  const repos = {
    actors: {
      findBySupabaseUserId: async () => ({ actorId: ACTOR_ID }),
    },
    workspaces: {
      findMembershipForUpdate: async () =>
        membershipActive
          ? {
              workspaceId: WORKSPACE_ID,
              actorId: ACTOR_ID,
              role: "owner" as const,
              roles: ["owner" as const],
              isActive: true,
            }
          : null,
    },
  } as unknown as Repositories;
  const uow: UnitOfWork = {
    transaction: async <T>(work: (repos: Repositories) => Promise<T>): Promise<T> => work(repos),
  };
  const verifier: JwtVerifier = {
    verify: vi.fn(async () =>
      tokenValid
        ? ok({ subject: "supabase-subject" })
        : err("AUTHENTICATION_INVALID", "The access token is not valid."),
    ),
  };
  const bus: InvalidationBus = {
    publish: async () => undefined,
    subscribe: vi.fn(() => unsubscribe),
  };

  return {
    response: new TestResponse(),
    request: request(),
    setMembershipActive: (active) => {
      membershipActive = active;
    },
    setTokenValid: (valid) => {
      tokenValid = valid;
    },
    unsubscribe,
    verifier,
    deps: { ...harness.deps, uow },
    bus,
  };
}

beforeEach(() => {
  vi.stubEnv("DEV_PRINCIPAL_FALLBACK", "0");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("long-lived event authorization", () => {
  it("closes the stream after membership is revoked", async () => {
    const setup = setupStream();
    const handler = createEventsHandler(setup.deps, setup.verifier, setup.bus, 5);

    await expect(handler(setup.request, setup.response as unknown as ServerResponse)).resolves.toBe(
      true,
    );
    expect(setup.response.statusCode).toBe(200);
    expect(setup.response.body).toContain(": connected");

    setup.setMembershipActive(false);
    await vi.waitFor(() => expect(setup.response.writableEnded).toBe(true), { timeout: 250 });

    expect(setup.unsubscribe).toHaveBeenCalledOnce();
    expect(setup.verifier.verify).toHaveBeenCalledTimes(2);
  });

  it("closes the stream after the bearer token expires", async () => {
    const setup = setupStream();
    const handler = createEventsHandler(setup.deps, setup.verifier, setup.bus, 5);

    await handler(setup.request, setup.response as unknown as ServerResponse);
    setup.setTokenValid(false);
    await vi.waitFor(() => expect(setup.response.writableEnded).toBe(true), { timeout: 250 });

    expect(setup.unsubscribe).toHaveBeenCalledOnce();
    expect(setup.verifier.verify).toHaveBeenCalledTimes(2);
  });
});
