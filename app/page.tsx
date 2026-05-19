/**
 * TGFI Home — the signal feed.
 *
 * Server component: fetches signals + status from DB at request time,
 * passes to client components for interaction.
 */
import { getDb } from "@/lib/db";
import { SOURCES } from "@/lib/sources";
import { enrichSignal, fetchClaimMetadata, type SignalContext } from "@/lib/signal-enrichment";
import { HomeClient, type SignalRow, type HeatmapCell, type StatsBlock } from "./home-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DbSignal = {
  id: string;
  pattern_type: string;
  score: number;
  title: string;
  summary: string;
  evidence: unknown;
  detected_at: string;
};

type EvidenceClaim = {
  id: string;
  text: string;
  source: string;
  direction: number;
  bucket: string;
  pair: string;
  date: string | null;
};

type StoredEvidence = {
  claims?: EvidenceClaim[];
  gap?: number;
  delta?: number;
  window_days?: number;
  analysis?: {
    title?: string;
    analysis?: string;
    confidence?: number;
    tags?: string[];
  };
};

const SOURCE_TIERS: Record<string, "T1-Academic" | "T1-Advisory" | "T2-Policy"> = {
  NBER: "T1-Academic",
  BIS: "T1-Academic",
  Bruegel: "T1-Advisory",
  MERICS: "T1-Advisory",
  PIIE: "T1-Advisory",
  RAND: "T1-Advisory",
  ECFR: "T2-Policy",
  "CF40 Research": "T2-Policy",
  "Rhodium Group": "T1-Advisory",
};

function safeEvidence(raw: unknown): StoredEvidence {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as StoredEvidence;
    } catch {
      return {};
    }
  }
  return raw as StoredEvidence;
}

function tierScore(tier: string): number {
  if (tier.startsWith("T1")) return 1;
  if (tier.startsWith("T2")) return 0.65;
  return 0.4;
}

function computeCredibility(
  claims: EvidenceClaim[],
  patternType: string,
  score: number,
) {
  const sources = Array.from(new Set(claims.map((c) => c.source)));
  const primarySource = sources[0] || "Unknown";
  const tier = SOURCE_TIERS[primarySource] || "Unknown";
  const tierVal = tierScore(tier);

  const diversity = Math.min(1, sources.length / 3);
  const sample = Math.min(1, claims.length / 4);

  let margin = 0.5;
  if (patternType === "TEMPORAL_FLIP" || patternType === "SOURCE_DISAGREEMENT") {
    margin = Math.min(1, (score - 60) / 40 + 0.5);
  } else if (patternType === "CROSS_BUCKET_DIVERGENCE") {
    margin = Math.min(1, (score - 50) / 50 + 0.5);
  }
  margin = Math.max(0, margin);

  const reproducibility = 1;
  const composite = (tierVal + diversity + sample + margin + reproducibility) / 5;

  return {
    sourceTier: tierVal,
    sourceDiversity: diversity,
    sampleSize: sample,
    detectionMargin: margin,
    reproducibility,
    composite,
    tierLabel: tier,
    sourceCount: sources.length,
    claimCount: claims.length,
  };
}

function computeFavorability(claims: EvidenceClaim[]) {
  if (claims.length === 0) return { fromDirection: 0, toDirection: 0, delta: 0, ci: 0 };
  if (claims.length === 1) {
    const d = claims[0].direction;
    return { fromDirection: d, toDirection: d, delta: 0, ci: 0 };
  }
  const dated = [...claims].sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  const fromDirection = dated[0].direction;
  const toDirection = dated[dated.length - 1].direction;
  const delta = toDirection - fromDirection;
  const ci = Math.max(5, Math.round(Math.abs(delta) * 0.08));
  return { fromDirection, toDirection, delta, ci };
}

async function buildHeatmap(sql: ReturnType<typeof getDb>): Promise<HeatmapCell[]> {
  const buckets = ["trade", "investment", "technology", "finance", "leverage", "policy"];
  const pairs = ["CN-US", "CN-EU", "US-EU"];

  const rows = (await sql`
    SELECT
      c.pairs,
      c.direction,
      c.bucket_trade,
      c.bucket_investment,
      c.bucket_technology,
      c.bucket_finance,
      c.bucket_leverage,
      c.bucket_policy
    FROM claims c
    JOIN articles a ON c.article_id = a.id
    WHERE a.status = 'extracted'
      AND (a.published_at IS NULL OR a.published_at > NOW() - INTERVAL '120 days')
  `) as Array<{
    pairs: string[];
    direction: number;
    bucket_trade: number;
    bucket_investment: number;
    bucket_technology: number;
    bucket_finance: number;
    bucket_leverage: number;
    bucket_policy: number;
  }>;

  const sums: Record<string, { sum: number; n: number }> = {};
  for (const r of rows) {
    const claimPairs = Array.isArray(r.pairs) ? r.pairs : [];
    const weights: Record<string, number> = {
      trade: r.bucket_trade || 0,
      investment: r.bucket_investment || 0,
      technology: r.bucket_technology || 0,
      finance: r.bucket_finance || 0,
      leverage: r.bucket_leverage || 0,
      policy: r.bucket_policy || 0,
    };
    const dominant = Object.entries(weights).sort((a, b) => b[1] - a[1])[0][0];
    for (const p of claimPairs) {
      if (!pairs.includes(p)) continue;
      const key = `${p}::${dominant}`;
      if (!sums[key]) sums[key] = { sum: 0, n: 0 };
      sums[key].sum += r.direction;
      sums[key].n += 1;
    }
  }

  const cells: HeatmapCell[] = [];
  for (const pair of pairs) {
    for (const bucket of buckets) {
      const key = `${pair}::${bucket}`;
      const data = sums[key];
      cells.push({
        pair,
        bucket,
        score: data && data.n > 0 ? Math.round(data.sum / data.n) : null,
        count: data?.n || 0,
      });
    }
  }
  return cells;
}

function latestClaimDate(ev: StoredEvidence): number {
  const claims = ev.claims || [];
  let max = 0;
  for (const c of claims) {
    if (!c.date) continue;
    const t = new Date(c.date).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

export default async function HomePage() {
  const sql = getDb();

  // Fetch a larger candidate pool, then rank by EVENT RECENCY (latest claim
  // date in the signal's evidence). detected_at is when the cron last ran;
  // what matters editorially is when the underlying event happened.
  const rawCandidates = (await sql`
    SELECT id, pattern_type, score, title, summary, evidence, detected_at
    FROM signals
    WHERE status = 'SIGNAL'
    ORDER BY detected_at DESC, score DESC
    LIMIT 40
  `) as DbSignal[];

  const rankedCandidates = [...rawCandidates]
    .map((s) => ({ s, recency: latestClaimDate(safeEvidence(s.evidence)) }))
    .sort((a, b) => {
      // Primary: latest claim date (newest event first)
      if (b.recency !== a.recency) return b.recency - a.recency;
      // Tie-break on score
      return b.s.score - a.s.score;
    })
    .map((x) => x.s);

  // Editorial dedup pass: enforce diversity. Two signals that share
  // (source, dominant bucket, claim-date) are almost certainly the same
  // article surfaced under multiple bilateral pairs (e.g. one PIIE piece
  // tagged US-EU AND CN-US trade renders as two near-identical hero cards).
  // Collapse to the strongest representative.
  const seenSourceBucketDate = new Set<string>();
  const diverseCandidates: DbSignal[] = [];
  for (const s of rankedCandidates) {
    const ev = safeEvidence(s.evidence);
    const c0 = ev.claims?.[0];
    if (!c0) {
      diverseCandidates.push(s);
      continue;
    }
    const dateKey = c0.date ? String(c0.date).slice(0, 10) : "no-date";
    const editorialKey = `${c0.source}::${c0.bucket}::${dateKey}::${s.pattern_type}`;
    if (seenSourceBucketDate.has(editorialKey)) continue;
    seenSourceBucketDate.add(editorialKey);
    diverseCandidates.push(s);
  }

  // 12 = 3 hero + 9 compact (three clean rows of three). 10 left an
  // orphan compact card alone in the bottom row.
  const rawSignals = diverseCandidates.slice(0, 12);

  // Batch-fetch article URLs+titles for all primary evidence claims across all signals
  const allClaimIds = rawSignals.flatMap((s) => (safeEvidence(s.evidence).claims || []).map((c) => c.id));
  const claimMetadata = await fetchClaimMetadata(sql, allClaimIds);

  const signals: SignalRow[] = await Promise.all(
    rawSignals.map(async (s, idx) => {
      const ev = safeEvidence(s.evidence);
      const rawClaims = ev.claims || [];
      // Attach paper_title + paper_url to each primary claim
      const claims = rawClaims.map((c) => {
        const meta = claimMetadata.get(c.id);
        return meta ? { ...c, paper_title: meta.paper_title, paper_url: meta.paper_url } : c;
      });
      const cred = computeCredibility(claims, s.pattern_type, s.score);
      const fav = computeFavorability(claims);
      const tags = ev.analysis?.tags || [];
      const interpretation = ev.analysis?.analysis || s.summary;
      const headline = ev.analysis?.title || s.title;
      const primary = claims[0];

      // Build enrichment context from primary claim
      const ctx: SignalContext = {
        signalId: s.id,
        primarySource: primary?.source || "",
        pair: primary?.pair || "",
        bucket: primary?.bucket || "",
        toDirection: fav.toDirection,
        delta: fav.delta || ev.delta || 0,
        signalClaimIds: claims.map((c) => c.id),
        refDate: primary?.date || null,
      };

      let enriched = {
        dissenting: [] as typeof claims,
        baselineSigma: undefined as number | undefined,
        sparkline: [] as Array<{ date: string; direction: number }>,
      };
      try {
        if (ctx.pair && ctx.primarySource) {
          enriched = await enrichSignal(sql, ctx);
        }
      } catch (err) {
        // Enrichment is best-effort — never fail the page if a query errors
        console.error(`Enrichment failed for signal ${s.id}:`, err);
      }

      return {
        id: s.id,
        rank: idx + 1,
        pattern_type: s.pattern_type,
        score: s.score,
        headline,
        summary: s.summary,
        interpretation,
        detected_at: typeof s.detected_at === "string" ? s.detected_at : new Date(s.detected_at).toISOString(),
        pair: primary?.pair || "—",
        bucket: primary?.bucket || "—",
        tags,
        claims,
        gap: ev.gap,
        window_days: ev.window_days,
        delta: ev.delta,
        credibility: cred,
        favorability: fav,
        dissenting: enriched.dissenting,
        baselineSigma: enriched.baselineSigma,
        sparkline: enriched.sparkline,
      };
    }),
  );

  const [articleStats] = (await sql`
    SELECT COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE status = 'extracted')::int as extracted
    FROM articles
  `) as Array<{ total: number; extracted: number }>;
  const [claimStats] = (await sql`SELECT COUNT(*)::int as total FROM claims`) as Array<{ total: number }>;
  const [lastIngest] = (await sql`
    SELECT run_at FROM ingest_log ORDER BY run_at DESC LIMIT 1
  `) as Array<{ run_at: string }>;

  const stats: StatsBlock = {
    articles: articleStats?.total || 0,
    extracted: articleStats?.extracted || 0,
    claims: claimStats?.total || 0,
    sources: SOURCES.length,
    signals: signals.length,
    lastIngest: lastIngest?.run_at ? new Date(lastIngest.run_at).toISOString() : null,
  };

  const heatmap = await buildHeatmap(sql);

  return <HomeClient signals={signals} heatmap={heatmap} stats={stats} />;
}
