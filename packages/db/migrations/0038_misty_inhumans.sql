CREATE TYPE "public"."debt_observation_kind" AS ENUM('agreed_due_date', 'payment_term', 'promise_to_pay', 'collection_note', 'payment_reference', 'allocation_proposal', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'debt_observation.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'debt_observation';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEBT_OBSERVATION_CORRECTION_TARGET_REQUIRED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEBT_OBSERVATION_CORRECTION_TARGET_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEBT_OBSERVATION_CORRECTION_LINK_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEBT_OBSERVATION_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEBT_OBSERVATION_ALREADY_RECORDED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
CREATE TABLE "debt_observations" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "debt_observation_kind" NOT NULL,
	"case_kind" "cost_observation_case_kind" NOT NULL,
	"description" text NOT NULL,
	"participant_wording" text NOT NULL,
	"amount_minor" bigint,
	"amount_currency" "currency_code",
	"agreed_due_at" timestamp with time zone,
	"promise_to_pay_at" timestamp with time zone,
	"term_code" text,
	"term_text" text,
	"payment_reference" text,
	"allocation_proposal" text,
	"customer_id" uuid,
	"evidence_references" text[] NOT NULL,
	"related_observation_id" uuid,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "debt_observations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "debt_observations_amount_pair_ck" CHECK (("debt_observations"."amount_minor" is null and "debt_observations"."amount_currency" is null)
        or ("debt_observations"."amount_minor" is not null and "debt_observations"."amount_currency" is not null)),
	CONSTRAINT "debt_observations_correction_link_ck" CHECK (("debt_observations"."case_kind" = 'correction' and "debt_observations"."related_observation_id" is not null)
        or ("debt_observations"."case_kind" <> 'correction' and "debt_observations"."related_observation_id" is null))
);
--> statement-breakpoint
ALTER TABLE "debt_observations" ADD CONSTRAINT "debt_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_observations" ADD CONSTRAINT "debt_observations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_observations" ADD CONSTRAINT "debt_observations_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_observations" ADD CONSTRAINT "debt_observations_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_observations" ADD CONSTRAINT "debt_observations_workspace_related_fk" FOREIGN KEY ("workspace_id","related_observation_id") REFERENCES "public"."debt_observations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_observations_workspace_time_idx" ON "debt_observations" USING btree ("workspace_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "debt_observations_workspace_kind_idx" ON "debt_observations" USING btree ("workspace_id","kind","recorded_at","id");