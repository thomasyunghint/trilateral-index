/**
 * Types for the text classification pipeline.
 *
 * Used by both the LLM classifier and human labeling workflow.
 */

import type { Bucket, BilateralPair } from "../types";

/* ─── Source metadata ─── */

export type SourceTier = "T1-academic" | "advisory-firm" | "official-data";

export interface ArticleSource {
  name: string;
  tier: SourceTier;
  /** e.g. "NBER Working Paper #31842" */
  citation: string;
  url?: string;
}

/* ─── Classification input ─── */

export interface ClassificationInput {
  /** Unique article identifier */
  articleId: string;
  /** Article title */
  title: string;
  /** Source metadata */
  source: ArticleSource;
  /** Publication date (YYYY-MM or YYYY-MM-DD) */
  date: string;
  /** Which bilateral pair this article is about */
  pair: BilateralPair;
  /** Which TGFI bucket to score against */
  bucket: Bucket;
  /** Full text or relevant excerpt (max ~4000 tokens) */
  text: string;
}

/* ─── Classification output ─── */

export interface ClassificationOutput {
  /** Score on [-100, +100] scale */
  score: number;
  /** 2-4 sentence explanation of why this score was assigned */
  rationale: string;
  /** 3-7 key phrases from the text that drove the score */
  keyPhrases: string[];
  /** Model confidence in [0, 1] */
  confidence: number;
  /** Which rubric criteria were triggered (by ID) */
  triggeredCriteria: string[];
}

/* ─── Gold-standard label ─── */

export interface GoldLabel {
  articleId: string;
  /** Human-assigned score [-100, +100] */
  humanScore: number;
  /** Brief justification */
  humanRationale: string;
  /** Labeler ID (e.g. "thomas", "ra-1") */
  labeledBy: string;
  /** ISO date */
  labeledAt: string;
}

/* ─── Validation result ─── */

export interface ValidationResult {
  articleId: string;
  llmScore: number;
  humanScore: number;
  /** |llmScore - humanScore| */
  absoluteError: number;
  /** Whether both scores agree on direction (positive/negative) */
  directionMatch: boolean;
  /** Whether |error| <= 15 points (acceptable threshold) */
  withinThreshold: boolean;
}

/* ─── Rubric criterion ─── */

export interface RubricCriterion {
  /** Unique ID, e.g. "T-FRAG-01" */
  id: string;
  /** Human-readable label */
  label: string;
  /** What this criterion detects */
  description: string;
  /** Which score range this criterion maps to */
  scoreRange: { min: number; max: number };
  /** Concrete example of text that would trigger this */
  example: string;
}
