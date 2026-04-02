/**
 * Backtest orchestrator.
 *
 * Runs the full TGFI backtesting analysis:
 * 1. Fetch ETF prices from Yahoo Finance
 * 2. Align with TGFI monthly scores
 * 3. Compute correlations at multiple lags
 * 4. Compute lead-lag profiles (IC curves)
 * 5. Compute directional hit rates
 * 6. Generate event studies
 *
 * This is the entry point called by /api/backtest.
 */

import type { BilateralPair } from "../types";
import type { BacktestResult, MonthlyReturn } from "./types";
import { BACKTEST_ETFS, BACKTEST_LAGS } from "./config";
import { fetchETFPrices, computeMonthlyReturns } from "./fetch-prices";
import {
  getTGFIMonthlyScores,
  getTGFIOverallMonthly,
  computeCorrelation,
  computeLeadLag,
  computeHitRate,
  generateEventStudies,
} from "./analysis";

/**
 * Run the full backtest.
 *
 * Fetches real ETF data and compares against TGFI mock scores.
 * When real TGFI pipeline is connected, swap getTGFIMonthlyScores
 * for the live pipeline output — analysis engine stays the same.
 */
export async function runBacktest(): Promise<BacktestResult> {
  const pairs: BilateralPair[] = ["CN-US", "CN-EU", "US-EU"];
  const etfConfigs = BACKTEST_ETFS;
  const lags = BACKTEST_LAGS;

  // Step 1: Fetch ETF prices in parallel
  const priceResults = await Promise.all(
    etfConfigs.map(async (etf) => {
      const prices = await fetchETFPrices(etf.symbol, "2y");
      const returns = computeMonthlyReturns(prices);
      return { symbol: etf.symbol, prices, returns };
    }),
  );

  const etfReturnsMap: Record<string, MonthlyReturn[]> = {};
  for (const { symbol, returns } of priceResults) {
    etfReturnsMap[symbol] = returns;
  }

  // Step 2: Get TGFI scores
  const tgfiByPair: Record<string, ReturnType<typeof getTGFIMonthlyScores>> = {};
  for (const pair of pairs) {
    tgfiByPair[pair] = getTGFIMonthlyScores(pair);
  }
  const tgfiOverall = getTGFIOverallMonthly();

  // Step 3: Compute correlations (all pairs × all ETFs × all lags)
  const correlations: BacktestResult["correlations"] = [];
  const leadLagProfiles: BacktestResult["leadLag"] = [];
  const hitRates: BacktestResult["hitRates"] = [];

  // Per-pair correlations
  for (const pair of pairs) {
    const tgfi = tgfiByPair[pair];
    for (const etf of etfConfigs) {
      const returns = etfReturnsMap[etf.symbol];
      if (!returns?.length) continue;

      // Correlations at each lag
      for (const lag of lags) {
        const corr = computeCorrelation(tgfi, returns, lag, `${pair}`, etf.symbol);
        if (corr) correlations.push(corr);
      }

      // Lead-lag profile
      const profile = computeLeadLag(tgfi, returns, lags, `${pair}`, etf.symbol);
      if (profile) leadLagProfiles.push(profile);

      // Hit rates (at lag 1 — predictive)
      const hr = computeHitRate(tgfi, returns, 1, `${pair}`, etf.symbol);
      if (hr) hitRates.push(hr);
    }
  }

  // Overall TGFI correlations
  for (const etf of etfConfigs) {
    const returns = etfReturnsMap[etf.symbol];
    if (!returns?.length) continue;

    for (const lag of lags) {
      const corr = computeCorrelation(tgfiOverall, returns, lag, "Overall", etf.symbol);
      if (corr) correlations.push(corr);
    }

    const profile = computeLeadLag(tgfiOverall, returns, lags, "Overall", etf.symbol);
    if (profile) leadLagProfiles.push(profile);

    const hr = computeHitRate(tgfiOverall, returns, 1, "Overall", etf.symbol);
    if (hr) hitRates.push(hr);
  }

  // Step 4: Event studies (top 5 moves per pair)
  const events: BacktestResult["events"] = [];
  for (const pair of pairs) {
    const pairEvents = generateEventStudies(
      tgfiByPair[pair],
      etfReturnsMap,
      pair,
      3,
    );
    events.push(...pairEvents);
  }

  // Step 5: Summary statistics
  const lag1Correlations = correlations.filter((c) => c.lag === 1);
  const avgIC =
    lag1Correlations.length > 0
      ? lag1Correlations.reduce((s, c) => s + Math.abs(c.correlation), 0) /
        lag1Correlations.length
      : 0;

  const avgHitRate =
    hitRates.length > 0
      ? hitRates.reduce((s, h) => s + h.hitRate, 0) / hitRates.length
      : 0;

  // Find best predictive pair
  const pairAvgIC: Record<string, number> = {};
  for (const pair of pairs) {
    const pairCorrs = lag1Correlations.filter((c) => c.tgfiMetric === pair);
    if (pairCorrs.length > 0) {
      pairAvgIC[pair] =
        pairCorrs.reduce((s, c) => s + Math.abs(c.correlation), 0) / pairCorrs.length;
    }
  }
  const bestPair = Object.entries(pairAvgIC).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "CN-US";

  return {
    runAt: new Date().toISOString(),
    config: {
      etfs: etfConfigs,
      tgfiFrequency: "monthly",
      lags,
      startPeriod: "2024-04",
      endPeriod: "2026-03",
    },
    correlations,
    leadLag: leadLagProfiles,
    hitRates,
    events,
    summary: {
      avgIC: Math.round(avgIC * 1000) / 1000,
      bestPredictivePair: bestPair,
      avgHitRate: Math.round(avgHitRate * 1000) / 1000,
      nPeriods: tgfiOverall.length,
    },
  };
}

/**
 * Run backtest with mock ETF returns (for when Yahoo Finance is unavailable).
 * Uses synthetic returns correlated with TGFI for demonstration.
 */
export function runMockBacktest(): BacktestResult {
  const pairs: BilateralPair[] = ["CN-US", "CN-EU", "US-EU"];
  const etfConfigs = BACKTEST_ETFS;
  const lags = BACKTEST_LAGS;

  // Generate synthetic ETF returns correlated with TGFI
  const tgfiOverall = getTGFIOverallMonthly();
  const etfReturnsMap: Record<string, MonthlyReturn[]> = {};

  // Seed-based deterministic pseudo-random
  let seed = 42;
  function seededRandom(): number {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (const etf of etfConfigs) {
    const pair = etf.primaryPair;
    const tgfi = getTGFIMonthlyScores(pair);
    const returns: MonthlyReturn[] = [];
    let price = 100;

    for (let i = 0; i < tgfi.length; i++) {
      // Synthetic return: correlated with TGFI delta + noise
      const tgfiSignal = tgfi[i].delta * 0.3;  // signal component
      const noise = (seededRandom() - 0.5) * 8;  // noise component
      const ret = tgfiSignal + noise;
      price *= 1 + ret / 100;

      returns.push({
        period: tgfi[i].period,
        returnPct: Math.round(ret * 100) / 100,
        price: Math.round(price * 100) / 100,
      });
    }

    etfReturnsMap[etf.symbol] = returns;
  }

  // Now run the same analysis as real backtest
  const tgfiByPair: Record<string, ReturnType<typeof getTGFIMonthlyScores>> = {};
  for (const pair of pairs) {
    tgfiByPair[pair] = getTGFIMonthlyScores(pair);
  }

  const correlations: BacktestResult["correlations"] = [];
  const leadLagProfiles: BacktestResult["leadLag"] = [];
  const hitRates: BacktestResult["hitRates"] = [];

  for (const pair of pairs) {
    const tgfi = tgfiByPair[pair];
    for (const etf of etfConfigs) {
      const returns = etfReturnsMap[etf.symbol];

      for (const lag of lags) {
        const corr = computeCorrelation(tgfi, returns, lag, `${pair}`, etf.symbol);
        if (corr) correlations.push(corr);
      }

      const profile = computeLeadLag(tgfi, returns, lags, `${pair}`, etf.symbol);
      if (profile) leadLagProfiles.push(profile);

      const hr = computeHitRate(tgfi, returns, 1, `${pair}`, etf.symbol);
      if (hr) hitRates.push(hr);
    }
  }

  // Overall
  for (const etf of etfConfigs) {
    const returns = etfReturnsMap[etf.symbol];
    for (const lag of lags) {
      const corr = computeCorrelation(tgfiOverall, returns, lag, "Overall", etf.symbol);
      if (corr) correlations.push(corr);
    }
    const profile = computeLeadLag(tgfiOverall, returns, lags, "Overall", etf.symbol);
    if (profile) leadLagProfiles.push(profile);
    const hr = computeHitRate(tgfiOverall, returns, 1, "Overall", etf.symbol);
    if (hr) hitRates.push(hr);
  }

  // Events
  const events: BacktestResult["events"] = [];
  for (const pair of pairs) {
    const pairEvents = generateEventStudies(tgfiByPair[pair], etfReturnsMap, pair, 3);
    events.push(...pairEvents);
  }

  const lag1 = correlations.filter((c) => c.lag === 1);
  const avgIC = lag1.length > 0
    ? lag1.reduce((s, c) => s + Math.abs(c.correlation), 0) / lag1.length
    : 0;
  const avgHR = hitRates.length > 0
    ? hitRates.reduce((s, h) => s + h.hitRate, 0) / hitRates.length
    : 0;

  return {
    runAt: new Date().toISOString(),
    config: {
      etfs: etfConfigs,
      tgfiFrequency: "monthly",
      lags,
      startPeriod: "2024-04",
      endPeriod: "2026-03",
    },
    correlations,
    leadLag: leadLagProfiles,
    hitRates,
    events,
    summary: {
      avgIC: Math.round(avgIC * 1000) / 1000,
      bestPredictivePair: "CN-US",
      avgHitRate: Math.round(avgHR * 1000) / 1000,
      nPeriods: tgfiOverall.length,
    },
  };
}
