/**
 * Statistical analysis engine for TGFI backtesting.
 *
 * Computes:
 * 1. Pearson correlation at various lags
 * 2. Lead-lag profiles (information coefficient curve)
 * 3. Directional hit rates
 * 4. Event studies
 *
 * References:
 * - Grinold & Kahn (2000) "Active Portfolio Management" — IC framework
 * - Campbell, Lo & MacKinlay (1997) — event study methodology
 */

import type { BilateralPair } from "../types";
import type {
  MonthlyReturn,
  CorrelationResult,
  LeadLagProfile,
  HitRateResult,
  EventStudy,
} from "./types";
import { MONTHLY_PAIR_SCORES } from "../mock-data";
import { MIN_OBSERVATIONS, SIGNIFICANCE_LEVEL } from "./config";

/** TGFI monthly score aligned to period format */
interface TGFIMonthlyScore {
  period: string;
  score: number;
  delta: number;  // month-over-month change
}

/**
 * Get TGFI monthly scores for a pair (from mock data).
 * Returns scores + month-over-month changes.
 */
export function getTGFIMonthlyScores(pair: BilateralPair): TGFIMonthlyScore[] {
  const raw = MONTHLY_PAIR_SCORES;
  const scores: TGFIMonthlyScore[] = [];

  for (let i = 0; i < raw.length; i++) {
    const score = raw[i].scores[pair];
    const prevScore = i > 0 ? raw[i - 1].scores[pair] : score;
    scores.push({
      period: raw[i].period,
      score,
      delta: score - prevScore,
    });
  }

  return scores;
}

/**
 * Get TGFI overall (headline) monthly scores.
 * Average of all 3 pairs.
 */
export function getTGFIOverallMonthly(): TGFIMonthlyScore[] {
  const raw = MONTHLY_PAIR_SCORES;
  const scores: TGFIMonthlyScore[] = [];

  for (let i = 0; i < raw.length; i++) {
    const s = raw[i].scores;
    const score = (s["CN-US"] + s["CN-EU"] + s["US-EU"]) / 3;
    const prevScores = i > 0 ? raw[i - 1].scores : s;
    const prevScore = (prevScores["CN-US"] + prevScores["CN-EU"] + prevScores["US-EU"]) / 3;
    scores.push({
      period: raw[i].period,
      score: Math.round(score * 10) / 10,
      delta: Math.round((score - prevScore) * 10) / 10,
    });
  }

  return scores;
}

/**
 * Pearson correlation coefficient.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denom = Math.sqrt(sumX2 * sumY2);
  if (denom === 0) return 0;
  return sumXY / denom;
}

/**
 * Approximate p-value for Pearson r using t-distribution approximation.
 * H0: r = 0; two-tailed test.
 */
function approxPValue(r: number, n: number): number {
  if (n < 4) return 1;
  if (Math.abs(r) >= 1 - 1e-10) return 1e-10; // perfect correlation guard
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const df = n - 2;
  // Approximate using normal distribution for df > 30, else use rough formula
  const absT = Math.abs(t);
  // Simple approximation: p ≈ 2 * exp(-0.717 * absT - 0.416 * absT^2)
  const p = 2 * Math.exp(-0.717 * absT - 0.416 * absT * absT);
  return Math.min(1, Math.max(0, p));
}

/**
 * Compute correlation between TGFI changes and ETF returns at a given lag.
 *
 * @param tgfiScores - Monthly TGFI scores (with deltas)
 * @param etfReturns - Monthly ETF returns
 * @param lag - Number of months TGFI leads (0 = concurrent)
 * @param metricName - Label for the TGFI metric
 * @param etfSymbol - ETF ticker
 */
export function computeCorrelation(
  tgfiScores: TGFIMonthlyScore[],
  etfReturns: MonthlyReturn[],
  lag: number,
  metricName: string,
  etfSymbol: string,
): CorrelationResult | null {
  // Build period → value maps
  const tgfiMap = new Map(tgfiScores.map((s) => [s.period, s.delta]));
  const etfMap = new Map(etfReturns.map((r) => [r.period, r.returnPct]));

  // Align: for each TGFI period t, find ETF return at period t+lag
  const alignedTGFI: number[] = [];
  const alignedETF: number[] = [];

  const etfPeriods = Array.from(etfMap.keys()).sort();

  for (const tgfi of tgfiScores) {
    // Find ETF period that is `lag` months after TGFI period
    const tgfiIdx = etfPeriods.indexOf(tgfi.period);
    if (tgfiIdx === -1) {
      console.warn(`[backtest] TGFI period ${tgfi.period} not in ETF data for ${etfSymbol}`);
      continue;
    }

    const etfIdx = tgfiIdx + lag;
    if (etfIdx < 0 || etfIdx >= etfPeriods.length) continue;

    const etfPeriod = etfPeriods[etfIdx];
    const etfReturn = etfMap.get(etfPeriod);
    if (etfReturn === undefined) continue;

    alignedTGFI.push(tgfi.delta);
    alignedETF.push(etfReturn);
  }

  if (alignedTGFI.length < MIN_OBSERVATIONS) return null;

  const r = pearsonCorrelation(alignedTGFI, alignedETF);
  const p = approxPValue(r, alignedTGFI.length);

  return {
    tgfiMetric: metricName,
    etfSymbol,
    lag,
    correlation: Math.round(r * 1000) / 1000,
    nObservations: alignedTGFI.length,
    pValue: Math.round(p * 10000) / 10000,
    significant: p < SIGNIFICANCE_LEVEL,
  };
}

/**
 * Compute lead-lag profile for one TGFI metric vs one ETF.
 * Tests correlations at lags 0, 1, 2, 3 months.
 */
export function computeLeadLag(
  tgfiScores: TGFIMonthlyScore[],
  etfReturns: MonthlyReturn[],
  lags: number[],
  metricName: string,
  etfSymbol: string,
): LeadLagProfile | null {
  const correlations: number[] = [];

  for (const lag of lags) {
    const result = computeCorrelation(
      tgfiScores,
      etfReturns,
      lag,
      metricName,
      etfSymbol,
    );
    correlations.push(result?.correlation ?? 0);
  }

  if (correlations.every((c) => c === 0)) return null;

  // Find best lag (highest absolute correlation)
  let bestIdx = 0;
  let bestAbs = 0;
  for (let i = 0; i < correlations.length; i++) {
    if (Math.abs(correlations[i]) > bestAbs) {
      bestAbs = Math.abs(correlations[i]);
      bestIdx = i;
    }
  }

  return {
    tgfiMetric: metricName,
    etfSymbol,
    lags,
    correlations: correlations.map((c) => Math.round(c * 1000) / 1000),
    bestLag: lags[bestIdx],
    bestCorrelation: correlations[bestIdx],
  };
}

/**
 * Compute directional hit rate.
 *
 * Hit = TGFI delta direction matches ETF return direction.
 * e.g., TGFI drops (more fragmentation) AND ETF drops → hit.
 */
export function computeHitRate(
  tgfiScores: TGFIMonthlyScore[],
  etfReturns: MonthlyReturn[],
  lag: number,
  metricName: string,
  etfSymbol: string,
): HitRateResult | null {
  const tgfiMap = new Map(tgfiScores.map((s) => [s.period, s.delta]));
  const etfPeriods = etfReturns.map((r) => r.period).sort();
  const etfMap = new Map(etfReturns.map((r) => [r.period, r.returnPct]));

  let total = 0;
  let correct = 0;

  for (const tgfi of tgfiScores) {
    const tgfiIdx = etfPeriods.indexOf(tgfi.period);
    if (tgfiIdx === -1) {
      console.warn(`[backtest] TGFI period ${tgfi.period} not in ETF data for ${etfSymbol}`);
      continue;
    }

    const etfIdx = tgfiIdx + lag;
    if (etfIdx < 0 || etfIdx >= etfPeriods.length) continue;

    const etfReturn = etfMap.get(etfPeriods[etfIdx]);
    if (etfReturn === undefined || tgfi.delta === 0) continue;

    total++;
    // TGFI decrease → expect ETF decrease (fragmentation hurts markets)
    // TGFI increase → expect ETF increase (cooperation helps markets)
    if ((tgfi.delta > 0 && etfReturn > 0) || (tgfi.delta < 0 && etfReturn < 0)) {
      correct++;
    }
  }

  if (total < MIN_OBSERVATIONS) return null;

  return {
    tgfiMetric: metricName,
    etfSymbol,
    lag,
    totalPeriods: total,
    correctDirectionPeriods: correct,
    hitRate: Math.round((correct / total) * 1000) / 1000,
  };
}

/**
 * Generate event studies from TGFI data.
 *
 * Identifies the largest TGFI monthly drops and checks ETF reactions.
 */
export function generateEventStudies(
  tgfiScores: TGFIMonthlyScore[],
  etfReturnsMap: Record<string, MonthlyReturn[]>,
  pair: BilateralPair,
  topN = 5,
): EventStudy[] {
  // Find months with largest absolute TGFI changes
  const sorted = [...tgfiScores]
    .filter((s) => s.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, topN);

  const events: EventStudy[] = [];
  const eventLabels: Record<string, string> = {
    "2024-06": "EU tariffs on Chinese EVs announced",
    "2024-08": "US CHIPS Act export controls tightened",
    "2024-10": "US election uncertainty peak",
    "2024-12": "China rare earth export controls expanded",
    "2025-02": "US-China trade talks suspended",
    "2025-04": "EU China trade review initiated",
    "2025-06": "Tech decoupling acceleration",
    "2025-08": "US semiconductor ban expansion",
    "2025-10": "EU de-risking policy formalized",
    "2025-12": "Year-end trade data shock",
    "2026-02": "New tariff escalation",
  };

  for (const score of sorted) {
    const etfReturns: Record<string, number> = {};

    for (const [symbol, returns] of Object.entries(etfReturnsMap)) {
      const idx = returns.findIndex((r) => r.period === score.period);
      if (idx >= 0) {
        // Window: same month return
        etfReturns[symbol] = Math.round(returns[idx].returnPct * 100) / 100;
      }
    }

    events.push({
      date: score.period,
      event: eventLabels[score.period] ?? `TGFI ${score.delta > 0 ? "surge" : "drop"} of ${score.delta.toFixed(1)}`,
      tgfiChange: score.delta,
      pair,
      etfReturns,
      window: "concurrent month",
    });
  }

  return events;
}
