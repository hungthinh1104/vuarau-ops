import { seed } from "@vuarau/db/seeds";

/**
 * Migrates and seeds the database the API process will serve, once, before any
 * spec runs.
 *
 * `seed()` runs migrations first and is idempotent (`onConflictDoNothing`), so
 * repeating it against an existing database is safe — which matters because the
 * usual local loop is "run the suite again against the same container".
 *
 * It does **not** truncate. Every spec creates its own customer, and asserts only
 * within it; that is the same workspace isolation the product depends on,
 * exercised for free. A `TRUNCATE` here would also make two developers running
 * the suite against one shared database delete each other's data mid-run.
 */
export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    // Playwright's config skips the whole project in this case; this is the
    // second line of defence, and it says why rather than failing obscurely.
    throw new Error(
      "DATABASE_URL is not set. The end-to-end suite runs against a real database " +
        "on purpose — see docs/00-product/validation-plan.md.",
    );
  }

  await seed(databaseUrl);
}
