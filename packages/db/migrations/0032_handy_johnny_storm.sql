ALTER TABLE "cash_adjustments" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_transfer_reversals" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_reversals" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;