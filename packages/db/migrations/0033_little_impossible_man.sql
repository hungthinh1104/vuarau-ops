ALTER TABLE "sale_voids" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_voids" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;