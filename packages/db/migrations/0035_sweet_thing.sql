ALTER TABLE "purchase_receipt_reversals" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_arrival_reversals" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_arrivals" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_disposition_reversals" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_dispositions" ADD COLUMN "evidence_references" text[] DEFAULT '{}' NOT NULL;