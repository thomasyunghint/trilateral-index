import { NextResponse } from "next/server";
import { MOCK_SUMMARY, BLEND_WEIGHTS } from "@/lib/mock-data";
import { runTradePipeline } from "@/lib/pipeline";
import type {
  BilateralPair,
  Bucket,
  BucketScore,
  Direction,
  PairSummary,
  TGFISummary,
} from "@/lib/types";
import type { NormalizedTradeScore } from "@/lib/pipeline/types";

/* ------------------------------------------------------------------ */
/*  Helpers (mirror mock-data.ts logic so we stay algebraically consistent) */
/* ------------------------------------------------------------------ */

function scoreToDirection(score: number): Direction {
  if (score >= 50) return "Strong Cooperation";
  if (score >= 15) return "Cooperation";
  if (score > -15) return "Neutral";
  if (score > -50) return "Conflict";
  return "Strong Conflict";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Pick the latest score per pair from the pipeline output.
 * Scores are sorted by period; take the last entry for each pair.
 */
function latestScoreByPair(
  scores: NormalizedTradeScore[],
): Partial<Record<BilateralPair, NormalizedTradeScore>> {
  const map: Partial<Record<BilateralPair, NormalizedTradeScore>> = {};
  for (const s of scores) {
    // Keep overwriting — scores are chronological, so last write = latest
    map[s.pair] = s;
  }
  return map;
}

/**
 * Recompute a single BucketScore after swapping in a new hardDataScore.
 * Preserves the existing textScore and nArticles from mock data.
 */
function reblendBucket(
  existing: BucketScore,
  newHardDataScore: number,
): BucketScore {
  const w = BLEND_WEIGHTS[existing.bucket];
  const composite = round1(
    existing.textScore * w.text + newHardDataScore * w.hard,
  );
  return {
    ...existing,
    hardDataScore: newHardDataScore,
    composite,
    direction: scoreToDirection(composite),
    // convergence left as-is (would need a proper calculation once we have
    // real text scores; for now mock convergence is fine)
  };
}

/**
 * Recompute PairSummary after bucket scores have been updated.
 */
function recomputePairSummary(
  buckets: Record<Bucket, BucketScore>,
): PairSummary {
  const vals = Object.values(buckets);
  if (vals.length === 0) {
    return { overallScore: 0, direction: "Neutral" as const, buckets, strongestCooperation: { bucket: "trade" as Bucket, score: 0 }, strongestConflict: { bucket: "trade" as Bucket, score: 0 } };
  }
  const avg = vals.reduce((s, b) => s + b.composite, 0) / vals.length;
  const best = vals.reduce((a, b) => (b.composite > a.composite ? b : a));
  const worst = vals.reduce((a, b) => (b.composite < a.composite ? b : a));
  return {
    overallScore: round1(avg),
    direction: scoreToDirection(avg),
    buckets,
    strongestCooperation: { bucket: best.bucket, score: best.composite },
    strongestConflict: { bucket: worst.bucket, score: worst.composite },
  };
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

/**
 * GET /api/tgfi
 *
 * Query params:
 *   ?source=live|mock   (default: mock)
 *
 * Returns the latest TGFI summary.
 *   - source=mock  → hardcoded MOCK_SUMMARY
 *   - source=live  → real OECD trade data for the trade bucket,
 *                     mock data for the other 5 buckets
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source") ?? "mock";

  /* ---- Mock path (default) ---- */
  if (source !== "live") {
    return NextResponse.json({
      ...MOCK_SUMMARY,
      _source: "mock",
    });
  }

  /* ---- Live path ---- */
  try {
    const pipelineResult = await runTradePipeline();
    const latestScores = latestScoreByPair(pipelineResult.scores);

    const PAIRS: BilateralPair[] = ["CN-US", "CN-EU", "US-EU"];

    // Deep-clone mock pairs so we don't mutate the module-level constant
    const livePairs = JSON.parse(
      JSON.stringify(MOCK_SUMMARY.pairs),
    ) as TGFISummary["pairs"];

    for (const pair of PAIRS) {
      const tradeScore = latestScores[pair];
      if (tradeScore) {
        // Swap in real normalizedScore as hardDataScore for the trade bucket
        const existingTrade = livePairs[pair].buckets.trade;
        livePairs[pair].buckets.trade = reblendBucket(
          existingTrade,
          round1(tradeScore.normalizedScore),
        );
      }
      // Recompute pair-level aggregates (overallScore, direction, extremes)
      livePairs[pair] = recomputePairSummary(livePairs[pair].buckets);
    }

    // Recompute headline TGFI from updated pair scores
    const overallAvg =
      (livePairs["CN-US"].overallScore +
        livePairs["CN-EU"].overallScore +
        livePairs["US-EU"].overallScore) /
      3;

    const totalArticles = PAIRS.reduce(
      (sum, pair) =>
        sum +
        Object.values(livePairs[pair].buckets).reduce(
          (s, b) => s + b.nArticles,
          0,
        ),
      0,
    );

    const liveSummary: TGFISummary = {
      period: MOCK_SUMMARY.period,
      computedAt: new Date().toISOString(),
      pairs: livePairs,
      overall: {
        score: round1(overallAvg),
        direction: scoreToDirection(overallAvg),
        totalArticles,
      },
    };

    return NextResponse.json({
      ...liveSummary,
      _source: "live-trade",
      _pipeline: {
        fetchedAt: pipelineResult.fetchedAt,
        periodsAvailable: pipelineResult.metadata.periodsAvailable,
        normalizationMethod: pipelineResult.metadata.normalizationMethod,
      },
    });
  } catch (error) {
    console.error("[/api/tgfi] Live trade pipeline failed:", error);
    return NextResponse.json({
      ...MOCK_SUMMARY,
      _source: "mock-fallback",
      _warning: "Live pipeline unavailable, showing cached data",
    });
  }
}
