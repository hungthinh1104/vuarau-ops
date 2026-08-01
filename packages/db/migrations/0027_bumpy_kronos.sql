CREATE TYPE "public"."intake_mode" AS ENUM('direct_receipt', 'inspected_arrival');--> statement-breakpoint
CREATE TYPE "public"."quality_disposition_outcome" AS ENUM('accepted', 'quarantined', 'rejected', 'disposed');--> statement-breakpoint
CREATE TYPE "public"."quality_disposition_source_type" AS ENUM('arrival_line', 'quarantine_allocation');--> statement-breakpoint
CREATE TYPE "public"."quality_issue_category" AS ENUM('condition', 'defect');--> statement-breakpoint
CREATE TYPE "public"."quality_severity" AS ENUM('minor', 'moderate', 'severe');--> statement-breakpoint
CREATE TYPE "public"."weighing_mode" AS ENUM('quantity_only', 'gross_tare_net');--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_source_type" ADD VALUE 'quality_disposition';--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_source_type" ADD VALUE 'quality_disposition_reversal';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_issue_code.created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_issue_code.updated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_issue_code.deactivated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_issue_code.reactivated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'goods_arrival.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'goods_arrival.reversed';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_inspection.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_inspection.reversed';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_disposition.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_disposition.reversed';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'quality_issue_code';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'goods_arrival';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'quality_inspection';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'quality_disposition';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_ISSUE_CODE_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_ISSUE_CODE_INACTIVE' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_ISSUE_CODE_VERSION_CONFLICT' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_ISSUE_CODE_ALREADY_ACTIVE' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_ISSUE_CODE_ALREADY_INACTIVE' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'GOODS_ARRIVAL_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'GOODS_ARRIVAL_ALREADY_REVERSED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'GOODS_ARRIVAL_HAS_DOWNSTREAM_FACTS' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'GOODS_ARRIVAL_LINE_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'GOODS_ARRIVAL_PURCHASE_MISMATCH' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WEIGHING_REQUIRED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WEIGHING_NOT_USED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WEIGHING_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_INSPECTION_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_INSPECTION_ALREADY_REVERSED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_INSPECTION_QUANTITY_EXCEEDS_ARRIVAL' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_INSPECTION_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_INSPECTION_HAS_DOWNSTREAM_FACTS' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_DISPOSITION_SOURCE_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_DISPOSITION_SOURCE_REVERSED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_DISPOSITION_QUANTITY_EXCEEDS_REMAINING' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_DISPOSITION_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_DISPOSITION_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_DISPOSITION_ALREADY_REVERSED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_DISPOSITION_HAS_DOWNSTREAM_FACTS' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
CREATE TABLE "goods_arrival_lines" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"arrival_id" uuid NOT NULL,
	"purchase_id" uuid,
	"purchase_line_id" uuid,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"arrived_value_scaled" integer NOT NULL,
	"arrived_unit" "unit" NOT NULL,
	"container_count" integer,
	"gross_weight_value_scaled" integer,
	"tare_weight_value_scaled" integer,
	"net_weight_value_scaled" integer,
	"weight_unit" "unit",
	"supplier_lot_code" text,
	"note" text,
	CONSTRAINT "goods_arrival_lines_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "goods_arrival_lines_purchase_link_ck" CHECK (("goods_arrival_lines"."purchase_id" is null and "goods_arrival_lines"."purchase_line_id" is null)
        or ("goods_arrival_lines"."purchase_id" is not null and "goods_arrival_lines"."purchase_line_id" is not null)),
	CONSTRAINT "goods_arrival_lines_quantity_ck" CHECK ("goods_arrival_lines"."arrived_value_scaled" > 0),
	CONSTRAINT "goods_arrival_lines_weighing_ck" CHECK ((
        "goods_arrival_lines"."gross_weight_value_scaled" is null and
        "goods_arrival_lines"."tare_weight_value_scaled" is null and
        "goods_arrival_lines"."net_weight_value_scaled" is null and
        "goods_arrival_lines"."weight_unit" is null
      ) or (
        "goods_arrival_lines"."gross_weight_value_scaled" > 0 and
        "goods_arrival_lines"."tare_weight_value_scaled" >= 0 and
        "goods_arrival_lines"."net_weight_value_scaled" > 0 and
        "goods_arrival_lines"."gross_weight_value_scaled" - "goods_arrival_lines"."tare_weight_value_scaled" = "goods_arrival_lines"."net_weight_value_scaled" and
        "goods_arrival_lines"."weight_unit" in ('kg', 'gram', 'lang')
      )),
	CONSTRAINT "goods_arrival_lines_container_ck" CHECK ("goods_arrival_lines"."container_count" is null or "goods_arrival_lines"."container_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "goods_arrival_reversals" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"arrival_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "goods_arrival_reversals_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "goods_arrivals" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_id" uuid,
	"vehicle_reference" text,
	"note" text,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "goods_arrivals_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "quality_disposition_allocations" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"disposition_id" uuid NOT NULL,
	"outcome" "quality_disposition_outcome" NOT NULL,
	"value_scaled" integer NOT NULL,
	"unit" "unit" NOT NULL,
	"quality_grade_id" uuid,
	"quality_grade_name" text,
	"note" text,
	CONSTRAINT "quality_disposition_allocations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "quality_disposition_allocations_quantity_ck" CHECK ("quality_disposition_allocations"."value_scaled" > 0),
	CONSTRAINT "quality_disposition_allocations_grade_ck" CHECK ((
        "quality_disposition_allocations"."outcome" = 'accepted' and
        (("quality_disposition_allocations"."quality_grade_id" is null and "quality_disposition_allocations"."quality_grade_name" is null) or
         ("quality_disposition_allocations"."quality_grade_id" is not null and "quality_disposition_allocations"."quality_grade_name" is not null))
      ) or (
        "quality_disposition_allocations"."outcome" <> 'accepted' and
        "quality_disposition_allocations"."quality_grade_id" is null and "quality_disposition_allocations"."quality_grade_name" is null
      ))
);
--> statement-breakpoint
CREATE TABLE "quality_disposition_reversals" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"disposition_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "quality_disposition_reversals_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "quality_dispositions" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_type" "quality_disposition_source_type" NOT NULL,
	"source_arrival_line_id" uuid,
	"source_quarantine_allocation_id" uuid,
	"note" text,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "quality_dispositions_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "quality_dispositions_source_ck" CHECK ((
        "quality_dispositions"."source_type" = 'arrival_line' and
        "quality_dispositions"."source_arrival_line_id" is not null and
        "quality_dispositions"."source_quarantine_allocation_id" is null
      ) or (
        "quality_dispositions"."source_type" = 'quarantine_allocation' and
        "quality_dispositions"."source_arrival_line_id" is null and
        "quality_dispositions"."source_quarantine_allocation_id" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "quality_inspection_issues" (
	"workspace_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"quality_issue_code_id" uuid NOT NULL,
	"quality_issue_code" text NOT NULL,
	"quality_issue_name" text NOT NULL,
	"severity" "quality_severity" NOT NULL,
	"note" text,
	CONSTRAINT "quality_inspection_issues_workspace_id_inspection_id_quality_issue_code_id_pk" PRIMARY KEY("workspace_id","inspection_id","quality_issue_code_id")
);
--> statement-breakpoint
CREATE TABLE "quality_inspection_reversals" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "quality_inspection_reversals_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "quality_inspections" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"arrival_line_id" uuid NOT NULL,
	"inspected_value_scaled" integer NOT NULL,
	"inspected_unit" "unit" NOT NULL,
	"note" text,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "quality_inspections_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "quality_inspections_quantity_ck" CHECK ("quality_inspections"."inspected_value_scaled" > 0)
);
--> statement-breakpoint
CREATE TABLE "quality_issue_codes" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"category" "quality_issue_category" NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quality_issue_codes_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "quality_issue_codes_version_ck" CHECK ("quality_issue_codes"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "workspace_operational_profiles" ADD COLUMN "intake_mode" "intake_mode" DEFAULT 'direct_receipt' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_operational_profiles" ADD COLUMN "weighing_mode" "weighing_mode" DEFAULT 'quantity_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_arrival_lines" ADD CONSTRAINT "goods_arrival_lines_workspace_arrival_fk" FOREIGN KEY ("workspace_id","arrival_id") REFERENCES "public"."goods_arrivals"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrival_lines" ADD CONSTRAINT "goods_arrival_lines_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrival_lines" ADD CONSTRAINT "goods_arrival_lines_purchase_line_fk" FOREIGN KEY ("purchase_id","purchase_line_id") REFERENCES "public"."purchase_lines"("purchase_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrival_reversals" ADD CONSTRAINT "goods_arrival_reversals_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrival_reversals" ADD CONSTRAINT "goods_arrival_reversals_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrival_reversals" ADD CONSTRAINT "goods_arrival_reversals_workspace_arrival_fk" FOREIGN KEY ("workspace_id","arrival_id") REFERENCES "public"."goods_arrivals"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrivals" ADD CONSTRAINT "goods_arrivals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrivals" ADD CONSTRAINT "goods_arrivals_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrivals" ADD CONSTRAINT "goods_arrivals_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrivals" ADD CONSTRAINT "goods_arrivals_workspace_supplier_fk" FOREIGN KEY ("workspace_id","supplier_id") REFERENCES "public"."suppliers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrivals" ADD CONSTRAINT "goods_arrivals_workspace_purchase_fk" FOREIGN KEY ("workspace_id","purchase_id") REFERENCES "public"."purchases"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_disposition_allocations" ADD CONSTRAINT "quality_disposition_allocations_workspace_disposition_fk" FOREIGN KEY ("workspace_id","disposition_id") REFERENCES "public"."quality_dispositions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_disposition_allocations" ADD CONSTRAINT "quality_disposition_allocations_workspace_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_disposition_reversals" ADD CONSTRAINT "quality_disposition_reversals_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_disposition_reversals" ADD CONSTRAINT "quality_disposition_reversals_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_disposition_reversals" ADD CONSTRAINT "quality_disposition_reversals_workspace_disposition_fk" FOREIGN KEY ("workspace_id","disposition_id") REFERENCES "public"."quality_dispositions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_dispositions" ADD CONSTRAINT "quality_dispositions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_dispositions" ADD CONSTRAINT "quality_dispositions_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_dispositions" ADD CONSTRAINT "quality_dispositions_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_dispositions" ADD CONSTRAINT "quality_dispositions_workspace_arrival_line_fk" FOREIGN KEY ("workspace_id","source_arrival_line_id") REFERENCES "public"."goods_arrival_lines"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_issues" ADD CONSTRAINT "quality_inspection_issues_workspace_inspection_fk" FOREIGN KEY ("workspace_id","inspection_id") REFERENCES "public"."quality_inspections"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_issues" ADD CONSTRAINT "quality_inspection_issues_workspace_code_fk" FOREIGN KEY ("workspace_id","quality_issue_code_id") REFERENCES "public"."quality_issue_codes"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_reversals" ADD CONSTRAINT "quality_inspection_reversals_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_reversals" ADD CONSTRAINT "quality_inspection_reversals_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_reversals" ADD CONSTRAINT "quality_inspection_reversals_workspace_inspection_fk" FOREIGN KEY ("workspace_id","inspection_id") REFERENCES "public"."quality_inspections"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_workspace_arrival_line_fk" FOREIGN KEY ("workspace_id","arrival_line_id") REFERENCES "public"."goods_arrival_lines"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_issue_codes" ADD CONSTRAINT "quality_issue_codes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goods_arrival_reversals_arrival_uq" ON "goods_arrival_reversals" USING btree ("workspace_id","arrival_id");--> statement-breakpoint
CREATE INDEX "goods_arrivals_supplier_time_idx" ON "goods_arrivals" USING btree ("workspace_id","supplier_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_disposition_allocations_workspace_id_uq" ON "quality_disposition_allocations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_disposition_reversals_disposition_uq" ON "quality_disposition_reversals" USING btree ("workspace_id","disposition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_inspection_reversals_inspection_uq" ON "quality_inspection_reversals" USING btree ("workspace_id","inspection_id");--> statement-breakpoint
CREATE INDEX "quality_inspections_arrival_line_time_idx" ON "quality_inspections" USING btree ("workspace_id","arrival_line_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_issue_codes_workspace_code_uq" ON "quality_issue_codes" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE INDEX "quality_issue_codes_workspace_name_idx" ON "quality_issue_codes" USING btree ("workspace_id","display_name","id");--> statement-breakpoint
ALTER TABLE "workspace_operational_profiles" ADD CONSTRAINT "workspace_operational_profiles_intake_dependencies_ck" CHECK ("workspace_operational_profiles"."intake_mode" <> 'inspected_arrival'
        or ("workspace_operational_profiles"."purchasing_mode" <> 'disabled' and "workspace_operational_profiles"."inventory_mode" <> 'disabled'));--> statement-breakpoint
ALTER TABLE "workspace_operational_profiles" ADD CONSTRAINT "workspace_operational_profiles_weighing_dependencies_ck" CHECK ("workspace_operational_profiles"."weighing_mode" <> 'gross_tare_net'
        or "workspace_operational_profiles"."intake_mode" = 'inspected_arrival');
--> statement-breakpoint
ALTER TABLE "quality_dispositions"
  ADD CONSTRAINT "quality_dispositions_workspace_quarantine_allocation_fk"
  FOREIGN KEY ("workspace_id", "source_quarantine_allocation_id")
  REFERENCES "quality_disposition_allocations"("workspace_id", "id")
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE INDEX "goods_arrival_lines_workspace_arrival_idx"
  ON "goods_arrival_lines" USING btree ("workspace_id", "arrival_id", "id");
--> statement-breakpoint
CREATE INDEX "quality_dispositions_arrival_source_idx"
  ON "quality_dispositions" USING btree ("workspace_id", "source_arrival_line_id", "id")
  WHERE "source_type" = 'arrival_line';
--> statement-breakpoint
CREATE INDEX "quality_dispositions_quarantine_source_idx"
  ON "quality_dispositions" USING btree ("workspace_id", "source_quarantine_allocation_id", "id")
  WHERE "source_type" = 'quarantine_allocation';
--> statement-breakpoint
CREATE INDEX "quality_disposition_allocations_disposition_idx"
  ON "quality_disposition_allocations" USING btree ("workspace_id", "disposition_id", "id");
--> statement-breakpoint
CREATE TRIGGER goods_arrivals_append_only
  BEFORE UPDATE OR DELETE ON goods_arrivals
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER goods_arrival_lines_append_only
  BEFORE UPDATE OR DELETE ON goods_arrival_lines
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER goods_arrival_reversals_append_only
  BEFORE UPDATE OR DELETE ON goods_arrival_reversals
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER quality_inspections_append_only
  BEFORE UPDATE OR DELETE ON quality_inspections
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER quality_inspection_issues_append_only
  BEFORE UPDATE OR DELETE ON quality_inspection_issues
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER quality_inspection_reversals_append_only
  BEFORE UPDATE OR DELETE ON quality_inspection_reversals
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER quality_dispositions_append_only
  BEFORE UPDATE OR DELETE ON quality_dispositions
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER quality_disposition_allocations_append_only
  BEFORE UPDATE OR DELETE ON quality_disposition_allocations
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER quality_disposition_reversals_append_only
  BEFORE UPDATE OR DELETE ON quality_disposition_reversals
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION vuarau_forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be deleted; deactivate the master record instead.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER quality_issue_codes_no_delete
  BEFORE DELETE ON quality_issue_codes
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_delete();
