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
 * Fetch sparkline data: claims from this source on this pair,
 * windowed so the signal's flip date is always visible.
 *
 * Strategy:
 *   - If the signal has a refDate, the window is refDate ± 45 days. This
 *     puts the flip in the middle of the chart and gives readers the
 *     surrounding baseline context on both sides.
 *   - If refDate is missing or unparseable, fall back to the last 90 days.
 *   - When refDate is very recent (so the future side of the window is
 *     truncated by NOW()), the window extends 90 days BACKWARDS from
 *     refDate so we always show ~90 days of historical context.
 *
 * This fixes the v1 bug where flips dated months ago fell outside a
 * "last 90 days from today" window — the diamonds caption promised flip
 * markers that never appeared because the data was out of range.
 */
async function fetchSparkline(
  sql: NeonQueryFunction<false, false>,
  ctx: SignalContext,
): Promise<Array<{ date: string; direction: number }>> {
  const HALF_WINDOW_DAYS = 45;
  const BACKFALL_DAYS = 90;

  let windowStart: Date;
  let windowEnd: Date;

  const refTs = ctx.refDate ? new Date(ctx.refDate).getTime() : NaN;
  if (Number.isFinite(refTs)) {
    const ref = new Date(refTs);
    windowStart = new Date(ref.getTime() - HALF_WINDOW_DAYS * 86400_000);
    const futureEnd = new Date(ref.getTime() + HALF_WINDOW_DAYS * 86400_000);
    const now = new Date();
    // If the future side of the window goes past today, just clamp to
    // today and extend the window backwards so we always show ~90 days
    // of context around the flip.
    if (futureEnd > now) {
      windowEnd = now;
      windowStart = new Date(now.getTime() - BACKFALL_DAYS * 86400_000);
      if (ref.getTime() < windowStart.getTime()) {
        // Flip is older than the back-fall — keep it centred anyway.
        windowStart = new Date(ref.getTime() - HALF_WINDOW_DAYS * 86400_000);
      }
    } else {
      windowEnd = futureEnd;
    }
  } else {
    const now = new Date();
    windowEnd = now;
    windowStart = new Date(now.getTime() - BACKFALL_DAYS * 86400_000);
  }

  const startIso = windowStart.toISOString();
  const endIso = windowEnd.toISOString();

  const rows = (await sql`
    SELECT a.published_at as date, c.direction
    FROM claims c
    JOIN articles a ON c.article_id = a.id
    WHERE a.status = 'extracted'
      AND a.source_name = ${ctx.primarySource}
      AND ${ctx.pair} = ANY(c.pairs)
      AND a.published_at BETWEEN ${startIso} AND ${endIso}
    ORDER BY a.published_at ASC
    LIMIT 200
  `) as Array<{ date: string | null; direction: number }>;

  return rows
    .filter((r): r is { date: string; direction: number } => Boolean(r.date))
    .map((r) => ({
      date: typeof r.date === "string" ? r.date : new Date(r.date).toISOString(),
      direction: r.direction,
    }));
}

/**
 * Look up paper title + URL for a batch of claim IDs.
 * Returns a Map<claim_id, { paper_title, paper_url }>.
 *
 * Primary evidence claims come from signal.evidence JSONB which only stores
 * the claim text, not the source article URL. We need the URL so users
 * can click the quote to jump to the original article.
 */
export async function fetchClaimMetadata(
  sql: NeonQueryFunction<false, false>,
  claimIds: string[],
): Promise<Map<string, { paper_title: string; paper_url: string }>> {
  const result = new Map<string, { paper_title: string; paper_url: string }>();
  if (claimIds.length === 0) return result;

  const rows = (await sql`
    SELECT c.id, a.title, a.url
    FROM claims c
    JOIN articles a ON c.article_id = a.id
    WHERE c.id::text = ANY(${claimIds})
  `) as Array<{ id: string; title: string; url: string }>;

  for (const r of rows) {
    result.set(r.id, { paper_title: r.title, paper_url: r.url });
  }
  return result;
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
