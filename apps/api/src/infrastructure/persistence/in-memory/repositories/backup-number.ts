export function backupInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Backup integer is not exactly representable: ${field}`);
  }
  return value;
}
