ALTER TYPE "public"."audit_action" ADD VALUE 'customer.reactivated' BEFORE 'sale.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'account.projection_rebuilt' BEFORE 'membership.revoked';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'membership.added' BEFORE 'membership.revoked';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'membership.role_changed' BEFORE 'membership.revoked';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'membership.reactivated' BEFORE 'membership.revoked';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_MEMBER_NOT_FOUND' BEFORE 'CUSTOMER_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_MEMBER_ALREADY_EXISTS' BEFORE 'CUSTOMER_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_MEMBER_ALREADY_ACTIVE' BEFORE 'CUSTOMER_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_MEMBER_ROLE_UNCHANGED' BEFORE 'CUSTOMER_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_MEMBER_ROLE_CONFLICT' BEFORE 'CUSTOMER_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_MEMBER_SELF_ROLE_CHANGE_DENIED' BEFORE 'CUSTOMER_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ALREADY_ACTIVE' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'ACCOUNT_ADJUSTMENT_NOT_FOUND' BEFORE 'DUPLICATE_COMMAND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'ACCOUNT_ADJUSTMENT_INTEGRITY_ERROR' BEFORE 'DUPLICATE_COMMAND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE' BEFORE 'DUPLICATE_COMMAND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'ACCOUNT_RECONCILIATION_REBUILD_UNSAFE' BEFORE 'DUPLICATE_COMMAND';
