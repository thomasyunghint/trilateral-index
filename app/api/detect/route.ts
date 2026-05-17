/**
 * /api/detect — Phase 3 Detection endpoint
 *
 * Runs cross-reference patterns on all extracted claims.
 * Returns signals with optional Opus analysis for top results.
 *
 * Query params:
 *   ?analyze=true  — include Opus analysis for top signals (costs ~$0.07)
 *   ?limit=5       — max signals to return (default 10)
 *
 * Auth: Bearer token (same CRON_SECRET) for cron use, or open for manual testing
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runDetection } from "@/lib/detector";
import { analyzeTopSignals } from "@/lib/analyzer";

export const maxDuration = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const analyze = url.searchParams.get("analyze") === "true";
  const limit = parseInt(url.searchParams.get("limit") || "10");

  const sql = getDb();

  try {
    const signals = await runDetection(sql);

    if (signals.length === 0) {
      return NextResponse.json({
        signals: [],
        meta: {
          total_claims_analyzed: 0,
          patterns_checked: 3,
          signals_found: 0,
          message: "Not enough claims yet for pattern detection. Need more extracted articles.",
        },
      });
    }

    const limited = signals.slice(0, limit);

    // Optionally analyze with Opus/Sonnet
    const result = analyze
      ? await analyzeTopSignals(limited, Math.min(5, limited.length))
      : limited;

    // Store signals in DB for lifecycle tracking
    for (const signal of result.slice(0, 5)) {
      await sql`
        INSERT INTO signals (pattern_type, claim_ids, score, title, summary, evidence, status)
        VALUES (
          ${signal.pattern_type},
          ${signal.claim_ids},
          ${signal.score},
          ${signal.title},
          ${signal.summary},
          ${JSON.stringify(signal.evidence)},
          'SIGNAL'
        )
        ON CONFLICT DO NOTHING
      `;
    }

    return NextResponse.json({
      signals: result,
      meta: {
        patterns_checked: 3,
        signals_found: signals.length,
        signals_returned: result.length,
        analyzed: analyze,
        threshold: 60,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
