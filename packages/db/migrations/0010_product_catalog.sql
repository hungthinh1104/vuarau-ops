ALTER TYPE "public"."audit_aggregate_type" ADD VALUE IF NOT EXISTS 'product';
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE IF NOT EXISTS 'workspace';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'product.created';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'product.updated';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'product.deactivated';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'product.reactivated';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'workspace.backup_exported';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'workspace.backup_restored';
ALTER TYPE "public"."domain_rejection_code" ADD VALUE IF NOT EXISTS 'PRODUCT_NOT_FOUND';
ALTER TYPE "public"."domain_rejection_code" ADD VALUE IF NOT EXISTS 'PRODUCT_VERSION_CONFLICT';
ALTER TYPE "public"."domain_rejection_code" ADD VALUE IF NOT EXISTS 'BACKUP_DIGEST_INVALID';
ALTER TYPE "public"."domain_rejection_code" ADD VALUE IF NOT EXISTS 'BACKUP_UNSAFE_TARGET';
ALTER TYPE "public"."domain_rejection_code" ADD VALUE IF NOT EXISTS 'BACKUP_INTEGRITY_ERROR';

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "aliases" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "preferred_unit" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "products_workspace_active_name_idx"
  ON "products" ("workspace_id", "is_active", "name", "id");
CREATE INDEX IF NOT EXISTS "products_aliases_gin_idx" ON "products" USING gin ("aliases");
