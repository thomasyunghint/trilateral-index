import type { BilateralPair, Bucket } from "../types";

/** Single price observation for an ETF */
export interface PricePoint {
  date: string;       // YYYY-MM-DD
  period: string;     // YYYY-MM (for monthly alignment)
  close: number;
  adjClose: number;
  volume: number;
}

/** Monthly return for an ETF */
export interface MonthlyReturn {
  period: string;     // YYYY-MM
  returnPct: number;  // percentage return
  price: number;      // month-end price
}

/** ETF metadata */
export interface ETFConfig {
  symbol: string;
  name: string;
  description: string;
  /** Which TGFI pair this ETF is most exposed to */
  primaryPair: BilateralPair;
  /** Color for charts */
  color: string;
}

/** Correlation result between a TGFI score and an ETF */
export interface CorrelationResult {
  tgfiMetric: string;        // e.g. "CN-US overall" or "CN-US trade"
  etfSymbol: string;
  lag: number;               // months (0 = concurrent, 1 = TGFI leads by 1mo)
  correlation: number;       // Pearson r
  nObservations: number;
  pValue: number | null;     // approximate
  significant: boolean;      // p < 0.05
}

/** Lead-lag analysis for one pair-ETF combination */
export interface LeadLagProfile {
  tgfiMetric: string;
  etfSymbol: string;
  lags: number[];            // e.g. [0, 1, 2, 3]
  correlations: number[];    // correlation at each lag
  bestLag: number;
  bestCorrelation: number;
}

/** Hit rate analysis */
export interface HitRateResult {
  tgfiMetric: string;
  etfSymbol: string;
  lag: number;
  totalPeriods: number;
  correctDirectionPeriods: number;  // TGFI drop → ETF drop, or TGFI rise → ETF rise
  hitRate: number;                   // correctDirection / total
}

/** Event study result */
export interface EventStudy {
  date: string;
  event: string;
  tgfiChange: number;        // TGFI score change around event
  pair: BilateralPair;
  etfReturns: Record<string, number>;  // ETF symbol → return in window
  window: string;             // e.g. "t-1 to t+3 months"
}

/** Complete backtest output */
export interface BacktestResult {
  runAt: string;
  config: {
    etfs: ETFConfig[];
    tgfiFrequency: "monthly" | "quarterly";
    lags: number[];
    startPeriod: string;
    endPeriod: string;
  };
  correlations: CorrelationResult[];
  leadLag: LeadLagProfile[];
  hitRates: HitRateResult[];
  events: EventStudy[];
  summary: {
    avgIC: number;              // average information coefficient (lag-1 correlation)
    bestPredictivePair: string;
    avgHitRate: number;
    nPeriods: number;
  };
}
