/**
 * API Route: /api/backtest
 *
 * Runs TGFI backtesting analysis:
 *   - Fetches ETF prices from Yahoo Finance (or uses mock if unavailable)
 *   - Computes correlation, lead-lag, hit rates vs TGFI scores
 *
 * Query params:
 *   ?mode=live|mock   (default: mock — uses synthetic ETF data)
 */

import { NextResponse } from "next/server";
import { runBacktest, runMockBacktest } from "@/lib/backtest";

export const maxDuration = 60;

const VALID_MODES = ["live", "mock"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "mock";
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    if (mode === "live") {
      const result = await runBacktest();
      return NextResponse.json(result);
    }

    // Mock mode: deterministic synthetic data
    const result = runMockBacktest();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Backtest error:", error);

    // Fallback to mock on any error
    try {
      const fallback = runMockBacktest();
      return NextResponse.json({
        ...fallback,
        _warning: "Live data unavailable, using synthetic returns",
      });
    } catch (fallbackError) {
      return NextResponse.json(
        { error: "Backtest failed" },
        { status: 500 },
      );
    }
  }
}
