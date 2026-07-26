import { pgEnum } from "drizzle-orm/pg-core";
import {
  AUDIT_ACTIONS,
  AUDIT_AGGREGATE_TYPES,
  DOMAIN_REJECTION_CODES,
} from "@vuarau/domain-contracts";

/**
 * Kept apart from the other enums so that the audit table's vocabulary can grow
 * without a migration touching the money tables' enums.
 *
 * `rejection_code` is an enum of the whole catalogue: a code that reaches the
 * audit log must be one the contract knows, or the insert fails loudly rather
 * than storing a string nobody can interpret later.
 */
export const auditAggregateTypeEnum = pgEnum("audit_aggregate_type", AUDIT_AGGREGATE_TYPES);
export const auditActionEnum = pgEnum("audit_action", AUDIT_ACTIONS);
export const rejectionCodeEnum = pgEnum("domain_rejection_code", DOMAIN_REJECTION_CODES);
