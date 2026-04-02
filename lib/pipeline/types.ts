import type { BilateralPair } from "../types";

/** Raw bilateral trade observation from OECD SDMX */
export interface RawTradeObservation {
  reporter: string;
  partner: string;
  period: string;        // e.g. "2025-Q3" or "2025-09"
  valueUSD: number;      // trade value in millions USD
  indicator: "exports" | "imports";
}

/** Processed bilateral trade flow (exports + imports aggregated) */
export interface TradeFlow {
  pair: BilateralPair;
  period: string;
  totalTradeUSD: number;      // exports + imports in millions
  exportsAtoB: number;
  exportsBtoA: number;
  yoyGrowth: number | null;   // year-over-year growth rate
}

/** Normalized score for a single period */
export interface NormalizedTradeScore {
  pair: BilateralPair;
  period: string;
  rawValue: number;           // YoY growth rate or deviation
  baseline: number;           // rolling average baseline
  deviation: number;          // (raw - baseline) / |baseline|
  normalizedScore: number;    // mapped to [-100, +100]
}

/** Complete pipeline output for trade bucket */
export interface TradePipelineResult {
  fetchedAt: string;
  source: "OECD_SDMX";
  dataflow: string;
  observations: RawTradeObservation[];
  flows: TradeFlow[];
  scores: NormalizedTradeScore[];
  metadata: {
    periodsAvailable: number;
    pairsProcessed: BilateralPair[];
    baselineWindow: number;   // quarters used for baseline
    normalizationMethod: string;
  };
}

/** Country code mapping for OECD SDMX */
export interface CountryPairMapping {
  pair: BilateralPair;
  countryA: string;  // ISO 3-letter
  countryB: string;
}

/** SDMX API response structure (simplified) */
export interface SDMXDataResponse {
  header: { id: string; prepared: string };
  dataSets: Array<{
    observations: Record<string, [number, number?]>;
  }>;
  structure: {
    dimensions: {
      observation: Array<{
        id: string;
        values: Array<{ id: string; name: string }>;
      }>;
    };
  };
}
