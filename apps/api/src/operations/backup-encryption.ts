import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const AAD = Buffer.from("vuarau-workspace-backup:v1", "utf8");

export type EncryptedBackupV1 = {
  readonly format: "EncryptedWorkspaceBackupV1";
  readonly algorithm: "aes-256-gcm";
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
};

function decodeKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function encryptWorkspaceBackup(plaintext: string, encodedKey: string): EncryptedBackupV1 {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    format: "EncryptedWorkspaceBackupV1",
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptWorkspaceBackup(envelope: EncryptedBackupV1, encodedKey: string): string {
  if (envelope.format !== "EncryptedWorkspaceBackupV1" || envelope.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted backup envelope.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeKey(encodedKey),
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
