/**
 * Enriches a detected signal with:
 *   - Dissenting evidence (counter-signals from different sources)
 *   - Baseline σ (how many std devs above source's normal direction volatility)
 *   - Sparkline data (90-day direction history for source × pair)
 *
 * Used by app/page.tsx to populate the hero card sections beyond
 * what's stored on the signal record itself.
 */
import type { NeonQueryFunction } from "@neondatabase/serverless";

export type EnrichmentClaim = {
  id: string;
  text: string;
  source: string;
  direction: number;
  bucket: string;
  pair: string;
  date: string | null;
  paper_title?: string;
  paper_url?: string;
};

export type EnrichmentResult = {
  dissenting: EnrichmentClaim[];
  baselineSigma: number | undefined;
  sparkline: Array<{ date: string; direction: number }>;
};

type ClaimRow = {
  id: string;
  claim_text: string;
  direction: number;
  bucket_trade: number;
  bucket_investment: number;
  bucket_technology: number;
  bucket_finance: number;
  bucket_leverage: number;
  bucket_policy: number;
  pairs: string[];
  source_name: string;
  published_at: string | null;
  title: string;
  url: string;
};

function dominantBucket(c: {
  bucket_trade: number;
  bucket_investment: number;
  bucket_technology: number;
  bucket_finance: number;
  bucket_leverage: number;
  bucket_policy: number;
}): string {
  const w: Record<string, number> = {
    trade: c.bucket_trade || 0,
    investment: c.bucket_investment || 0,
    technology: c.bucket_technology || 0,
    finance: c.bucket_finance || 0,
    leverage: c.bucket_leverage || 0,
    policy: c.bucket_policy || 0,
  };
  return Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
}

export type SignalContext = {
  signalId: string;
  primarySource: string;
  pair: string;
  bucket: string;
  toDirection: number;          // The "after" direction we're calling
  delta: number;                 // For temporal flips, the Δ magnitude
  signalClaimIds: string[];      // Original claim IDs to exclude
  refDate: string | null;        // Reference date (latest claim's date)
};

/**
 * Find counter-evidence claims from same window but different source/direction.
 * Strategy:
 *   - Same pair
 *   - Same dominant bucket
 *   - Within ±45 days of refDate
 *   - From DIFFERENT source (not the signal's primary source)
 *   - Direction OPPOSITE to signal's toDirection (gap > 40)
 *   - NOT one of the original signal's claims
 *   - Sort by direction magnitude (strongest dissent first)
 */
async function fetchDissenting(
  sql: NeonQueryFunction<false, false>,
  ctx: SignalContext,
): Promise<EnrichmentClaim[]> {
  if (!ctx.refDate || !ctx.pair) return [];

  const oppositeSign = ctx.toDirection >= 0 ? -1 : 1;

  // Window: ±45 days around refDate
  const rows = (await sql`
    SELECT
      c.id, c.claim_text, c.direction,
      c.bucket_trade, c.bucket_investment, c.bucket_technology,
      c.bucket_finance, c.bucket_leverage, c.bucket_policy,
      c.pairs,
      a.source_name, a.published_at, a.title, a.url
    FROM claims c
    JOIN articles a ON c.article_id = a.id
    WHERE a.status = 'extracted'
      AND ${ctx.pair} = ANY(c.pairs)
      AND a.source_name != ${ctx.primarySource}
      AND NOT (c.id::text = ANY(${ctx.signalClaimIds}))
      AND a.published_at BETWEEN
          (${ctx.refDate}::timestamptz - INTERVAL '45 days')
          AND (${ctx.refDate}::timestamptz + INTERVAL '45 days')
      AND (${oppositeSign}::int * c.direction) > 20
    ORDER BY (${oppositeSign}::int * c.direction) DESC
    LIMIT 10
  `) as unknown as ClaimRow[];

  // Filter to same dominant bucket and take top 2
  const matched = rows
    .filter((r) => dominantBucket(r) === ctx.bucket)
    .slice(0, 2);

  return matched.map((r) => ({
    id: r.id,
    text: r.claim_text,
    source: r.source_name,
    direction: r.direction,
    bucket: dominantBucket(r),
    pair: ctx.pair,
    date: r.published_at,
    paper_title: r.title,
    paper_url: r.url,
  }));
}

/**
 * Compute baseline σ: how many standard deviations is the signal's
 * Δ direction above the source's normal volatility on this pair × bucket.
 *
 * Returns σ-multiple (e.g., 2.3 means Δ is 2.3× the source's typical std dev).
 * Returns undefined if not enough historical data (<5 claims).
 */
async function fetchBaselineSigma(
  sql: NeonQueryFunction<false, false>,
  ctx: SignalContext,
): Promise<number | undefined> {
  if (!ctx.delta || ctx.delta === 0) return undefined;

  const rows = (await sql`
    SELECT c.direction,
           c.bucket_trade, c.bucket_investment, c.bucket_technology,
           c.bucket_finance, c.bucket_leverage, c.bucket_policy
    FROM claims c
    JOIN articles a ON c.article_id = a.id
    WHERE a.status = 'extracted'
      AND a.source_name = ${ctx.primarySource}
      AND ${ctx.pair} = ANY(c.pairs)
      AND a.published_at > NOW() - INTERVAL '365 days'
  `) as Array<{
    direction: number;
    bucket_trade: number;
    bucket_investment: number;
    bucket_technology: number;
    bucket_finance: number;
    bucket_leverage: number;
    bucket_policy: number;
  }>;

  const sameBucket = rows.filter((r) => dominantBucket(r) === ctx.bucket);
  if (sameBucket.length < 5) return undefined;

  const directions = sameBucket.map((r) => r.direction);
  const mean = directions.reduce((s, v) => s + v, 0) / directions.length;
  const variance =
    directions.reduce((s, v) => s + (v - mean) ** 2, 0) / (directions.length - 1);
  const sigma = Math.sqrt(variance);

  if (sigma < 1) return undefined;

  return Math.abs(ctx.delta) / sigma;
}

/**
 * Fetch sparkline data: all claims from this source on this pair
 * over the past 90 days, sorted by date.
 */
async function fetchSparkline(
  sql: NeonQueryFunction<false, false>,
  ctx: SignalContext,
): Promise<Array<{ date: string; direction: number }>> {
  const rows = (await sql`
    SELECT a.published_at as date, c.direction
    FROM claims c
    JOIN articles a ON c.article_id = a.id
    WHERE a.status = 'extracted'
      AND a.source_name = ${ctx.primarySource}
      AND ${ctx.pair} = ANY(c.pairs)
      AND a.published_at > NOW() - INTERVAL '90 days'
    ORDER BY a.published_at ASC
    LIMIT 100
  `) as Array<{ date: string | null; direction: number }>;

  return rows
    .filter((r): r is { date: string; direction: number } => Boolean(r.date))
    .map((r) => ({
      date: typeof r.date === "string" ? r.date : new Date(r.date).toISOString(),
      direction: r.direction,
    }));
}

/**
 * Run all 3 enrichment queries in parallel for one signal.
 */
export async function enrichSignal(
  sql: NeonQueryFunction<false, false>,
  ctx: SignalContext,
): Promise<EnrichmentResult> {
  const [dissenting, baselineSigma, sparkline] = await Promise.all([
    fetchDissenting(sql, ctx),
    fetchBaselineSigma(sql, ctx),
    fetchSparkline(sql, ctx),
  ]);
  return { dissenting, baselineSigma, sparkline };
}
