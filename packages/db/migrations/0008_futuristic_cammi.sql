ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_POSTING_ENTRY_MISSING' BEFORE 'SALE_NOT_POSTED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_REPLACEMENT_NOT_VOIDED' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_REPLACEMENT_ALREADY_EXISTS' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_REPLACEMENT_ACTOR_MISMATCH' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_REPLACEMENT_CUSTOMER_UNCHANGED' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_REPLACEMENT_CURRENCY_MISMATCH' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
DROP INDEX "sales_replaces_idx";--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_replaces_unique" UNIQUE("replaces_sale_id");