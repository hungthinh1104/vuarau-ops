/**
 * What the server needs before it is allowed to answer anything.
 *
 * A missing variable used to be discovered by the first request that needed it,
 * which for a pilot means a depot worker standing at a loading bay holding a
 * phone. So this reads the whole environment once, decides, and either hands back
 * a config or a list of exactly what is wrong.
 *
 * It is a **pure function of a record**, not a reader of `process.env`, so the
 * rules can be tested without a process and without a real credential anywhere in
 * the repository (BR-OPS-002).
 *
 * Nothing here ever returns a value it read. Problems name the **variable**, and
 * `describeConfig` reports set/not-set and derived facts a log may carry. A
 * configuration checker that prints the thing it is checking is a credential in a
 * CI log.
 */

/**
 * Two environments, and the difference is not decoration.
 *
 * `development` is a laptop and the end-to-end suite: a shared HS256 secret is
 * allowed because there is no Supabase project to fetch keys from and nothing to
 * protect. `pilot` is a real depot's data on a real phone, and the same shortcut
 * becomes a signing key sitting in an environment variable — anything that can
 * read it can mint a token for any actor.
 */
export const APP_ENVIRONMENTS = ["development", "pilot"] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export type AuthConfig = {
  readonly issuer: string;
  readonly audience: string;
} & ({ readonly jwksUrl: string } | { readonly jwtSecret: string });

export type ServerConfig = {
  readonly appEnv: AppEnvironment;
  readonly databaseUrl: string;
  readonly port: number;
  readonly auth: AuthConfig;
  /** The HTTPS origin a phone actually opens. Required for a pilot. */
  readonly publicAppOrigin: string | null;
};

export type ConfigProblem = {
  /** The variable to go and fix. Never its value. */
  readonly variable: string;
  readonly problem: string;
};

export type ConfigResult =
  | { readonly ok: true; readonly config: ServerConfig }
  | { readonly ok: false; readonly problems: readonly ConfigProblem[] };

export type Env = Readonly<Record<string, string | undefined>>;

const present = (env: Env, name: string): string | null => {
  const value = env[name];
  return value === undefined || value.trim().length === 0 ? null : value.trim();
};

/**
 * A `NEXT_PUBLIC_*` variable is compiled into the bundle a phone downloads. Next
 * inlines it at build time, so it is not merely readable — it is published.
 *
 * The two that belong there are the project URL and the publishable anon key.
 * Anything else whose name reads like a credential is almost certainly somebody
 * prefixing a secret to make it reach the browser, which is exactly the mistake
 * this catches while it is still a config file rather than a deployed bundle.
 */
const PUBLISHABLE = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
const SECRET_SHAPED = /SECRET|PASSWORD|SERVICE_ROLE|PRIVATE|CREDENTIAL|JWT_SECRET/i;

export function publishedSecrets(env: Env): readonly ConfigProblem[] {
  return Object.keys(env)
    .filter((name) => name.startsWith("NEXT_PUBLIC_"))
    .filter((name) => !PUBLISHABLE.has(name))
    .filter((name) => SECRET_SHAPED.test(name))
    .map((name) => ({
      variable: name,
      problem:
        "NEXT_PUBLIC_* is inlined into the browser bundle at build time. " +
        "A secret named here is a published secret.",
    }));
}

export function readServerConfig(env: Env): ConfigResult {
  const problems: ConfigProblem[] = [...publishedSecrets(env)];
  const fail = (variable: string, problem: string) => problems.push({ variable, problem });

  const rawEnv = present(env, "APP_ENV") ?? "development";
  if (!(APP_ENVIRONMENTS as readonly string[]).includes(rawEnv)) {
    fail("APP_ENV", `must be one of: ${APP_ENVIRONMENTS.join(", ")}`);
  }
  const appEnv = rawEnv as AppEnvironment;
  const isPilot = appEnv === "pilot";

  const databaseUrl = present(env, "DATABASE_URL");
  if (databaseUrl === null) {
    fail("DATABASE_URL", "required");
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    fail("DATABASE_URL", "must be a postgres:// or postgresql:// connection string");
  }

  const issuer = present(env, "SUPABASE_JWT_ISSUER");
  if (issuer === null) {
    fail("SUPABASE_JWT_ISSUER", "required — the `iss` every token is checked against");
  } else if (isPilot && !issuer.startsWith("https://")) {
    fail("SUPABASE_JWT_ISSUER", "must be https in a pilot environment");
  }

  const jwksUrl = present(env, "SUPABASE_JWKS_URL");
  const jwtSecret = present(env, "SUPABASE_JWT_SECRET");

  if (jwksUrl === null && jwtSecret === null) {
    fail("SUPABASE_JWKS_URL", "set exactly one of SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET");
  }
  if (jwksUrl !== null && jwtSecret !== null) {
    fail("SUPABASE_JWT_SECRET", "set exactly one — both are configured");
  }
  if (isPilot && jwtSecret !== null) {
    // The whole point of the two environments.
    fail(
      "SUPABASE_JWT_SECRET",
      "HS256 is refused in a pilot environment. Use SUPABASE_JWKS_URL, so this " +
        "process verifies tokens without ever holding material that can mint them.",
    );
  }
  if (jwksUrl !== null && !jwksUrl.startsWith("https://") && isPilot) {
    fail("SUPABASE_JWKS_URL", "must be https in a pilot environment");
  }

  const publicAppOrigin = present(env, "PUBLIC_APP_ORIGIN");
  if (isPilot && publicAppOrigin === null) {
    fail("PUBLIC_APP_ORIGIN", "required in a pilot — the HTTPS origin a phone opens");
  }
  if (publicAppOrigin !== null && isPilot && !publicAppOrigin.startsWith("https://")) {
    // A depot phone on mobile data, typing a one-time code. Plain HTTP is a
    // session anybody on the path can take.
    fail("PUBLIC_APP_ORIGIN", "must be https in a pilot environment");
  }

  const rawPort = present(env, "PORT") ?? "3000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    fail("PORT", "must be an integer between 1 and 65535");
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  const auth: AuthConfig = {
    issuer: issuer!,
    audience: present(env, "SUPABASE_JWT_AUDIENCE") ?? "authenticated",
    ...(jwksUrl !== null ? { jwksUrl } : { jwtSecret: jwtSecret! }),
  };

  return {
    ok: true,
    config: { appEnv, databaseUrl: databaseUrl!, port, auth, publicAppOrigin },
  };
}

/**
 * A summary safe to print, log and paste into a support message.
 *
 * Never a value that was read. The database host is derived by dropping
 * everything before `@`, so credentials in the connection string cannot travel
 * with it; the issuer is reported as its origin.
 */
export function describeConfig(config: ServerConfig): readonly string[] {
  const databaseHost = (() => {
    try {
      const parsed = new URL(config.databaseUrl);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return "(unparseable)";
    }
  })();

  return [
    `app env:        ${config.appEnv}`,
    `port:           ${config.port}`,
    `database:       ${databaseHost}`,
    `token issuer:   ${config.auth.issuer}`,
    `token audience: ${config.auth.audience}`,
    `verification:   ${"jwksUrl" in config.auth ? "JWKS (asymmetric)" : "HS256 shared secret"}`,
    `public origin:  ${config.publicAppOrigin ?? "(not set)"}`,
  ];
}
