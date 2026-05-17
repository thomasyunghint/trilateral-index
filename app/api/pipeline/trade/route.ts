/**
 * API Route: /api/pipeline/trade
 *
 * Runs the trade hard data pipeline:
 *   1. Fetches bilateral trade data from OECD SDMX
 *   2. Aggregates into total bilateral flows
 *   3. Normalizes to [-100, +100] fragmentation scores
 *
 * Query params:
 *   ?freq=Q|M        (default: Q)
 *   ?start=2022-Q1   (default: 2022-Q1)
 *   ?pair=CN-US       (optional, fetch one pair only)
 */

import { NextResponse } from "next/server";
import { runTradePipeline, runTradePipelineForPair } from "@/lib/pipeline";
import type { BilateralPair } from "@/lib/types";

const VALID_PAIRS: BilateralPair[] = ["CN-US", "CN-EU", "US-EU"];

export const maxDuration = 60;

const VALID_FREQS = ["Q", "M"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const freqParam = url.searchParams.get("freq") ?? "Q";
  if (!VALID_FREQS.includes(freqParam)) {
    return NextResponse.json(
      { error: `Invalid freq. Must be one of: ${VALID_FREQS.join(", ")}` },
      { status: 400 },
    );
  }
  const freq = freqParam as "Q" | "M";
  const start = url.searchParams.get("start") ?? "2022-Q1";
  // Validate start format
  if (!/^\d{4}-(Q[1-4]|\d{2})$/.test(start)) {
    return NextResponse.json(
      { error: "Invalid start format. Use YYYY-QN or YYYY-MM" },
      { status: 400 },
    );
  }
  const pairParam = url.searchParams.get("pair");

  try {
    if (pairParam) {
      if (!VALID_PAIRS.includes(pairParam as BilateralPair)) {
        return NextResponse.json(
          { error: `Invalid pair. Valid options: ${VALID_PAIRS.join(", ")}` },
          { status: 400 },
        );
      }
      const result = await runTradePipelineForPair(
        pairParam as BilateralPair,
        freq,
        start,
      );
      return NextResponse.json(result);
    }

    const result = await runTradePipeline(freq, start);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Trade pipeline error:", error);
    return NextResponse.json(
      { error: "Pipeline execution failed" },
      { status: 500 },
    );
  }
}
