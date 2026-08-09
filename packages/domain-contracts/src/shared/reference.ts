/**
 * Stable human references for operational records.
 *
 * The UUID remains the route and persistence identity. This compact reference
 * is presentation-only and must not be used as a foreign key or business key.
 */
export const RECORD_REFERENCE_PREFIX = {
  sale: "BH",
  purchase: "MH",
  delivery: "GH",
  customerOrder: "DH",
  payment: "TT",
  receipt: "NK",
} as const;

export type RecordReferenceKind = keyof typeof RECORD_REFERENCE_PREFIX;

export function recordDisplayReference(kind: RecordReferenceKind, id: string): string {
  return `${RECORD_REFERENCE_PREFIX[kind]}-${id.slice(0, 8).toUpperCase()}`;
}
