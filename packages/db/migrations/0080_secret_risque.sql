ALTER TYPE "public"."audit_action" ADD VALUE 'operational_close.exception_acknowledged' BEFORE 'cash_statement_match.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'operational_close_exception_acknowledgement' BEFORE 'cash_statement_match';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_EXCEPTION_ACKNOWLEDGEMENT_NOT_ALLOWED' BEFORE 'OPERATIONAL_DAY_CLOSED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_EXCEPTION_ACKNOWLEDGEMENT_SOURCE_NOT_FOUND' BEFORE 'OPERATIONAL_DAY_CLOSED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_EXCEPTION_ACKNOWLEDGEMENT_ALREADY_RECORDED' BEFORE 'OPERATIONAL_DAY_CLOSED';--> statement-breakpoint
CREATE TABLE "operational_close_exception_acknowledgements" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"exception_kind" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_reference" text NOT NULL,
	"source_id" text NOT NULL,
	"evidence_references" text[] NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "operational_close_exception_acknowledgements_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "operational_close_exception_ack_kind_ck" CHECK ("operational_close_exception_acknowledgements"."exception_kind" in ('unallocated_payment', 'fulfilment_remainder_unresolved', 'return_settlement_unresolved', 'reconciliation_variance')),
	CONSTRAINT "operational_close_exception_ack_source_kind_ck" CHECK ("operational_close_exception_acknowledgements"."source_kind" in ('sale', 'purchase', 'payment', 'delivery', 'workspace')),
	CONSTRAINT "operational_close_exception_ack_evidence_ck" CHECK (cardinality("operational_close_exception_acknowledgements"."evidence_references") > 0)
);
--> statement-breakpoint
ALTER TABLE "operational_close_exception_acknowledgements" ADD CONSTRAINT "operational_close_exception_acknowledgements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_close_exception_acknowledgements" ADD CONSTRAINT "operational_close_exception_acknowledgements_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_close_exception_acknowledgements" ADD CONSTRAINT "operational_close_exception_ack_workspace_policy_fk" FOREIGN KEY ("workspace_id","policy_version_id") REFERENCES "public"."workspace_policies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_close_exception_acknowledgements" ADD CONSTRAINT "operational_close_exception_ack_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operational_close_exception_ack_identity_uq" ON "operational_close_exception_acknowledgements" USING btree ("workspace_id","business_date","exception_kind","source_kind","source_id");--> statement-breakpoint
CREATE INDEX "operational_close_exception_ack_date_idx" ON "operational_close_exception_acknowledgements" USING btree ("workspace_id","business_date","recorded_at");