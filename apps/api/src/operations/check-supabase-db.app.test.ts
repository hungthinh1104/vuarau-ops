import { describe, expect, it } from "vitest";
import { inspectDatabaseTarget } from "./check-supabase-db.ts";

describe("Supabase database operator boundary", () => {
  it("recognises direct and pooler Supabase hosts without retaining credentials", () => {
    expect(
      inspectDatabaseTarget(
        "postgresql://user:secret@db.project.supabase.co:5432/postgres?sslmode=require",
      ),
    ).toEqual({
      host: "db.project.supabase.co",
      database: "postgres",
      isSupabase: true,
      isLocal: false,
      usesTls: true,
    });
    expect(
      inspectDatabaseTarget(
        "postgres://user:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=verify-full",
      )?.isSupabase,
    ).toBe(true);
  });

  it("flags the local development database and insecure transport", () => {
    expect(
      inspectDatabaseTarget("postgres://postgres:postgres@localhost:55432/vuarau_dev"),
    ).toEqual({
      host: "localhost",
      database: "vuarau_dev",
      isSupabase: false,
      isLocal: true,
      usesTls: false,
    });
  });

  it("does not expose malformed connection strings as a target", () => {
    expect(inspectDatabaseTarget("mysql://user:secret@host/database")).toBeNull();
    expect(inspectDatabaseTarget("not-a-database-url")).toBeNull();
  });
});
