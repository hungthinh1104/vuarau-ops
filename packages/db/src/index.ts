export * from "./client.ts";
export * from "./schema/index.ts";
export * from "./repositories/index.ts";
export * from "./repositories/row-mappers.ts";
export * from "./repositories/read-queries.ts";
export * from "./transaction/unit-of-work.ts";
export { runMigrations } from "./migrate.ts";
// Operator tooling: creating a depot and putting somebody in it. No command
// exists for either, and none should — see the file for why.
export * from "./provisioning.ts";
// Read-only inspection for `ops:pilot-readiness`. Nothing here writes.
export * from "./pilot-inspection.ts";
// Test-only helpers; exported so `apps/api` can run its integration suite against
// a real database without duplicating the setup.
export * from "./testing/db-test-context.ts";
export * from "./testing/expect-database-error.ts";
// Test-only consumers of this package occasionally need to model damaged legacy
// rows in a transaction. Re-export the Drizzle SQL tag rather than reaching
// through the workspace's dependency layout.
export { sql } from "drizzle-orm";
