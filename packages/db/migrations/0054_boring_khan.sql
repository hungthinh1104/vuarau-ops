DROP INDEX "operational_closes_workspace_date_uq";--> statement-breakpoint
ALTER TABLE "operational_closes" ADD COLUMN "supersedes_operational_close_id" uuid;--> statement-breakpoint
ALTER TABLE "operational_closes" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "operational_closes" ADD CONSTRAINT "operational_closes_workspace_supersedes_fk" FOREIGN KEY ("workspace_id","supersedes_operational_close_id") REFERENCES "public"."operational_closes"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operational_closes_workspace_date_idx" ON "operational_closes" USING btree ("workspace_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_closes_workspace_supersedes_uq" ON "operational_closes" USING btree ("workspace_id","supersedes_operational_close_id");--> statement-breakpoint
ALTER TABLE "operational_closes" ADD CONSTRAINT "operational_closes_version_ck" CHECK ("operational_closes"."version" > 0);