import type {
  CashStatementMatchDto,
  OperationalCloseDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { PageQuery, PageResult } from "./read-ports.ts";

export type OperationalCloseReadRepository = {
  get(
    workspaceId: WorkspaceId,
    operationalCloseId: OperationalCloseDto["id"],
  ): Promise<OperationalCloseDto | null>;
  list(args: {
    workspaceId: WorkspaceId;
    fromBusinessDate: string | null;
    toBusinessDate: string | null;
    page: PageQuery;
  }): Promise<PageResult<OperationalCloseDto>>;
};

export type CashStatementMatchReadRepository = {
  get(
    workspaceId: WorkspaceId,
    cashStatementMatchId: CashStatementMatchDto["id"],
  ): Promise<CashStatementMatchDto | null>;
  list(args: {
    workspaceId: WorkspaceId;
    cashAccountId: CashStatementMatchDto["cashAccountId"] | null;
    sourceType: CashStatementMatchDto["sourceType"] | null;
    page: PageQuery;
  }): Promise<PageResult<CashStatementMatchDto>>;
};

export type CloseReadRepositories = {
  readonly operationalCloseReads: OperationalCloseReadRepository;
  readonly cashStatementMatchReads: CashStatementMatchReadRepository;
};
