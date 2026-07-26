import { z } from "zod";

/**
 * Cursor pagination, keyset style.
 *
 * A cursor is an opaque string carrying the **last row's sort value and id**.
 * Both, always: a sort value alone is not unique — two sales can share a
 * `transactionTime` to the millisecond, and a depot posting a morning's load
 * will produce exactly that — so a page boundary that knew only the timestamp
 * would either repeat rows or skip them.
 *
 * Offsets are not used. `OFFSET 200` re-reads two hundred rows to throw them
 * away, and it shifts under concurrent inserts: a sale posted while somebody is
 * paging pushes a row they have already seen onto the next page. Keyset paging
 * reads only what it returns and is stable under writes, which is the property
 * that matters when the list being paged is money.
 *
 * See docs/06-api-contracts/read-models.md.
 */

/**
 * Opaque to clients. The encoding is base64url JSON, and it is deliberately not
 * documented as such anywhere a client would read: a client that parses a cursor
 * has coupled itself to a sort key we intend to be free to change.
 */
export const cursorSchema = z.string().min(1).max(500).brand<"Cursor">();
export type Cursor = z.infer<typeof cursorSchema>;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/**
 * `limit` beyond the maximum is clamped rather than refused. A client asking for
 * too much has made a judgement error, not a business one, and failing the whole
 * read over it helps nobody.
 */
export const pageRequestSchema = z.object({
  cursor: cursorSchema.nullable().default(null),
  limit: z.int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PageRequest = z.infer<typeof pageRequestSchema>;

/**
 * `nextCursor` is null exactly when there is no further page.
 *
 * Note what is absent: a total count. Counting the whole set costs a scan the
 * page itself does not need, and every consumer so far wants "is there more",
 * which `nextCursor` already answers. If a screen genuinely needs a total it can
 * be added as a separate, explicitly-priced read.
 */
export function pageOf<TItem extends z.ZodTypeAny>(item: TItem) {
  return z.object({
    items: z.array(item),
    nextCursor: cursorSchema.nullable(),
  });
}

export type Page<TItem> = {
  readonly items: readonly TItem[];
  readonly nextCursor: Cursor | null;
};

/** The decoded form. Never crosses the API boundary. */
export type CursorPosition = {
  /** The last row's sort value, as a string: an ISO instant or a display name. */
  readonly sortValue: string;
  readonly id: string;
};

/**
 * base64url over UTF-8, written against `TextEncoder`/`btoa` rather than
 * `Buffer`. This package is imported by browser code (REPO_MAP): a `Buffer` here
 * would work in every test and fail in the first browser to load it.
 *
 * Vietnamese display names are a sort value, so the UTF-8 step is not optional —
 * `btoa("Cô Hoà")` throws.
 */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeCursor(position: CursorPosition): Cursor {
  return toBase64Url(JSON.stringify([position.sortValue, position.id])) as Cursor;
}

/**
 * Returns null for anything that does not decode. A malformed cursor is treated
 * as "start from the beginning" rather than as an error: cursors travel in URLs,
 * URLs get truncated and hand-edited, and a 500 on a bad one turns a cosmetic
 * problem into a broken screen.
 */
export function decodeCursor(cursor: Cursor | null): CursorPosition | null {
  if (cursor === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(cursor));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      return null;
    }
    return { sortValue: parsed[0], id: parsed[1] };
  } catch {
    return null;
  }
}
