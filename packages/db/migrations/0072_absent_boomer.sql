ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_PROFILE_QUALITY_GRADE_MODE_LOCKED' BEFORE 'WORKSPACE_PROFILE_UNCHANGED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OBSERVATION_FACT_NOT_ALLOWED' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'OBSERVATION_FACT_NEGATIVE' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
CREATE TABLE "workspace_change_feed" (
	"command_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"revision" bigint NOT NULL,
	"command_type" text NOT NULL,
	"topics" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workspace_change_feed_workspace_revision_unique" UNIQUE("workspace_id","revision")
);
--> statement-breakpoint
ALTER TABLE "command_receipts" ADD COLUMN "revision" bigint;--> statement-breakpoint
ALTER TABLE "workspace_change_feed" ADD CONSTRAINT "workspace_change_feed_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_change_feed_workspace_revision_idx" ON "workspace_change_feed" USING btree ("workspace_id","revision");