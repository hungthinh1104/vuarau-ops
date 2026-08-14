CREATE TYPE "public"."delivery_return_settlement_case_kind" AS ENUM('decision', 'correction');--> statement-breakpoint
CREATE TYPE "public"."delivery_return_settlement_outcome" AS ENUM('goods_only');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'delivery_return_settlement.recorded' BEFORE 'document.generated';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'delivery_return_settlement' BEFORE 'document';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_RETURN_SETTLEMENT_CORRECTION_TARGET_REQUIRED' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_RETURN_SETTLEMENT_CORRECTION_TARGET_NOT_FOUND' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_RETURN_SETTLEMENT_CORRECTION_LINK_INVALID' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_RETURN_SETTLEMENT_CORRECTION_TARGET_ALREADY_CORRECTED' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_RETURN_SETTLEMENT_RETURN_MISMATCH' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_RETURN_SETTLEMENT_NOT_FOUND' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_RETURN_SETTLEMENT_ALREADY_RECORDED' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
CREATE TABLE "delivery_return_settlements" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"return_id" uuid NOT NULL,
	"case_kind" "delivery_return_settlement_case_kind" NOT NULL,
	"outcome" "delivery_return_settlement_outcome" NOT NULL,
	"reason" text NOT NULL,
	"related_settlement_id" uuid,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "delivery_return_settlements_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "delivery_return_settlements_case_link_ck" CHECK (("delivery_return_settlements"."case_kind" = 'correction' and "delivery_return_settlements"."related_settlement_id" is not null)
        or ("delivery_return_settlements"."case_kind" = 'decision' and "delivery_return_settlements"."related_settlement_id" is null))
);
--> statement-breakpoint
ALTER TABLE "delivery_return_settlements" ADD CONSTRAINT "delivery_return_settlements_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_return_settlements" ADD CONSTRAINT "delivery_return_settlements_workspace_return_fk" FOREIGN KEY ("workspace_id","return_id") REFERENCES "public"."delivery_returns"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_return_settlements" ADD CONSTRAINT "delivery_return_settlements_workspace_related_fk" FOREIGN KEY ("workspace_id","related_settlement_id") REFERENCES "public"."delivery_return_settlements"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_return_settlements_workspace_return_time_idx" ON "delivery_return_settlements" USING btree ("workspace_id","return_id","recorded_at","id");