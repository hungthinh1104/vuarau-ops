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
  /** Managing who is a member of the workspace. Owner only. */
  "workspace.manage",
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
    "sale.void",
    "sale.read",
    "payment.record",
    "payment.reverse",
    "payment.read",
    "debt.adjust",
    "debt.read",
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
  ],

  // Warehouse staff pick and pack against a sale; they move no money. They can
  // read customers because a load has to be handed to somebody by name.
  warehouse: ["sale.read", "customer.read"],

  /**
   * Read-only. Whether a driver may record the cash they collect is a real
   * business question and is unanswered (ASM-017) — so the safe default applies
   * and the depot owner decides, rather than a developer.
   */
  delivery: ["sale.read", "customer.read"],
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

export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return PERMISSION_SETS[role].has(permission);
}

export function permissionsForRole(role: WorkspaceRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
