/**
 * Normalization pipeline for trade hard data.
 *
 * Method: Distance-to-rolling-baseline
 * 1. Compute rolling N-quarter average of YoY growth as baseline
 * 2. Deviation = (actual_growth - baseline_growth) / |baseline_growth|
 * 3. Map deviation to [-100, +100] via min-max normalization
 *
 * Interpretation:
 *   -100 = maximum trade contraction (fragmentation)
 *   +100 = maximum trade expansion (cooperation)
 *      0 = in line with baseline expectations
 *
 * Reference: Anderson & van Wincoop (2003) — gravity model predicts
 * baseline expected bilateral trade. Deviation from expected = fragmentation signal.
 */

import type { BilateralPair } from "../types";
import type { TradeFlow, NormalizedTradeScore } from "./types";
import { NORMALIZATION } from "./config";

/**
 * Compute distance-to-baseline normalized scores from trade flows.
 *
 * Step-by-step:
 * 1. Extract YoY growth rates (skip periods without YoY data)
 * 2. Compute rolling average as "expected" baseline
 * 3. Deviation = (actual - expected) / max(|expected|, 1)
 * 4. Min-max normalize to [-100, +100]
 */
export function normalizeTradeFlows(
  pair: BilateralPair,
  flows: TradeFlow[],
  baselineWindow: number = NORMALIZATION.baselineWindow,
): NormalizedTradeScore[] {
  // Filter to flows with YoY growth data
  const withGrowth = flows.filter((f) => f.yoyGrowth !== null);
  if (withGrowth.length === 0) return [];

  const growthValues = withGrowth.map((f) => f.yoyGrowth!);

  // Step 1: Compute rolling baseline (expanding window at start)
  const baselines: number[] = [];
  for (let i = 0; i < growthValues.length; i++) {
    const windowStart = Math.max(0, i - baselineWindow + 1);
    const window = growthValues.slice(windowStart, i + 1);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    baselines.push(avg);
  }

  // Step 2: Compute deviations
  const deviations: number[] = growthValues.map((actual, i) => {
    const baseline = baselines[i];
    const denominator = Math.max(Math.abs(baseline), 1); // avoid div-by-zero
    return (actual - baseline) / denominator;
  });

  // Step 3: Absolute-scale normalization to [-100, +100]
  // Deviation already represents fractional distance from baseline.
  // Multiply by scale factor and clamp — preserves sign (positive = cooperation).
  const SCALE_FACTOR = 50; // 1.0 deviation unit → 50 score points

  const scores: NormalizedTradeScore[] = withGrowth.map((flow, i) => {
    const normalized = deviations[i] * SCALE_FACTOR;

    return {
      pair,
      period: flow.period,
      rawValue: growthValues[i],
      baseline: baselines[i],
      deviation: Math.round(deviations[i] * 1000) / 1000,
      normalizedScore: Math.round(
        Math.max(
          NORMALIZATION.scoreBounds.min,
          Math.min(NORMALIZATION.scoreBounds.max, normalized),
        ) * 10,
      ) / 10,
    };
  });

  return scores;
}

/**
 * Alternative normalization: Z-score based.
 * Maps to [-100, +100] via sigmoid-like transformation.
 *
 * Used when min-max is too sensitive to outliers.
 */
export function normalizeZScore(
  pair: BilateralPair,
  flows: TradeFlow[],
): NormalizedTradeScore[] {
  const withGrowth = flows.filter((f) => f.yoyGrowth !== null);
  if (withGrowth.length < 3) return [];

  const growthValues = withGrowth.map((f) => f.yoyGrowth!);
  const mean = growthValues.reduce((a, b) => a + b, 0) / growthValues.length;
  const variance =
    growthValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
    (growthValues.length - 1);
  const std = Math.sqrt(variance);

  if (std === 0) return [];

  return withGrowth.map((flow, i) => {
    const zScore = (growthValues[i] - mean) / std;
    // Sigmoid-like mapping: tanh scales z-scores to (-1, 1), then * 100
    const normalized = Math.tanh(zScore / 2) * 100;

    return {
      pair,
      period: flow.period,
      rawValue: growthValues[i],
      baseline: mean,
      deviation: Math.round(zScore * 1000) / 1000,
      normalizedScore: Math.round(normalized * 10) / 10,
    };
  });
}

/**
 * Compute gravity model baseline (simplified).
 *
 * Full gravity: T_ij = (GDP_i * GDP_j) / distance_ij^theta
 * Simplified:   Use historical average as proxy for gravity-predicted trade.
 *
 * The deviation from this baseline is the fragmentation signal.
 */
export function gravityBaseline(
  flows: TradeFlow[],
  historicalAvgTrade: number,
): number[] {
  return flows.map((f) => {
    if (historicalAvgTrade <= 0) return 0;
    return ((f.totalTradeUSD - historicalAvgTrade) / historicalAvgTrade) * 100;
  });
}
