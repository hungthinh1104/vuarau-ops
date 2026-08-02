CREATE TYPE "public"."price_rule_kind" AS ENUM('list', 'customer', 'override');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'price_rule.recorded' BEFORE 'quality_grade.created';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'price_rule' BEFORE 'quality_grade';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PRICING_RULE_INVALID' BEFORE 'SUPPLIER_NOT_FOUND';--> statement-breakpoint
CREATE UNIQUE INDEX "customers_workspace_id_id_uq" ON "customers" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE TABLE "price_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quality_grade_id" uuid,
	"customer_id" uuid,
	"unit" "unit" NOT NULL,
	"kind" "price_rule_kind" NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"minimum_quantity_scaled" bigint DEFAULT 0 NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"base_unit_price_minor" bigint NOT NULL,
	"discount_per_unit_minor" bigint NOT NULL,
	"fee_per_unit_minor" bigint NOT NULL,
	"final_unit_price_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"reason" text,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "price_rules_priority_ck" CHECK ("price_rules"."priority" >= 0),
	CONSTRAINT "price_rules_quantity_ck" CHECK ("price_rules"."minimum_quantity_scaled" >= 0),
	CONSTRAINT "price_rules_base_price_ck" CHECK ("price_rules"."base_unit_price_minor" >= 0),
	CONSTRAINT "price_rules_discount_ck" CHECK ("price_rules"."discount_per_unit_minor" >= 0),
	CONSTRAINT "price_rules_fee_ck" CHECK ("price_rules"."fee_per_unit_minor" >= 0),
	CONSTRAINT "price_rules_final_price_ck" CHECK ("price_rules"."final_unit_price_minor" >= 0),
	CONSTRAINT "price_rules_effective_period_ck" CHECK ("price_rules"."effective_to" is null or "price_rules"."effective_to" > "price_rules"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_workspace_quality_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_rules_workspace_id_id_uq" ON "price_rules" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "price_rules_resolution_idx" ON "price_rules" USING btree ("workspace_id","product_id","quality_grade_id","unit","effective_from");--> statement-breakpoint
CREATE INDEX "price_rules_customer_idx" ON "price_rules" USING btree ("workspace_id","customer_id","product_id","effective_from");--> statement-breakpoint
