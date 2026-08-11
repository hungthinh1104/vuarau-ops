DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "delivery_return_lines" AS return_line
    JOIN "delivery_returns" AS delivery_return ON delivery_return.id = return_line.return_id
    JOIN "delivery_lines" AS delivery_line ON delivery_line.id = return_line.delivery_line_id
    WHERE delivery_return.workspace_id IS DISTINCT FROM delivery_line.workspace_id
  ) THEN
    RAISE EXCEPTION
      'delivery_return_lines contains a cross-workspace return or delivery-line reference';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "delivery_return_lines" DROP CONSTRAINT "delivery_return_lines_delivery_line_id_delivery_lines_id_fk";
--> statement-breakpoint
ALTER TABLE "delivery_return_lines" DROP CONSTRAINT "delivery_return_lines_return_fk";
--> statement-breakpoint
ALTER TABLE "delivery_return_lines" DROP CONSTRAINT "delivery_return_lines_return_id_delivery_line_id_pk";
--> statement-breakpoint
ALTER TABLE "delivery_return_lines" ADD COLUMN "workspace_id" uuid;
--> statement-breakpoint
UPDATE "delivery_return_lines" AS return_line
SET "workspace_id" = delivery_return.workspace_id
FROM "delivery_returns" AS delivery_return
WHERE delivery_return.id = return_line.return_id;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "delivery_return_lines" WHERE "workspace_id" IS NULL) THEN
    RAISE EXCEPTION 'delivery_return_lines contains an orphan return reference';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "delivery_return_lines" ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "delivery_return_lines"
  ADD CONSTRAINT "delivery_return_lines_workspace_id_return_id_delivery_line_id_pk"
  PRIMARY KEY("workspace_id","return_id","delivery_line_id");
--> statement-breakpoint
ALTER TABLE "delivery_return_lines"
  ADD CONSTRAINT "delivery_return_lines_return_fk"
  FOREIGN KEY ("workspace_id","return_id")
  REFERENCES "public"."delivery_returns"("workspace_id","id")
  ON DELETE no action ON UPDATE no action;
