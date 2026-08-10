ALTER TABLE "goods_arrival_lines" ALTER COLUMN "arrived_value_scaled" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "goods_arrival_lines" ALTER COLUMN "gross_weight_value_scaled" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "goods_arrival_lines" ALTER COLUMN "tare_weight_value_scaled" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "goods_arrival_lines" ALTER COLUMN "net_weight_value_scaled" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "quality_disposition_allocations" ALTER COLUMN "value_scaled" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "quality_inspections" ALTER COLUMN "inspected_value_scaled" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "supplier_account_balances" ADD CONSTRAINT "supplier_account_balances_balance_safe_range_ck" CHECK ("supplier_account_balances"."balance_minor" >= -9007199254740991 and "supplier_account_balances"."balance_minor" <= 9007199254740991);--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_quantity_safe_range_ck" CHECK ("inventory_balances"."quantity_scaled" >= -9007199254740991 and "inventory_balances"."quantity_scaled" <= 9007199254740991);--> statement-breakpoint
ALTER TABLE "cash_balances" ADD CONSTRAINT "cash_balances_balance_safe_range_ck" CHECK ("cash_balances"."balance_minor" >= -9007199254740991 and "cash_balances"."balance_minor" <= 9007199254740991);