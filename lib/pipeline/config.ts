import type { BilateralPair } from "../types";
import type { CountryPairMapping } from "./types";

/** OECD SDMX API configuration */
export const OECD_SDMX = {
  baseUrl: "https://sdmx.oecd.org/public/rest",
  /** Bilateral Trade in Goods by Industry and End-use */
  tradeDataflow: "OECD.SDD.TPS,DSD_BTDIXE@DF_BTDIXE,1.0",
  /** Monthly International Trade Statistics */
  mitsDataflow: "OECD.SDD.TPS,DSD_MITS@DF_MITS,1.0",
  format: "jsondata",
  indicators: {
    totalExports: "S_TXG",   // Total exports of goods
    totalImports: "S_TMG",   // Total imports of goods
  },
  measures: {
    value: "V",              // USD value
  },
  frequencies: {
    quarterly: "Q",
    monthly: "M",
  },
} as const;

/** WTO Tariff Download Facility */
export const WTO_TARIFF = {
  baseUrl: "https://api.wto.org/timeseries/v1",
  indicators: {
    appliedTariff: "HS_M_0010",        // MFN applied duty
    boundTariff: "HS_M_0020",          // Bound duty
    tradeWeightedAvg: "TP_A_0090",     // Trade-weighted average
  },
} as const;

/** UN COMTRADE API v1 */
export const COMTRADE = {
  baseUrl: "https://comtradeapi.un.org/data/v1",
  classification: "HS",
  frequency: "A",  // annual
} as const;

/** Pair-to-country-code mapping */
export const PAIR_COUNTRIES: CountryPairMapping[] = [
  { pair: "CN-US", countryA: "CHN", countryB: "USA" },
  { pair: "CN-EU", countryA: "CHN", countryB: "EU27_2020" },
  { pair: "US-EU", countryA: "USA", countryB: "EU27_2020" },
];

/** Pair lookup helper */
export function getCountryCodes(pair: BilateralPair): { a: string; b: string } {
  const mapping = PAIR_COUNTRIES.find(m => m.pair === pair);
  if (!mapping) throw new Error(`Unknown pair: ${pair}`);
  return { a: mapping.countryA, b: mapping.countryB };
}

/** Normalization parameters */
export const NORMALIZATION = {
  /** Number of quarters for rolling baseline */
  baselineWindow: 8,
  /** Min-max bounds for normalized scores */
  scoreBounds: { min: -100, max: 100 } as const,
  /** Method label */
  method: "distance-to-rolling-baseline",
} as const;

/** Data freshness / update schedule */
export const UPDATE_SCHEDULE = {
  trade: {
    hardData: "daily",        // OECD updates vary by member
    textScore: "6h",          // article classification cycle
    composite: "on-update",   // recompute when either input updates
  },
} as const;
