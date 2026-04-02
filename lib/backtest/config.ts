import type { ETFConfig } from "./types";

/**
 * ETFs used for backtesting TGFI predictive power.
 *
 * Selection rationale:
 * - FXI:  iShares China Large-Cap → directly exposed to CN-US tension
 * - KWEB: KraneShares CSI China Internet → CN tech sector, sensitive to tech decoupling
 * - EWG:  iShares MSCI Germany → EU's largest economy, proxy for CN-EU trade impact
 * - VGK:  Vanguard FTSE Europe → broad EU equity, US-EU relationship proxy
 * - EFA:  iShares MSCI EAFE → developed ex-US, general fragmentation sensitivity
 * - SPY:  S&P 500 → US benchmark, control variable
 */
export const BACKTEST_ETFS: ETFConfig[] = [
  {
    symbol: "FXI",
    name: "iShares China Large-Cap",
    description: "Top 50 Chinese stocks by market cap. Primary proxy for CN-US geopolitical risk.",
    primaryPair: "CN-US",
    color: "#ef4444",   // red
  },
  {
    symbol: "KWEB",
    name: "KraneShares CSI China Internet",
    description: "Chinese internet & tech sector. Sensitive to tech decoupling and export controls.",
    primaryPair: "CN-US",
    color: "#f97316",   // orange
  },
  {
    symbol: "EWG",
    name: "iShares MSCI Germany",
    description: "German equities. Proxy for CN-EU trade relationship and EU industrial exposure.",
    primaryPair: "CN-EU",
    color: "#eab308",   // yellow
  },
  {
    symbol: "VGK",
    name: "Vanguard FTSE Europe",
    description: "Broad European equities. Reflects US-EU transatlantic cooperation / friction.",
    primaryPair: "US-EU",
    color: "#22c55e",   // green
  },
  {
    symbol: "EFA",
    name: "iShares MSCI EAFE",
    description: "Developed markets ex-US. General fragmentation sensitivity control.",
    primaryPair: "US-EU",
    color: "#3b82f6",   // blue
  },
  {
    symbol: "SPY",
    name: "S&P 500 ETF",
    description: "US large-cap benchmark. Control variable for market beta.",
    primaryPair: "CN-US",
    color: "#8b5cf6",   // purple
  },
];

/** Lags to test (in months): 0 = concurrent, 1 = TGFI leads by 1 month, etc. */
export const BACKTEST_LAGS = [0, 1, 2, 3];

/** Minimum observations required for statistical validity */
export const MIN_OBSERVATIONS = 6;

/** Significance threshold */
export const SIGNIFICANCE_LEVEL = 0.05;
