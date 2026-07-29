import type { PgTransaction } from "drizzle-orm/pg-core";

export type Tx = PgTransaction<never, never, never>;
export type IdMinter = { newId(): string };
