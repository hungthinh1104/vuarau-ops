import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptWorkspaceBackup, encryptWorkspaceBackup } from "./backup-encryption.ts";

describe("Encrypted backup handling", () => {
  const key = randomBytes(32).toString("base64");
  const backup = JSON.stringify({
    format: "WorkspaceBackupV1",
    customerNote: "sensitive transaction body",
  });

  it("round-trips a backup without exposing plaintext in the envelope", () => {
    const encrypted = encryptWorkspaceBackup(backup, key);
    expect(JSON.stringify(encrypted)).not.toContain("customerNote");
    expect(JSON.stringify(encrypted)).not.toContain("sensitive");
    expect(decryptWorkspaceBackup(encrypted, key)).toBe(backup);
  });

  it("fails closed after ciphertext tampering or with the wrong key", () => {
    const encrypted = encryptWorkspaceBackup(backup, key);
    const tampered = {
      ...encrypted,
      ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA`,
    };
    expect(() => decryptWorkspaceBackup(tampered, key)).toThrow();
    expect(() => decryptWorkspaceBackup(encrypted, randomBytes(32).toString("base64"))).toThrow();
  });

  it("refuses a malformed key before producing an envelope", () => {
    expect(() => encryptWorkspaceBackup(backup, "not-a-32-byte-key")).toThrow(
      "BACKUP_ENCRYPTION_KEY",
    );
  });
});
