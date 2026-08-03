"use client";

import { useCallback, useMemo, useRef } from "react";

/**
 * Privacy-safe instrumentation for the quick-sale workflow.
 *
 * The pilot has to answer "how long does this take and where do people get
 * stuck", and a stopwatch over somebody's shoulder answers it for twenty
 * transactions but not for two hundred. So the workflow counts what it does.
 *
 * **What it must never count is the depot's business.** No customer name, no
 * product name, no note, no amount, no id. A depot's book of who owes what is
 * the most sensitive thing this product holds, and an analytics pipeline is the
 * one place it would leak without anybody noticing — because nobody reads the
 * events, they read the charts.
 *
 * So the event shape is closed: a fixed set of names, and numeric fields only.
 * `emit` accepts nothing else, and TC-WEB-023 asserts a rendered workflow emits
 * no string that appears in the sale it recorded.
 */
export const WORKFLOW_METRICS = [
  "sale_line_count",
  "draft_started_at",
  "post_attempted_at",
  "post_confirmed_at",
  "validation_error_count",
  "line_edit_count",
  "command_retry_count",
  "unknown_outcome_count",
  "workflow_abandoned",
  "recent_customer_selected",
  "customer_selected_from_search",
  "customer_created_inline",
  "product_created_inline",
  "historical_product_selected",
  "historical_price_offered",
  "historical_price_applied",
  "historical_price_changed_after_apply",
  "recalled_price_cleared_after_context_change",
  "price_rule_applied_in_sale",
  "price_rule_changed_after_apply",
  "price_rule_cleared_after_context_change",
  "sale_detail_viewed",
] as const;

export type WorkflowMetric = (typeof WORKFLOW_METRICS)[number];

/**
 * A metric and a number. There is deliberately no `label`, no `detail`, and no
 * `Record<string, unknown>` — the shapes through which business data reaches an
 * analytics payload one "just this once" at a time.
 */
export type WorkflowEvent = {
  readonly metric: WorkflowMetric;
  readonly value: number;
};

export type MetricsSink = (event: WorkflowEvent) => void;

/**
 * No sink is wired to anything yet, and that is the honest state.
 *
 * There is no analytics service, no endpoint, and no consent flow — sending a
 * depot's workflow timings somewhere before any of those exist would be the
 * decision this comment is avoiding. Events go to the console in development so
 * a pilot session can be read off the device, and nowhere in production.
 */
const developmentSink: MetricsSink = (event) => {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.debug(`[workflow] ${event.metric}=${event.value}`);
};

export type WorkflowRecorder = {
  /** Marks the moment a metric happened, in epoch milliseconds. */
  readonly mark: (metric: WorkflowMetric) => void;
  /** Adds to a running count — validation errors, line edits, retries. */
  readonly count: (metric: WorkflowMetric, by?: number) => void;
  /** Records an absolute value, such as how many lines a sale ended up with. */
  readonly set: (metric: WorkflowMetric, value: number) => void;
  /** Everything recorded so far, for a test or a pilot readout. */
  readonly snapshot: () => Readonly<Record<string, number>>;
};

export function useWorkflowMetrics(sink: MetricsSink = developmentSink): WorkflowRecorder {
  const values = useRef<Record<string, number>>({});

  const emit = useCallback(
    (metric: WorkflowMetric, value: number) => {
      values.current[metric] = value;
      sink({ metric, value });
    },
    [sink],
  );

  return useMemo(
    () => ({
      mark: (metric) => emit(metric, Date.now()),
      count: (metric, by = 1) => emit(metric, (values.current[metric] ?? 0) + by),
      set: (metric, value) => emit(metric, value),
      snapshot: () => ({ ...values.current }),
    }),
    [emit],
  );
}

/**
 * The pilot targets, written down before the pilot so a disappointing result
 * cannot be reinterpreted afterwards.
 *
 * **These are targets, not claims.** Nothing in the automated suite measures
 * them: a headless browser typing into a form at machine speed says nothing about
 * a person on a phone at a loading bay. They are here so the pilot has a number
 * to compare against, and so this file cannot be mistaken for evidence.
 *
 * There is deliberately no target for "faster than paper". The pilot never
 * measures the process it would be compared against, and a stopwatch on one side
 * of a comparison is not a comparison — see "What H2 deliberately does not claim"
 * in docs/00-product/validation-plan.md.
 */
export const ACCEPTANCE_TARGETS = {
  /** Median wall clock, first tap to posted sale visible. */
  oneLineSaleSeconds: 10,
  threeLineSaleSeconds: 25,
  /**
   * Share of pilot tasks where the posted sale matches the worker's own record of
   * the same transaction. A sale entered in six seconds with the wrong quantity is
   * worse than no sale: it is a wrong number that looks confident.
   */
  saleMatchesWorkersOwnRecord: 1,
  /**
   * Tasks where the facilitator touched the phone or said which control to press.
   * Absolute, because past that point the facilitator recorded the sale and the
   * session measured the facilitator. Prompts — questions answered — are counted
   * and reported, with no threshold anybody could honestly set in advance.
   */
  tasksRequiringTakeover: 0,
  /** Absolute. One duplicated receivable in twenty is a failure, not 95%. */
  duplicateFinancialEffects: 0,
  lostEntriesAfterRecoverableFailure: 0,
  /** Share of pilot tasks, not of users. */
  draftVersusPostedUnderstood: 1,
  resultingBalanceUnderstood: 1,
} as const;
