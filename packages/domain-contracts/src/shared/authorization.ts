import { z } from "zod";

/**
 * Who may do what, as a table.
 *
 * Deliberately **not** a policy engine (ADR-0011). Nine permissions and five
 * roles fit in one readable literal; a rule language would let somebody express
 * a debt-adjustment policy that nobody can read off the page, which is the
 * opposite of what a money system needs.
 *
 * The table lives in `domain-contracts` rather than the kernel because it
 * involves no aggregate state — it is a shape the API and a future UI must
 * agree on. See docs/04-business-rules/authorization-rules.md.
 */

/** Roles as named in the product's design reference (`design.md`). */
export const WORKSPACE_ROLES = ["owner", "accountant", "sales", "warehouse", "delivery"] as const;
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

const WORKSPACE_ROLE_ORDER = new Map<WorkspaceRole, number>(
  WORKSPACE_ROLES.map((role, index) => [role, index]),
);

/**
 * A membership carries one non-empty, deterministic role set. `owner` is
 * exclusive because it already contains every permission; `owner + warehouse`
 * would communicate no additional authority and would make review misleading.
 */
export function normalizeWorkspaceRoles(roles: readonly WorkspaceRole[]): readonly WorkspaceRole[] {
  const normalized = [...new Set(roles)].sort(
    (left, right) =>
      (WORKSPACE_ROLE_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (WORKSPACE_ROLE_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
  if (normalized.length === 0) throw new Error("A workspace membership needs at least one role.");
  if (normalized.includes("owner") && normalized.length > 1) {
    throw new Error('The "owner" role is exclusive.');
  }
  return normalized;
}

export const workspaceRoleSetSchema = z
  .array(workspaceRoleSchema)
  .min(1)
  .superRefine((roles, ctx) => {
    if (new Set(roles).size !== roles.length) {
      ctx.addIssue({ code: "custom", message: "Workspace roles must be unique." });
    }
    if (roles.includes("owner") && roles.length > 1) {
      ctx.addIssue({ code: "custom", message: 'The "owner" role is exclusive.' });
    }
  })
  .transform((roles) => [...normalizeWorkspaceRoles(roles)]);
export type WorkspaceRoleSet = z.infer<typeof workspaceRoleSetSchema>;

export function primaryWorkspaceRole(roles: readonly WorkspaceRole[]): WorkspaceRole {
  return normalizeWorkspaceRoles(roles)[0] as WorkspaceRole;
}

/**
 * One permission per thing a caller can attempt. Named after the command or the
 * read it guards, so a refusal names something the reader can find.
 */
export const PERMISSIONS = [
  "customer.create",
  "customer.read",
  "customer.update",
  "customer.deactivate",
  "customer.reactivate",
  "sale.create",
  "sale.post",
  /** Removes a receivable without a payment arriving. Sits with `debt.adjust`. */
  "sale.void",
  "sale.read",
  "payment.record",
  "payment.reverse",
  "payment.read",
  /** The one that matters most: moving a balance with no underlying document. */
  "debt.adjust",
  "debt.read",
  /** Reading who did what. Held by the roles that answer for the books. */
  "audit.read",
  "evidence.read",
  "evidence.record",
  /** Managing who is a member of the workspace. Owner only. */
  "workspace.manage",
  "product.read",
  "product.create",
  "product.update",
  "product.deactivate",
  "product.reactivate",
  "pricing.read",
  "pricing.manage",
  "quality.read",
  "quality.manage",
  "supplier.read",
  "supplier.create",
  "supplier.update",
  "supplier.deactivate",
  "supplier.reactivate",
  "supplier.payment.record",
  "supplier.payment.reverse",
  "supplier.account.adjust",
  "supplier.account.rebuild",
  "supplier.account.read",
  "purchase.read",
  "purchase.create",
  "purchase.update",
  "purchase.discard",
  "purchase.confirm",
  "purchase.void",
  "receiving.read",
  "receiving.record",
  "receiving.reverse",
  "inventory.read",
  "inventory.adjust",
  "inventory.reclassify",
  "inventory.rebuild",
  "delivery.read",
  "delivery.create",
  "delivery.update",
  "delivery.cancel",
  "delivery.dispatch",
  "delivery.complete",
  "delivery.return",
  "document.read",
  "document.generate",
  "document.share",
  "report.read",
  "cash.read",
  "cash.account.manage",
  "cash.expense.record",
  "cash.expense.reverse",
  "cash.transfer",
  "cash.adjust",
  "cash.rebuild",
  "intake.read",
  "intake.record",
  "intake.reverse",
  "quality.issue.manage",
  "quality.inspect",
  "quality.inspect.reverse",
  "quality.disposition",
  "quality.disposition.reverse",
] as const;
export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof permissionSchema>;

/**
 * Least privilege by default: a role gets what its job needs and nothing more.
 *
 * `debt.adjust` and `sale.void` are held by `owner` and `accountant` only — the
 * two ways to move money without a new trade happening. Everything else is a
 * starting point that the depot owner must confirm — recorded as ASM-017, not
 * presented as settled policy.
 */
export const ROLE_PERMISSIONS: Readonly<Record<WorkspaceRole, readonly Permission[]>> = {
  owner: [...PERMISSIONS],

  accountant: [
    "customer.read",
    "audit.read",
    "evidence.read",
    "evidence.record",
    "sale.void",
    "sale.read",
    "payment.record",
    "payment.reverse",
    "payment.read",
    "debt.adjust",
    "debt.read",
    "product.read",
    "pricing.read",
    "pricing.manage",
    "quality.read",
    "supplier.read",
    "supplier.create",
    "supplier.update",
    "supplier.deactivate",
    "supplier.reactivate",
    "supplier.payment.record",
    "supplier.payment.reverse",
    "supplier.account.adjust",
    "supplier.account.rebuild",
    "supplier.account.read",
    "purchase.read",
    "purchase.create",
    "purchase.update",
    "purchase.discard",
    "purchase.confirm",
    "purchase.void",
    "receiving.read",
    "inventory.read",
    "delivery.read",
    "document.read",
    "document.generate",
    "document.share",
    "report.read",
    "cash.read",
    "cash.account.manage",
    "cash.expense.record",
    "cash.expense.reverse",
    "cash.transfer",
    "cash.adjust",
    "cash.rebuild",
    "intake.read",
  ],

  /**
   * Notably **without** `sale.void`. Somebody who can both create and erase a
   * sale can make a load disappear from the record entirely, and no reviewer
   * looking at the balance would see anything missing.
   */
  sales: [
    "customer.create",
    "customer.read",
    "customer.update",
    "sale.create",
    "sale.post",
    "sale.read",
    "payment.record",
    "payment.read",
    "debt.read",
    "product.read",
    "product.create",
    "product.update",
    "pricing.read",
    "quality.read",
    "inventory.read",
    "delivery.read",
    "delivery.create",
    "delivery.update",
    "delivery.cancel",
    "document.read",
    "document.generate",
    "document.share",
    "report.read",
    "evidence.read",
    "evidence.record",
    "cash.read",
  ],

  // Warehouse staff pick and pack against a sale; they move no money. They can
  // read customers because a load has to be handed to somebody by name.
  warehouse: [
    "sale.read",
    "customer.read",
    "product.read",
    "pricing.read",
    "quality.read",
    "quality.manage",
    "supplier.read",
    "purchase.read",
    "purchase.create",
    "purchase.update",
    "purchase.discard",
    "receiving.read",
    "receiving.record",
    "receiving.reverse",
    "inventory.read",
    "inventory.adjust",
    "inventory.reclassify",
    "delivery.read",
    "delivery.create",
    "delivery.update",
    "delivery.cancel",
    "delivery.dispatch",
    "delivery.return",
    "intake.read",
    "intake.record",
    "intake.reverse",
    "quality.issue.manage",
    "quality.inspect",
    "quality.inspect.reverse",
    "quality.disposition",
    "quality.disposition.reverse",
    "document.read",
    "document.generate",
    "report.read",
    "evidence.read",
    "evidence.record",
  ],

  /**
   * Read-only. Whether a driver may record the cash they collect is a real
   * business question and is unanswered (ASM-017) — so the safe default applies
   * and the depot owner decides, rather than a developer.
   */
  delivery: [
    "sale.read",
    "customer.read",
    "product.read",
    "pricing.read",
    "quality.read",
    "inventory.read",
    "delivery.read",
    "delivery.complete",
    "delivery.return",
    "document.read",
    "document.generate",
    "report.read",
    "evidence.read",
    "evidence.record",
  ],
};

/** Built once; lookup is the hot path on every command. */
const PERMISSION_SETS: Readonly<Record<WorkspaceRole, ReadonlySet<Permission>>> = Object.freeze(
  WORKSPACE_ROLES.reduce(
    (sets, role) => {
      sets[role] = new Set(ROLE_PERMISSIONS[role]);
      return sets;
    },
    {} as Record<WorkspaceRole, ReadonlySet<Permission>>,
  ),
);

export function rolesHavePermission(
  roles: readonly WorkspaceRole[],
  permission: Permission,
): boolean {
  return normalizeWorkspaceRoles(roles).some((role) => PERMISSION_SETS[role].has(permission));
}

/** Backward-compatible single-role entry point; multi-role callers pass the set. */
export function roleHasPermission(
  roleOrRoles: WorkspaceRole | readonly WorkspaceRole[],
  permission: Permission,
): boolean {
  return Array.isArray(roleOrRoles)
    ? rolesHavePermission(roleOrRoles, permission)
    : PERMISSION_SETS[roleOrRoles as WorkspaceRole].has(permission);
}

export function permissionsForRole(role: WorkspaceRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function permissionsForRoles(roles: readonly WorkspaceRole[]): readonly Permission[] {
  const normalized = normalizeWorkspaceRoles(roles);
  return PERMISSIONS.filter((permission) =>
    normalized.some((role) => PERMISSION_SETS[role].has(permission)),
  );
}
