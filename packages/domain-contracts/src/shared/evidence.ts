import { z } from "zod";

/**
 * External source references are attributable evidence, not business policy.
 * They may point to a paper sheet, device photo, bank slip or approved evidence
 * store. The command never interprets them as a money or goods effect.
 */
export const evidenceReferenceSchema = z.string().trim().min(1).max(1_000);
export const evidenceReferencesInputSchema = z.array(evidenceReferenceSchema).max(20).default([]);
export const evidenceReferencesDtoSchema = z.array(z.string());
export type EvidenceReferences = z.infer<typeof evidenceReferencesDtoSchema>;
