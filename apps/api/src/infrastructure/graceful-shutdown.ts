import type { Server } from "node:http";

type GracefulShutdownOptions = {
  readonly server: Server;
  readonly closeResources: () => Promise<void>;
  readonly timeoutMs?: number;
  readonly onShutdownStarted?: () => void;
};

const bounded = async (work: Promise<void>, timeoutMs: number): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const completed = work.then(
    () => true as const,
    () => true as const,
  );
  const result = await Promise.race([completed, timeout]);
  if (timer !== undefined) clearTimeout(timer);
  return result;
};

/**
 * Stop accepting traffic, let in-flight work drain for a bounded interval,
 * then release database/listener resources. A process signal must not leave an
 * SSE connection or a pool checkout keeping an old release alive forever.
 */
export function installGracefulShutdown({
  server,
  closeResources,
  timeoutMs = 10_000,
  onShutdownStarted,
}: GracefulShutdownOptions): {
  readonly shutdown: () => Promise<void>;
  readonly dispose: () => void;
} {
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = (): Promise<void> => {
    if (shutdownPromise !== null) return shutdownPromise;
    shutdownPromise = (async () => {
      onShutdownStarted?.();
      const closed = await bounded(
        new Promise<void>((resolve) => {
          try {
            server.close(() => resolve());
          } catch {
            resolve();
          }
        }),
        timeoutMs,
      );
      if (!closed) {
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
      }
      await bounded(closeResources(), timeoutMs);
    })();
    return shutdownPromise;
  };

  const onSignal = (): void => {
    void shutdown().finally(() => {
      process.exitCode = 0;
    });
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  return {
    shutdown,
    dispose: () => {
      process.removeListener("SIGTERM", onSignal);
      process.removeListener("SIGINT", onSignal);
    },
  };
}
