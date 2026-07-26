-- Milestone 1 — trusted identity and authorization.
--
-- `workspace_memberships.role` defaults to 'owner' deliberately. Every row that
-- exists before this migration was created when membership *meant* unrestricted
-- access, so backfilling anything narrower would silently revoke access people
-- already have — in the worst case locking a depot out of its own debt book.
--
-- The cost of this choice is the opposite risk: immediately after migrating,
-- every existing member is an owner and therefore holds `debt.adjust`. Assigning
-- real roles is a required follow-up, tracked as ASM-018 in
-- docs/09-decisions/decision-backlog.md.
--
-- `actors.supabase_user_id` is nullable: existing actors have no verified
-- identity and consequently cannot authenticate, which is the correct outcome.
--
-- ALTER TYPE ... ADD VALUE runs inside a transaction on PostgreSQL 12+; the new
-- values are not referenced by this migration, so the same-transaction usage
-- restriction does not apply here.

CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'accountant', 'sales', 'warehouse', 'delivery');--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'AUTHENTICATION_REQUIRED' BEFORE 'WORKSPACE_ACCESS_DENIED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'AUTHENTICATION_INVALID' BEFORE 'WORKSPACE_ACCESS_DENIED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'ACTOR_NOT_FOUND' BEFORE 'WORKSPACE_ACCESS_DENIED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'ACTOR_IMPERSONATION_DENIED' BEFORE 'WORKSPACE_ACCESS_DENIED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_MEMBERSHIP_INACTIVE' BEFORE 'CUSTOMER_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PERMISSION_DENIED' BEFORE 'CUSTOMER_NOT_FOUND';--> statement-breakpoint
ALTER TABLE "actors" ADD COLUMN "supabase_user_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD COLUMN "role" "workspace_role" DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_supabase_user_id_unique" UNIQUE("supabase_user_id");