ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'COST_OBSERVATION_CORRECTION_TARGET_ALREADY_CORRECTED' BEFORE 'COST_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'COST_OBSERVATION_CORRECTION_IDENTITY_MISMATCH' BEFORE 'COST_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECONCILIATION_OBSERVATION_CORRECTION_TARGET_ALREADY_CORRECTED' BEFORE 'RECONCILIATION_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECONCILIATION_OBSERVATION_CORRECTION_IDENTITY_MISMATCH' BEFORE 'RECONCILIATION_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEBT_OBSERVATION_CORRECTION_TARGET_ALREADY_CORRECTED' BEFORE 'DEBT_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEBT_OBSERVATION_CORRECTION_IDENTITY_MISMATCH' BEFORE 'DEBT_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_OBSERVATION_TARGET_ALREADY_CORRECTED' BEFORE 'SUPPLY_COMMITMENT_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_OBSERVATION_IDENTITY_MISMATCH' BEFORE 'SUPPLY_COMMITMENT_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_OBSERVATION_CORRECTION_TARGET_ALREADY_CORRECTED' BEFORE 'SUPPLIER_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_OBSERVATION_CORRECTION_IDENTITY_MISMATCH' BEFORE 'SUPPLIER_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEMAND_OBSERVATION_CORRECTION_TARGET_ALREADY_CORRECTED' BEFORE 'DEMAND_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEMAND_OBSERVATION_CORRECTION_IDENTITY_MISMATCH' BEFORE 'DEMAND_OBSERVATION_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_POLICY_EFFECTIVE_OVERLAP' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
DROP INDEX "cash_statement_matches_workspace_movement_uq";--> statement-breakpoint
DROP INDEX "cash_statement_matches_workspace_reference_uq";--> statement-breakpoint
CREATE INDEX "cash_statement_matches_workspace_movement_idx" ON "cash_statement_matches" USING btree ("workspace_id","cash_movement_id");--> statement-breakpoint
CREATE INDEX "cash_statement_matches_workspace_reference_idx" ON "cash_statement_matches" USING btree ("workspace_id","external_reference");
