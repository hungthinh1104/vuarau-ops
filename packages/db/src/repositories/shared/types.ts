import type { Database } from "../../client.ts";

export type Tx = Parameters<Parameters<Database["db"]["transaction"]>[0]>[0];
export type IdMinter = { newId(): string };
