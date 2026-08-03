import type { PostSaleCommand, SaleDto } from "@vuarau/domain-contracts";
import {
  paymentTermsAgingPolicyDefinitionSchema,
  postSaleCommandSchema,
  roleHasPermission,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import {
  addPaymentTermDays,
  decidePostSale,
  err,
  ok,
  resolveEffectiveWorkspacePolicy,
  resolvePaymentTerm,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyAccountEffects } from "../shared/account-effects.ts";
import { toSaleDto } from "../shared/mappers.ts";

/**
 * UC-SALE-002 — the moment a customer starts owing money.
 *
 * The sale transition, the account entry, the balance, the audit record and the
 * command receipt all commit together or not at all (BR-COMMAND-005).
 */
export function postSale(ctx: CommandContext, input: unknown): Promise<DomainResult<SaleDto>> {
  return runCommand<PostSaleCommand, SaleDto>({
    commandType: "PostSale",
    schema: postSaleCommandSchema,
    input,
    ctx,
    // A correction replacement is posted by its void-authorized correcting
    // actor. An ordinary sale still requires the normal sales-post permission.
    requiredPermission: "sale.read",
    execute: async ({ command, repos, recordedAt, membership, operationalProfile }) => {
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, command.payload.saleId);
      if (sale === null) {
        return err("SALE_NOT_FOUND", "No such sale in this workspace.", {
          saleId: command.payload.saleId,
        });
      }

      if (sale.replacesSaleId === null) {
        if (!roleHasPermission(membership.roles, "sale.post")) {
          return err("PERMISSION_DENIED", "Your role cannot post a sale.", {
            workspaceId: command.workspaceId,
            permission: "sale.post",
            role: membership.role,
          });
        }
      } else {
        if (!roleHasPermission(membership.roles, "sale.void")) {
          return err("PERMISSION_DENIED", "Your role cannot post a correction replacement.", {
            workspaceId: command.workspaceId,
            permission: "sale.void",
            role: membership.role,
          });
        }
        const source = await repos.sales.findByIdForUpdate(
          command.workspaceId,
          sale.replacesSaleId,
        );
        if (source === null || source.voidRecord === null) {
          return err("SALE_REPLACEMENT_NOT_VOIDED", "A replacement must follow a committed void.", {
            saleId: sale.replacesSaleId,
          });
        }
        if (source.voidRecord.actorId !== command.actorId) {
          return err(
            "SALE_REPLACEMENT_ACTOR_MISMATCH",
            "Only the actor who voided this sale can post its replacement.",
            { saleId: source.id, voidActorId: source.voidRecord.actorId },
          );
        }
      }

      for (const line of sale.lines) {
        if (line.productId === null) {
          return err(
            "SALE_PRODUCT_REQUIRED",
            "Every Sale line must select a catalogue Product before posting.",
            { saleId: sale.id, lineId: line.lineId },
          );
        }
        const product = await repos.products.findById(command.workspaceId, line.productId);
        if (product === null) {
          return err(
            "SALE_PRODUCT_NOT_FOUND",
            "A Sale line references a Product outside this workspace or no longer present.",
            { saleId: sale.id, lineId: line.lineId, productId: line.productId },
          );
        }
        if (!product.isActive) {
          return err("SALE_PRODUCT_INACTIVE", "An inactive Product cannot be posted.", {
            saleId: sale.id,
            lineId: line.lineId,
            productId: line.productId,
          });
        }
        if (
          product.displayName !== line.productName ||
          (product.preferredUnit !== null && product.preferredUnit !== line.quantity.unit)
        ) {
          return err(
            "SALE_PRODUCT_SNAPSHOT_MISMATCH",
            "The Sale line no longer matches the selected Product name or unit.",
            {
              saleId: sale.id,
              lineId: line.lineId,
              productId: line.productId,
              productName: line.productName,
              unit: line.quantity.unit,
            },
          );
        }
        if (operationalProfile.qualityGradeMode === "required") {
          if (line.qualityGradeId === null || line.qualityGradeName === null) {
            return err(
              "SALE_QUALITY_GRADE_REQUIRED",
              "This depot requires a quality grade on every posted Sale line.",
              { saleId: sale.id, lineId: line.lineId },
            );
          }
          const grade = await repos.qualityGrades.findById(
            command.workspaceId,
            line.qualityGradeId,
          );
          if (grade === null) {
            return err(
              "SALE_QUALITY_GRADE_NOT_FOUND",
              "A Sale line references a quality grade outside this workspace or no longer present.",
              { saleId: sale.id, lineId: line.lineId, qualityGradeId: line.qualityGradeId },
            );
          }
          if (!grade.isActive) {
            return err("SALE_QUALITY_GRADE_INACTIVE", "An inactive grade cannot be posted.", {
              saleId: sale.id,
              lineId: line.lineId,
              qualityGradeId: line.qualityGradeId,
            });
          }
          if (grade.name !== line.qualityGradeName) {
            return err(
              "SALE_QUALITY_GRADE_SNAPSHOT_MISMATCH",
              "The Sale line no longer matches the selected quality grade.",
              { saleId: sale.id, lineId: line.lineId, qualityGradeId: line.qualityGradeId },
            );
          }
        } else if (line.qualityGradeId !== null || line.qualityGradeName !== null) {
          return err(
            "QUALITY_GRADE_NOT_USED",
            "This depot does not classify new quantities by commercial grade.",
            { saleId: sale.id, lineId: line.lineId },
          );
        }
      }

      let paymentTermSnapshot = null;
      if (sale.dueAt === null) {
        const policy = resolveEffectiveWorkspacePolicy(
          await repos.workspacePolicyReads.listAll(command.workspaceId),
          "payment_terms_aging",
          sale.transactionTime,
        );
        if (policy !== null) {
          const definition = paymentTermsAgingPolicyDefinitionSchema.safeParse(policy.definition);
          if (definition.success) {
            const term = resolvePaymentTerm(definition.data, sale.customerId, policy.id);
            if (term !== null) {
              paymentTermSnapshot = {
                dueAt: addPaymentTermDays(sale.transactionTime, term.termDays),
                source: term.source,
                policyVersionId: term.policyVersionId,
              };
            }
          }
        }
      }

      const decision = decidePostSale({
        command,
        sale,
        recordedAt,
        qualityGradeRequired: operationalProfile.qualityGradeMode === "required",
        paymentTermSnapshot,
      });
      if (!decision.ok) {
        return decision;
      }

      const posted = decision.value.aggregate;

      // Belt and braces (ADR-0009): the domain compared versions against the row we
      // read, and this compares again at write time. The row lock makes the race
      // unlikely; this makes a lost update impossible.
      const updated = await repos.sales.post(posted, sale.version);
      if (!updated) {
        return err("SALE_VERSION_CONFLICT", "Sale was modified by someone else.", {
          saleId: sale.id,
          expectedVersion: command.expectedVersion,
          actualVersion: sale.version,
        });
      }

      await applyAccountEffects(repos, decision.value.accountEntries, sale.currency);
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok(toSaleDto(posted, recordedAt));
    },
  });
}
