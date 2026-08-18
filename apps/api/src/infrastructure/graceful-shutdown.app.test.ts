import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installGracefulShutdown } from "./graceful-shutdown.ts";

const controllers: Array<{ dispose: () => void }> = [];

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

describe("bounded API shutdown", () => {
  it("stops accepting work once and closes resources after the server drains", async () => {
    const close = vi.fn((callback: () => void) => callback());
    const server = {
      close,
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
    } as unknown as Server;
    let started = 0;
    let resourcesClosed = 0;
    const controller = installGracefulShutdown({
      server,
      onShutdownStarted: () => {
        started += 1;
      },
      closeResources: async () => {
        resourcesClosed += 1;
      },
    });
    controllers.push(controller);

    await Promise.all([controller.shutdown(), controller.shutdown()]);

    expect(started).toBe(1);
    expect(close).toHaveBeenCalledOnce();
    expect(resourcesClosed).toBe(1);
    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });
});
