import { describe, expect, it } from "vitest";
import { describeConfig, publishedSecrets, readServerConfig, type Env } from "./config.ts";

/**
 * BR-OPS-002 / TC-OPS-001 — the server refuses to start on a configuration it
 * cannot trust.
 *
 * Every rule here exists because the alternative is discovering it from a request:
 * a depot worker at a loading bay, holding a phone, told that something went
 * wrong. A startup that fails naming the variable costs a deploy; a request that
 * fails costs the session.
 */
describe("BR-OPS-002 / TC-OPS-001 — reading the server configuration", () => {
  const development: Env = {
    DATABASE_URL: "postgres://user:pw@db.internal:5432/vuarau",
    SUPABASE_JWT_ISSUER: "http://localhost:54321/auth/v1",
    SUPABASE_JWT_SECRET: "local-development-only",
  };

  const pilot: Env = {
    APP_ENV: "pilot",
    DATABASE_URL: "postgres://user:pw@db.internal:5432/vuarau",
    SUPABASE_JWT_ISSUER: "https://project.supabase.co/auth/v1",
    SUPABASE_JWKS_URL: "https://project.supabase.co/auth/v1/.well-known/jwks.json",
    PUBLIC_APP_ORIGIN: "https://pilot.example.vn",
  };

  const problemsFor = (env: Env): readonly string[] => {
    const result = readServerConfig(env);
    return result.ok ? [] : result.problems.map((problem) => problem.variable);
  };

  it("accepts a development environment on a shared secret", () => {
    const result = readServerConfig(development);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.appEnv).toBe("development");
    expect(result.config.port).toBe(3000);
  });

  it("rejects unsafe request and rate-limit values together", () => {
    expect(
      problemsFor({
        ...development,
        MAX_REQUEST_BYTES: "0",
        RATE_LIMIT_WINDOW_MS: "-1",
        RATE_LIMIT_AUTHENTICATED: "many",
        RATE_LIMIT_PUBLIC: "1.5",
      }),
    ).toEqual(
      expect.arrayContaining([
        "MAX_REQUEST_BYTES",
        "RATE_LIMIT_WINDOW_MS",
        "RATE_LIMIT_AUTHENTICATED",
        "RATE_LIMIT_PUBLIC",
      ]),
    );
  });

  it("accepts a pilot environment on JWKS", () => {
    expect(readServerConfig(pilot).ok).toBe(true);
  });

  it("names every missing variable at once, not the first one", () => {
    // A deploy loop that fixes one variable per attempt is a deploy loop that
    // takes an afternoon.
    expect(problemsFor({})).toEqual(
      expect.arrayContaining(["DATABASE_URL", "SUPABASE_JWT_ISSUER", "SUPABASE_JWKS_URL"]),
    );
  });

  it("refuses HS256 in a pilot environment", () => {
    // The difference between the two environments, and the reason they exist. A
    // signing secret in an environment variable is a secret that can mint a token
    // for any actor, and anything able to read the environment holds it.
    const { SUPABASE_JWKS_URL: _unused, ...withoutJwks } = pilot;
    expect(problemsFor({ ...withoutJwks, SUPABASE_JWT_SECRET: "anything" })).toContain(
      "SUPABASE_JWT_SECRET",
    );
  });

  it("refuses the Playwright authentication bridge in a pilot environment", () => {
    expect(problemsFor({ ...pilot, NEXT_PUBLIC_E2E_AUTH_BRIDGE: "1" })).toContain(
      "NEXT_PUBLIC_E2E_AUTH_BRIDGE",
    );
  });

  it("refuses both verification methods at once, rather than picking one", () => {
    expect(problemsFor({ ...development, SUPABASE_JWKS_URL: "https://x/jwks.json" })).toContain(
      "SUPABASE_JWT_SECRET",
    );
  });

  it("requires https for the issuer and the public origin in a pilot", () => {
    expect(problemsFor({ ...pilot, SUPABASE_JWT_ISSUER: "http://project/auth/v1" })).toContain(
      "SUPABASE_JWT_ISSUER",
    );
    expect(problemsFor({ ...pilot, PUBLIC_APP_ORIGIN: "http://pilot.example.vn" })).toContain(
      "PUBLIC_APP_ORIGIN",
    );
    // A depot phone on mobile data typing a one-time code. Plain HTTP is a
    // session anybody on the path can take.
    const { PUBLIC_APP_ORIGIN: _missing, ...withoutOrigin } = pilot;
    expect(problemsFor(withoutOrigin)).toContain("PUBLIC_APP_ORIGIN");
  });

  it("does not impose the pilot rules on development", () => {
    // Otherwise the end-to-end suite, which has no Supabase project at all, could
    // not start the server it tests.
    expect(readServerConfig(development).ok).toBe(true);
  });

  it("refuses a database url that is not a postgres connection string", () => {
    expect(problemsFor({ ...development, DATABASE_URL: "mysql://x/y" })).toContain("DATABASE_URL");
  });

  it("refuses a port that is not a usable integer", () => {
    expect(problemsFor({ ...development, PORT: "not-a-port" })).toContain("PORT");
    expect(problemsFor({ ...development, PORT: "70000" })).toContain("PORT");
  });

  it("refuses an unknown APP_ENV rather than defaulting to the permissive one", () => {
    expect(problemsFor({ ...development, APP_ENV: "production" })).toContain("APP_ENV");
  });
});

/**
 * TC-OPS-002 — a secret must never be given a `NEXT_PUBLIC_` name.
 *
 * Next inlines those at build time, so the variable is not merely readable by the
 * browser; it is compiled into a bundle a phone downloads and a CDN caches. The
 * two that belong there are the project URL and the publishable anon key.
 */
describe("BR-OPS-002 / TC-OPS-002 — secrets that would be published", () => {
  it("refuses a secret-shaped NEXT_PUBLIC_ variable", () => {
    const found = publishedSecrets({
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE: "…",
      NEXT_PUBLIC_DATABASE_PASSWORD: "…",
    });
    expect(found.map((problem) => problem.variable)).toEqual([
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE",
      "NEXT_PUBLIC_DATABASE_PASSWORD",
    ]);
  });

  it("allows the two that are publishable by design", () => {
    expect(
      publishedSecrets({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable",
        NEXT_PUBLIC_API_ORIGIN: "https://pilot.example.vn",
      }),
    ).toEqual([]);
  });

  it("fails the whole configuration, not just a warning", () => {
    const result = readServerConfig({
      DATABASE_URL: "postgres://u:p@h/d",
      SUPABASE_JWT_ISSUER: "http://localhost/auth/v1",
      SUPABASE_JWT_SECRET: "x",
      NEXT_PUBLIC_JWT_SECRET: "definitely not",
    });
    expect(result.ok).toBe(false);
  });
});

/**
 * TC-OPS-003 — the configuration summary carries no value it read.
 *
 * `ops:check-env` output ends up in a deploy log, a support message, a screenshot.
 * A checker that echoed what it found would put a database password and a signing
 * secret into all three.
 */
describe("BR-OPS-001 / TC-OPS-003 — describing a configuration safely", () => {
  it("never prints a credential from the connection string or the secret", () => {
    const result = readServerConfig({
      DATABASE_URL: "postgres://depot_user:sup3r-s3cret@db.internal:5432/vuarau",
      SUPABASE_JWT_ISSUER: "http://localhost:54321/auth/v1",
      SUPABASE_JWT_SECRET: "hs256-signing-material",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const summary = describeConfig(result.config).join("\n");

    expect(summary).not.toContain("sup3r-s3cret");
    expect(summary).not.toContain("depot_user");
    expect(summary).not.toContain("hs256-signing-material");
    // Still useful: the host and database somebody has to check against.
    expect(summary).toContain("db.internal:5432/vuarau");
    expect(summary).toContain("HS256 shared secret");
  });
});
