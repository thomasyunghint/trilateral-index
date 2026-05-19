/**
 * Text classification pipeline — barrel export.
 *
 * Currently implements the Trade bucket rubric.
 * Other buckets (investment, technology, finance, leverage, policy)
 * will follow the same structure with bucket-specific criteria.
 */

export type {
  SourceTier,
  ArticleSource,
  ClassificationInput,
  ClassificationOutput,
  GoldLabel,
  ValidationResult,
  RubricCriterion,
} from "./types";

export {
  SCORE_ANCHORS,
  TRADE_CRITERIA,
  buildClassificationPrompt,
  buildArticlePrompt,
  parseClassificationResponse,
  computeAgreement,
  ACCEPTABLE_ERROR_THRESHOLD,
  MIN_GOLD_LABELS_PER_PAIR,
  MIN_GOLD_LABELS_TOTAL,
} from "./rubric";
