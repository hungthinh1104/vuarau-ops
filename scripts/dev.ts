import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const databaseUrl =
  process.env["VUA_DEV_DATABASE_URL"] ?? "postgres://postgres:postgres@127.0.0.1:55432/vuarau_dev";

function assertLocalDatabase(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`pnpm dev refuses a non-local DATABASE_URL host: ${host}`);
  }
  if (parsed.pathname === "/vuarau_test") {
    throw new Error(
      "pnpm dev refuses the test database vuarau_test; use a disposable dev database such as vuarau_dev.",
    );
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function ensurePostgres(): void {
  const inspect = spawnSync(
    "docker",
    ["inspect", "-f", "{{.State.Running}}", "vuarau-ops-dev-pg"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (inspect.status !== 0) {
    run("docker", [
      "run",
      "--detach",
      "--name",
      "vuarau-ops-dev-pg",
      "-e",
      "POSTGRES_PASSWORD=postgres",
      "-e",
      "POSTGRES_USER=postgres",
      "-e",
      "POSTGRES_DB=vuarau_dev",
      "-p",
      "55432:5432",
      "postgres:17-alpine",
    ]);
  } else if (inspect.stdout.trim() !== "true") {
    run("docker", ["start", "vuarau-ops-dev-pg"]);
  }
  spawnSync("docker", ["exec", "vuarau-ops-dev-pg", "createdb", "-U", "postgres", "vuarau_dev"], {
    cwd: root,
    stdio: "ignore",
  });
}

assertLocalDatabase(databaseUrl);
ensurePostgres();
run("pnpm", ["db:migrate"], { ...process.env, DATABASE_URL: databaseUrl });

const children = [
  spawn("pnpm", ["--filter", "@vuarau/api", "dev"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: "3102" },
    stdio: "inherit",
  }),
  spawn("pnpm", ["--filter", "@vuarau/web", "dev"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  }),
];

const stop = (signal: NodeJS.Signals) => {
  for (const child of children) child.kill(signal);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

await Promise.all(
  children.map(
    (child) =>
      new Promise<void>((resolve, reject) => {
        child.once("exit", (code) =>
          code === 0 ? resolve() : reject(new Error(`dev process exited with ${code ?? "signal"}`)),
        );
        child.once("error", reject);
      }),
  ),
);
