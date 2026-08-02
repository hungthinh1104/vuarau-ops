export type QualityIssueEditorState = {
  readonly code: string;
  readonly displayName: string;
  readonly category: "condition" | "defect";
  readonly description: string;
};

export const EMPTY_QUALITY_ISSUE: QualityIssueEditorState = {
  code: "",
  displayName: "",
  category: "condition",
  description: "",
};
