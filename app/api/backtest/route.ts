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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "mock";

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
        {
          error: "Backtest failed",
          details: error instanceof Error ? error.message : "Unknown",
        },
        { status: 500 },
      );
    }
  }
}
