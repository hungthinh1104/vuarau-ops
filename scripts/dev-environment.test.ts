import assert from "node:assert/strict";
import { test } from "node:test";
import { developmentChildEnvironment } from "./dev-environment.ts";

test("development child processes never inherit elevated Supabase keys", () => {
  const childEnvironment = developmentChildEnvironment({
    DATABASE_URL: "postgres://localhost/vuarau_dev",
    SUPABASE_SECRET_KEY: "must-not-leak",
    SUPABASE_SERVICE_ROLE_KEY: "must-not-leak-either",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  });

  assert.deepEqual(childEnvironment, {
    DATABASE_URL: "postgres://localhost/vuarau_dev",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  });
});

test("development child environment does not mutate the parent credentials", () => {
  const parentEnvironment = {
    SUPABASE_SECRET_KEY: "keep-in-parent-for-fail-closed-check",
  };

  developmentChildEnvironment(parentEnvironment);

  assert.equal(parentEnvironment.SUPABASE_SECRET_KEY, "keep-in-parent-for-fail-closed-check");
});
