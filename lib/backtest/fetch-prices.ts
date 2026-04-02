/**
 * Fetch ETF price data from Yahoo Finance v8 chart API.
 *
 * Server-side only (Next.js API route / RSC) — no CORS issues.
 * Returns monthly OHLCV data for backtesting alignment with TGFI scores.
 */

import type { PricePoint, MonthlyReturn } from "./types";

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

/**
 * Fetch monthly price data for an ETF symbol.
 *
 * @param symbol - ETF ticker (e.g., "FXI")
 * @param range  - Data range (e.g., "2y", "5y")
 */
export async function fetchETFPrices(
  symbol: string,
  range = "2y",
): Promise<PricePoint[]> {
  const url = `${YF_BASE}/${symbol}?range=${range}&interval=1mo&events=history`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    next: { revalidate: 86400 }, // cache 24h
  });

  if (!res.ok) {
    console.error(`Yahoo Finance error ${res.status} for ${symbol}`);
    return [];
  }

  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const quotes = result.indicators?.quote?.[0] ?? {};
  const adjClose = result.indicators?.adjclose?.[0]?.adjclose ?? quotes.close ?? [];

  const points: PricePoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const date = new Date(timestamps[i] * 1000);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");

    const close = quotes.close?.[i];
    const adj = adjClose[i] ?? close;
    const volume = quotes.volume?.[i] ?? 0;

    if (close == null || isNaN(close)) continue;

    points.push({
      date: `${yyyy}-${mm}-${dd}`,
      period: `${yyyy}-${mm}`,
      close,
      adjClose: adj,
      volume,
    });
  }

  return points;
}

/**
 * Convert price points to monthly returns (percentage).
 */
export function computeMonthlyReturns(prices: PricePoint[]): MonthlyReturn[] {
  const returns: MonthlyReturn[] = [];

  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1].adjClose;
    const curr = prices[i].adjClose;
    if (prev <= 0) continue;

    returns.push({
      period: prices[i].period,
      returnPct: ((curr - prev) / prev) * 100,
      price: curr,
    });
  }

  return returns;
}

/**
 * Fetch prices for multiple ETFs in parallel.
 */
export async function fetchMultipleETFs(
  symbols: string[],
  range = "2y",
): Promise<Record<string, PricePoint[]>> {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const prices = await fetchETFPrices(symbol, range);
      return { symbol, prices };
    }),
  );

  const record: Record<string, PricePoint[]> = {};
  for (const { symbol, prices } of results) {
    record[symbol] = prices;
  }
  return record;
}
