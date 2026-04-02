/**
 * Trade bucket pipeline orchestrator.
 *
 * Full pipeline: Fetch → Aggregate → Normalize → Score
 *
 * This is the entry point for the trade hard data pipeline.
 * Called by the API route at /api/pipeline/trade.
 */

import type { BilateralPair } from "../types";
import type { TradePipelineResult } from "./types";
import { fetchBilateralTrade, aggregateToFlows } from "./fetch-trade";
import { normalizeTradeFlows } from "./normalize";
import { OECD_SDMX, NORMALIZATION, PAIR_COUNTRIES } from "./config";

/**
 * Run the full trade pipeline for all 3 bilateral pairs.
 *
 * Steps:
 * 1. Fetch raw bilateral trade data from OECD SDMX
 * 2. Aggregate into total bilateral trade flows per period
 * 3. Compute YoY growth rates
 * 4. Normalize to [-100, +100] fragmentation scores
 */
export async function runTradePipeline(
  freq: "Q" | "M" = "Q",
  startPeriod = "2022-Q1",
): Promise<TradePipelineResult> {
  const pairs: BilateralPair[] = ["CN-US", "CN-EU", "US-EU"];

  // Step 1: Fetch raw data for all pairs in parallel
  const rawByPair = await Promise.all(
    pairs.map(async (pair) => {
      const observations = await fetchBilateralTrade(pair, freq, startPeriod);
      return { pair, observations };
    }),
  );

  // Step 2: Aggregate into flows
  const allObservations = rawByPair.flatMap((r) => r.observations);
  const allFlows = rawByPair.flatMap(({ pair, observations }) =>
    aggregateToFlows(pair, observations),
  );

  // Step 3: Normalize per pair
  const allScores = pairs.flatMap((pair) => {
    const pairFlows = allFlows.filter((f) => f.pair === pair);
    return normalizeTradeFlows(pair, pairFlows);
  });

  return {
    fetchedAt: new Date().toISOString(),
    source: "OECD_SDMX",
    dataflow: OECD_SDMX.tradeDataflow,
    observations: allObservations,
    flows: allFlows,
    scores: allScores,
    metadata: {
      periodsAvailable: new Set(allFlows.map((f) => f.period)).size,
      pairsProcessed: pairs,
      baselineWindow: NORMALIZATION.baselineWindow,
      normalizationMethod: NORMALIZATION.method,
    },
  };
}

/**
 * Run the pipeline for a single pair (useful for incremental updates).
 */
export async function runTradePipelineForPair(
  pair: BilateralPair,
  freq: "Q" | "M" = "Q",
  startPeriod = "2022-Q1",
): Promise<TradePipelineResult> {
  const observations = await fetchBilateralTrade(pair, freq, startPeriod);
  const flows = aggregateToFlows(pair, observations);
  const scores = normalizeTradeFlows(pair, flows);

  return {
    fetchedAt: new Date().toISOString(),
    source: "OECD_SDMX",
    dataflow: OECD_SDMX.tradeDataflow,
    observations,
    flows,
    scores,
    metadata: {
      periodsAvailable: new Set(flows.map((f) => f.period)).size,
      pairsProcessed: [pair],
      baselineWindow: NORMALIZATION.baselineWindow,
      normalizationMethod: NORMALIZATION.method,
    },
  };
}
