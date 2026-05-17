/**
 * /api/detect — Phase 3 Detection endpoint
 *
 * Runs cross-reference patterns on all extracted claims.
 * Returns signals with optional Sonnet analysis for top results.
 *
 * Query params:
 *   ?analyze=true  — include Sonnet analysis for top signals (costs ~$0.07)
 *   ?limit=5       — max signals to return (default 10, max 50)
 *
 * Auth: Bearer CRON_SECRET required
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runDetection } from "@/lib/detector";
import { analyzeTopSignals } from "@/lib/analyzer";
import { verifyCronAuth } from "@/lib/auth";

export const maxDuration = 120;

export async function GET(request: Request) {
  // Auth check
  const authErr = verifyCronAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const analyze = url.searchParams.get("analyze") === "true";
  const limitRaw = parseInt(url.searchParams.get("limit") || "10");
  const limit = Math.max(1, Math.min(50, isNaN(limitRaw) ? 10 : limitRaw));

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
          message: "Not enough claims yet for pattern detection.",
        },
      });
    }

    const limited = signals.slice(0, limit);

    // Optionally analyze with Sonnet
    let result = limited;
    if (analyze) {
      try {
        result = await analyzeTopSignals(limited, Math.min(5, limited.length));
      } catch (analyzeErr) {
        console.error("Analysis failed, returning raw signals:", analyzeErr);
        // Fall back to raw signals if analysis fails
      }
    }

    // Store top signals in DB (non-blocking — don't fail the response if this errors)
    try {
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
    } catch (dbErr) {
      console.error("Failed to store signals in DB:", dbErr);
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
    console.error("Detection failed:", err);
    return NextResponse.json(
      { error: "Detection pipeline failed" },
      { status: 500 },
    );
  }
}
