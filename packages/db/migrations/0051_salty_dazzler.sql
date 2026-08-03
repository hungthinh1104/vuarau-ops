ALTER TYPE "public"."audit_action" ADD VALUE 'operational_close.recorded' BEFORE 'quality_issue_code.created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'operational_close.reopened' BEFORE 'quality_issue_code.created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cash_statement_match.recorded' BEFORE 'quality_issue_code.created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cash_statement_match.reversed' BEFORE 'quality_issue_code.created';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'operational_close' BEFORE 'quality_issue_code';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'cash_statement_match' BEFORE 'quality_issue_code';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_MOVEMENT_NOT_FOUND' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_STATEMENT_ACCOUNT_MISMATCH' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_STATEMENT_AMOUNT_MISMATCH' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_STATEMENT_SOURCE_NOT_ALLOWED' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_STATEMENT_MATCH_ALREADY_EXISTS' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_STATEMENT_MATCH_NOT_FOUND' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_STATEMENT_MATCH_VERSION_CONFLICT' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_STATEMENT_MATCH_ALREADY_REVERSED' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_STATEMENT_REVERSE_UNAVAILABLE' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_POLICY_UNAVAILABLE' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_NOT_FOUND' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_ALREADY_EXISTS' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_VERSION_CONFLICT' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_STATE_INVALID' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_OBSERVATIONS_INVALID' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_REOPEN_UNAVAILABLE' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OPERATIONAL_CLOSE_ALREADY_REOPENED' BEFORE 'QUALITY_ISSUE_CODE_NOT_FOUND';--> statement-breakpoint
CREATE TABLE "cash_statement_match_reversals" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cash_statement_match_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"evidence_references" text[] NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "cash_statement_match_reversals_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "cash_statement_match_reversals_evidence_ck" CHECK (cardinality("cash_statement_match_reversals"."evidence_references") > 0)
);
--> statement-breakpoint
CREATE TABLE "cash_statement_matches" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cash_account_id" uuid NOT NULL,
	"cash_movement_id" uuid NOT NULL,
	"external_reference" text NOT NULL,
	"statement_at" timestamp with time zone NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"source_type" "cash_movement_source_type" NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"evidence_references" text[] NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "cash_statement_matches_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "cash_statement_matches_evidence_ck" CHECK (cardinality("cash_statement_matches"."evidence_references") > 0)
);
--> statement-breakpoint
CREATE TABLE "operational_close_reopens" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operational_close_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"evidence_references" text[] NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "operational_close_reopens_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "operational_close_reopens_evidence_ck" CHECK (cardinality("operational_close_reopens"."evidence_references") > 0)
);
--> statement-breakpoint
CREATE TABLE "operational_closes" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"observation_ids" uuid[] NOT NULL,
	"evidence_references" text[] NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "operational_closes_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "operational_closes_period_ck" CHECK ("operational_closes"."period_end" > "operational_closes"."period_start"),
	CONSTRAINT "operational_closes_observations_ck" CHECK (cardinality("operational_closes"."observation_ids") > 0),
	CONSTRAINT "operational_closes_evidence_ck" CHECK (cardinality("operational_closes"."evidence_references") > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_statement_match_reversals" ADD CONSTRAINT "cash_statement_match_reversals_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_statement_match_reversals" ADD CONSTRAINT "cash_statement_match_reversals_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_statement_match_reversals" ADD CONSTRAINT "cash_statement_match_reversals_workspace_match_fk" FOREIGN KEY ("workspace_id","cash_statement_match_id") REFERENCES "public"."cash_statement_matches"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_statement_matches" ADD CONSTRAINT "cash_statement_matches_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_statement_matches" ADD CONSTRAINT "cash_statement_matches_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_statement_matches" ADD CONSTRAINT "cash_statement_matches_workspace_account_fk" FOREIGN KEY ("workspace_id","cash_account_id") REFERENCES "public"."cash_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_statement_matches" ADD CONSTRAINT "cash_statement_matches_workspace_movement_fk" FOREIGN KEY ("workspace_id","cash_movement_id") REFERENCES "public"."cash_movements"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_statement_matches" ADD CONSTRAINT "cash_statement_matches_workspace_policy_fk" FOREIGN KEY ("workspace_id","policy_version_id") REFERENCES "public"."workspace_policies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_close_reopens" ADD CONSTRAINT "operational_close_reopens_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_close_reopens" ADD CONSTRAINT "operational_close_reopens_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_close_reopens" ADD CONSTRAINT "operational_close_reopens_workspace_close_fk" FOREIGN KEY ("workspace_id","operational_close_id") REFERENCES "public"."operational_closes"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_closes" ADD CONSTRAINT "operational_closes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_closes" ADD CONSTRAINT "operational_closes_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_closes" ADD CONSTRAINT "operational_closes_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_closes" ADD CONSTRAINT "operational_closes_workspace_policy_fk" FOREIGN KEY ("workspace_id","policy_version_id") REFERENCES "public"."workspace_policies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_statement_match_reversals_match_uq" ON "cash_statement_match_reversals" USING btree ("workspace_id","cash_statement_match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_statement_matches_workspace_movement_uq" ON "cash_statement_matches" USING btree ("workspace_id","cash_movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_statement_matches_workspace_reference_uq" ON "cash_statement_matches" USING btree ("workspace_id","external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_close_reopens_close_uq" ON "operational_close_reopens" USING btree ("workspace_id","operational_close_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_closes_workspace_date_uq" ON "operational_closes" USING btree ("workspace_id","business_date");--> statement-breakpoint
CREATE INDEX "operational_closes_workspace_time_idx" ON "operational_closes" USING btree ("workspace_id","business_date","recorded_at","id");