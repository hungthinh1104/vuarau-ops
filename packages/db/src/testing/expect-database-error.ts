/**
 * Drizzle wraps a driver error in a `Failed query: …` Error and hangs the real
 * one off `cause`. Asserting on the outer message would pass for *any* failure —
 * including a typo in the SQL — so these helpers walk the chain and match the
 * message Postgres actually produced.
 */
export function databaseErrorMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages;
}

export async function captureDatabaseError(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    return databaseErrorMessages(error).join(" | ");
  }
  throw new Error("Expected the database to reject this statement, but it succeeded.");
}
