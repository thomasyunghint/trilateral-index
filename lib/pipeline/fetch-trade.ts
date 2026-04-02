/**
 * Fetch bilateral trade data from OECD SDMX REST API.
 *
 * Reference: OECD SDMX RESTful API v2.1
 * Dataflow:  Bilateral Trade in Goods by Industry and End-use (BTDIXE)
 *
 * Returns raw observations: reporter→partner exports and imports by period.
 */

import type { BilateralPair } from "../types";
import type { RawTradeObservation, TradeFlow, SDMXDataResponse } from "./types";
import { OECD_SDMX, PAIR_COUNTRIES } from "./config";

/**
 * Build the SDMX data URL for a reporter→partner trade query.
 *
 * Key format: {REPORTER}.{PARTNER}.{INDICATOR}.{MEASURE}.{FREQ}
 *
 * Example:
 *   CHN.USA.S_TXG.V.Q → China's quarterly goods exports to USA, value in USD
 */
function buildTradeUrl(
  reporter: string,
  partner: string,
  indicator: string,
  freq: string,
  startPeriod?: string,
  endPeriod?: string,
): string {
  const key = `${reporter}.${partner}.${indicator}.${OECD_SDMX.measures.value}.${freq}`;
  const url = new URL(
    `${OECD_SDMX.baseUrl}/data/${OECD_SDMX.tradeDataflow}/${key}`,
  );
  url.searchParams.set("format", OECD_SDMX.format);
  if (startPeriod) url.searchParams.set("startPeriod", startPeriod);
  if (endPeriod) url.searchParams.set("endPeriod", endPeriod);
  return url.toString();
}

/**
 * Parse SDMX JSON response into RawTradeObservation[].
 */
function parseSDMXResponse(
  json: SDMXDataResponse,
  reporter: string,
  partner: string,
  indicator: "exports" | "imports",
): RawTradeObservation[] {
  const observations: RawTradeObservation[] = [];

  if (!json.dataSets?.[0]?.observations) return observations;

  // Find the time dimension to map observation keys → period labels
  const timeDim = json.structure?.dimensions?.observation?.find(
    (d) => d.id === "TIME_PERIOD",
  );
  const periodValues = timeDim?.values ?? [];

  const obs = json.dataSets[0].observations;
  for (const [key, values] of Object.entries(obs)) {
    const periodIdx = parseInt(key, 10);
    const period = periodValues[periodIdx]?.id;
    const value = values[0];

    if (period && typeof value === "number" && !isNaN(value)) {
      observations.push({
        reporter,
        partner,
        period,
        valueUSD: value,
        indicator,
      });
    }
  }

  return observations;
}

/**
 * Fetch one direction of trade (e.g., CHN exports to USA).
 */
async function fetchOneDirection(
  reporter: string,
  partner: string,
  indicator: "exports" | "imports",
  freq: "Q" | "M" = "Q",
  startPeriod?: string,
  endPeriod?: string,
): Promise<RawTradeObservation[]> {
  const sdmxIndicator =
    indicator === "exports"
      ? OECD_SDMX.indicators.totalExports
      : OECD_SDMX.indicators.totalImports;

  const url = buildTradeUrl(reporter, partner, sdmxIndicator, freq, startPeriod, endPeriod);

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 }, // cache 24h
  });

  if (!res.ok) {
    console.error(`OECD SDMX error ${res.status}: ${url}`);
    return [];
  }

  const json: SDMXDataResponse = await res.json();
  return parseSDMXResponse(json, reporter, partner, indicator);
}

/**
 * Fetch all bilateral trade data for a pair.
 * Returns 4 series: A→B exports, A→B imports, B→A exports, B→A imports.
 */
export async function fetchBilateralTrade(
  pair: BilateralPair,
  freq: "Q" | "M" = "Q",
  startPeriod = "2022-Q1",
  endPeriod?: string,
): Promise<RawTradeObservation[]> {
  const mapping = PAIR_COUNTRIES.find((m) => m.pair === pair);
  if (!mapping) throw new Error(`Unknown pair: ${pair}`);

  const { countryA, countryB } = mapping;

  // Fetch all 4 directions in parallel
  const [aExportsToB, aImportsFromB, bExportsToA, bImportsFromA] =
    await Promise.all([
      fetchOneDirection(countryA, countryB, "exports", freq, startPeriod, endPeriod),
      fetchOneDirection(countryA, countryB, "imports", freq, startPeriod, endPeriod),
      fetchOneDirection(countryB, countryA, "exports", freq, startPeriod, endPeriod),
      fetchOneDirection(countryB, countryA, "imports", freq, startPeriod, endPeriod),
    ]);

  return [...aExportsToB, ...aImportsFromB, ...bExportsToA, ...bImportsFromA];
}

/**
 * Aggregate raw observations into TradeFlow[] (total bilateral trade per period).
 *
 * Total trade = A's exports to B + B's exports to A
 * (Using exports from both sides avoids double-counting)
 */
export function aggregateToFlows(
  pair: BilateralPair,
  observations: RawTradeObservation[],
): TradeFlow[] {
  const mapping = PAIR_COUNTRIES.find((m) => m.pair === pair);
  if (!mapping) throw new Error(`Unknown pair: ${pair}`);

  // Group exports by period
  const byPeriod = new Map<
    string,
    { aToB: number; bToA: number }
  >();

  for (const obs of observations) {
    if (obs.indicator !== "exports") continue;

    const entry = byPeriod.get(obs.period) ?? { aToB: 0, bToA: 0 };
    if (obs.reporter === mapping.countryA) {
      entry.aToB = obs.valueUSD;
    } else {
      entry.bToA = obs.valueUSD;
    }
    byPeriod.set(obs.period, entry);
  }

  // Sort periods chronologically
  const periods = Array.from(byPeriod.keys()).sort();

  // Compute year-over-year growth
  const flows: TradeFlow[] = [];
  for (const period of periods) {
    const { aToB, bToA } = byPeriod.get(period)!;
    const totalTrade = aToB + bToA;

    // Find same quarter last year for YoY
    let yoyGrowth: number | null = null;
    const yoyPeriod = getYoYPeriod(period);
    if (yoyPeriod && byPeriod.has(yoyPeriod)) {
      const prev = byPeriod.get(yoyPeriod)!;
      const prevTotal = prev.aToB + prev.bToA;
      if (prevTotal > 0) {
        yoyGrowth = ((totalTrade - prevTotal) / prevTotal) * 100;
      }
    }

    flows.push({
      pair,
      period,
      totalTradeUSD: totalTrade,
      exportsAtoB: aToB,
      exportsBtoA: bToA,
      yoyGrowth,
    });
  }

  return flows;
}

/**
 * Get the same period from one year earlier.
 * "2025-Q3" → "2024-Q3", "2025-09" → "2024-09"
 */
function getYoYPeriod(period: string): string | null {
  const qMatch = period.match(/^(\d{4})-Q(\d)$/);
  if (qMatch) return `${parseInt(qMatch[1]) - 1}-Q${qMatch[2]}`;

  const mMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (mMatch) return `${parseInt(mMatch[1]) - 1}-${mMatch[2]}`;

  return null;
}

/**
 * Fetch all 3 pairs' trade data in parallel.
 */
export async function fetchAllPairsTrade(
  freq: "Q" | "M" = "Q",
  startPeriod = "2022-Q1",
): Promise<Record<BilateralPair, RawTradeObservation[]>> {
  const pairs: BilateralPair[] = ["CN-US", "CN-EU", "US-EU"];
  const results = await Promise.all(
    pairs.map((pair) => fetchBilateralTrade(pair, freq, startPeriod)),
  );
  return {
    "CN-US": results[0],
    "CN-EU": results[1],
    "US-EU": results[2],
  };
}
