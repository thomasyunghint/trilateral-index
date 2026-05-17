import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { checkRateLimit } from "@/lib/auth";

export async function GET(request: Request) {
  // Rate limit public endpoint
  const rlErr = checkRateLimit(request);
  if (rlErr) return rlErr;

  try {
    const sql = getDb();

    const [articleCounts = { pending: 0, extracted: 0, failed: 0, skipped: 0, total: 0 }] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'extracted') as extracted,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
        COUNT(*) as total
      FROM articles
    `;

    const [claimCounts = { total: 0 }] = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE claim_type = 'QUANTITATIVE') as quantitative,
        COUNT(*) FILTER (WHERE claim_type = 'CAUSAL') as causal,
        COUNT(*) FILTER (WHERE claim_type = 'INTERPRETIVE') as interpretive,
        COUNT(*) FILTER (WHERE claim_type = 'PREDICTIVE') as predictive
      FROM claims
    `;

    const recentArticles = await sql`
      SELECT source_name, title, published_at, status
      FROM articles
      ORDER BY fetched_at DESC
      LIMIT 10
    `;

    const lastIngest = await sql`
      SELECT run_at, sources_checked, articles_found, articles_new, errors
      FROM ingest_log
      ORDER BY run_at DESC
      LIMIT 1
    `;

    const sourceCoverage = await sql`
      SELECT source_name, COUNT(*) as count
      FROM articles
      GROUP BY source_name
      ORDER BY count DESC
      LIMIT 50
    `;

    return NextResponse.json({
      articles: articleCounts,
      claims: claimCounts,
      recent_articles: recentArticles,
      last_ingest: lastIngest[0] || null,
      source_coverage: sourceCoverage,
    });
  } catch (err) {
    console.error("Status API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 },
    );
  }
}
