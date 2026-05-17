/**
 * Phase 3: Detection Engine
 *
 * Analyzes extracted claims to detect patterns:
 * 1. Cross-bucket divergence: Trade says cooperation but Tech says restriction
 * 2. Temporal flip: Direction reversed within 45-day window
 * 3. Bilateral asymmetry: CN-US scored differently than US-CN perspective
 * 4. Source disagreement: Two credible sources say opposite things
 *
 * Each pattern produces a Signal with a confidence score (0-100).
 * Signals with score > 60 are surfaced.
 */
import { neon, NeonQueryFunction } from "@neondatabase/serverless";

export type Signal = {
  pattern_type: string;
  title: string;
  summary: string;
  score: number;
  claim_ids: string[];
  evidence: {
    claims: Array<{
      id: string;
      text: string;
      source: string;
      direction: number;
      bucket: string;
      pair: string;
      date: string | null;
    }>;
    gap?: number;
    delta?: number;
    window_days?: number;
  };
  pairs: string[];
};

type ClaimRow = {
  id: string;
  article_id: string;
  claim_text: string;
  claim_type: string;
  direction: number;
  verbatim_quote: string;
  bucket_trade: number;
  bucket_investment: number;
  bucket_technology: number;
  bucket_finance: number;
  bucket_leverage: number;
  bucket_policy: number;
  pairs: string[];
  extracted_at: string;
  source_name: string;
  title: string;
  published_at: string | null;
};

const BUCKETS = ["trade", "investment", "technology", "finance", "leverage", "policy"] as const;
type Bucket = (typeof BUCKETS)[number];

function getDominantBucket(claim: ClaimRow): Bucket {
  const weights: Record<Bucket, number> = {
    trade: claim.bucket_trade,
    investment: claim.bucket_investment,
    technology: claim.bucket_technology,
    finance: claim.bucket_finance,
    leverage: claim.bucket_leverage,
    policy: claim.bucket_policy,
  };
  return Object.entries(weights).sort((a, b) => b[1] - a[1])[0][0] as Bucket;
}

function getClaimPairs(claim: ClaimRow): string[] {
  // pairs comes as string[] from postgres
  if (Array.isArray(claim.pairs)) return claim.pairs;
  if (typeof claim.pairs === "string") {
    try { return JSON.parse(claim.pairs); } catch { return []; }
  }
  return [];
}

/**
 * Topic similarity between two claims.
 * Uses keyword overlap (Jaccard) on claim text.
 * Returns 0-1 where > 0.15 means "same topic area".
 */
function topicSimilarity(a: ClaimRow, b: ClaimRow): number {
  const stopwords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been",
    "has", "have", "had", "do", "does", "did", "will", "would", "could", "should",
    "may", "might", "can", "shall", "to", "of", "in", "for", "on", "with", "at",
    "by", "from", "as", "into", "through", "during", "before", "after", "and", "but",
    "or", "not", "no", "if", "than", "that", "this", "these", "those", "it", "its",
    "more", "most", "very", "also", "which", "who", "what", "when", "where", "how",
    "all", "each", "every", "both", "few", "many", "some", "any", "other", "new"]);

  const tokenize = (text: string): Set<string> => {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
    return new Set(words);
  };

  const setA = tokenize(a.claim_text);
  const setB = tokenize(b.claim_text);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if two claims share the same broad topic area.
 * Uses bucket weight similarity + keyword overlap.
 */
function sameTopicArea(a: ClaimRow, b: ClaimRow): boolean {
  // 1. Bucket weight cosine similarity
  const bucketA = [a.bucket_trade, a.bucket_investment, a.bucket_technology, a.bucket_finance, a.bucket_leverage, a.bucket_policy];
  const bucketB = [b.bucket_trade, b.bucket_investment, b.bucket_technology, b.bucket_finance, b.bucket_leverage, b.bucket_policy];

  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < 6; i++) {
    dot += bucketA[i] * bucketB[i];
    magA += bucketA[i] * bucketA[i];
    magB += bucketB[i] * bucketB[i];
  }
  const cosineSim = (magA > 0 && magB > 0) ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;

  // 2. Keyword overlap
  const keywordSim = topicSimilarity(a, b);

  // Need EITHER high bucket similarity OR keyword overlap
  return cosineSim > 0.7 || keywordSim > 0.12;
}

/**
 * Pattern 1: Cross-bucket divergence
 * Find pairs where one bucket's average direction is significantly different from another.
 * Example: For CN-EU pair, Trade avg = +40 but Technology avg = -50 → gap = 90
 */
function detectCrossBucketDivergence(claims: ClaimRow[]): Signal[] {
  const signals: Signal[] = [];
  const pairs = ["CN-US", "CN-EU", "US-EU"];

  for (const pair of pairs) {
    const pairClaims = claims.filter(c => getClaimPairs(c).includes(pair));
    if (pairClaims.length < 4) continue;

    // Group by dominant bucket and calculate average direction
    const bucketStats: Record<string, { avg: number; count: number; claims: ClaimRow[] }> = {};

    for (const claim of pairClaims) {
      const bucket = getDominantBucket(claim);
      if (!bucketStats[bucket]) bucketStats[bucket] = { avg: 0, count: 0, claims: [] };
      bucketStats[bucket].avg += claim.direction;
      bucketStats[bucket].count++;
      bucketStats[bucket].claims.push(claim);
    }

    // Calculate averages
    for (const bucket of Object.keys(bucketStats)) {
      bucketStats[bucket].avg = bucketStats[bucket].avg / bucketStats[bucket].count;
    }

    // Find divergent pairs of buckets
    const activeBuckets = Object.entries(bucketStats).filter(([_, s]) => s.count >= 2);

    for (let i = 0; i < activeBuckets.length; i++) {
      for (let j = i + 1; j < activeBuckets.length; j++) {
        const [bucketA, statsA] = activeBuckets[i];
        const [bucketB, statsB] = activeBuckets[j];
        const gap = Math.abs(statsA.avg - statsB.avg);

        if (gap > 50) {
          const allClaimIds = [...statsA.claims, ...statsB.claims].map(c => c.id);
          const score = Math.min(100, gap * Math.sqrt(allClaimIds.length) / 10);

          const positiveLabel = statsA.avg > statsB.avg ? bucketA : bucketB;
          const negativeLabel = statsA.avg > statsB.avg ? bucketB : bucketA;
          const positiveAvg = Math.round(Math.max(statsA.avg, statsB.avg));
          const negativeAvg = Math.round(Math.min(statsA.avg, statsB.avg));

          signals.push({
            pattern_type: "CROSS_BUCKET_DIVERGENCE",
            title: `${pair}: ${positiveLabel} vs ${negativeLabel} divergence`,
            summary: `For ${pair}, ${positiveLabel} signals cooperation (avg direction: +${positiveAvg}) while ${negativeLabel} signals restriction (avg: ${negativeAvg}). Gap: ${Math.round(gap)} points across ${allClaimIds.length} claims.`,
            score: Math.round(score),
            claim_ids: allClaimIds,
            evidence: {
              claims: [...statsA.claims.slice(0, 2), ...statsB.claims.slice(0, 2)].map(c => ({
                id: c.id,
                text: c.claim_text,
                source: c.source_name,
                direction: c.direction,
                bucket: getDominantBucket(c),
                pair,
                date: c.published_at,
              })),
              gap: Math.round(gap),
            },
            pairs: [pair],
          });
        }
      }
    }
  }

  return signals.sort((a, b) => b.score - a.score);
}

/**
 * Pattern 2: Temporal flip
 * Same source or same pair changes direction by 60+ points within 45 days.
 */
function detectTemporalFlip(claims: ClaimRow[]): Signal[] {
  const signals: Signal[] = [];
  const WINDOW_DAYS = 45;
  const MIN_DELTA = 60;

  // Group claims by source + pair combination
  const groups: Record<string, ClaimRow[]> = {};

  for (const claim of claims) {
    if (!claim.published_at) continue;
    for (const pair of getClaimPairs(claim)) {
      const key = `${claim.source_name}::${pair}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(claim);
    }
  }

  for (const [key, groupClaims] of Object.entries(groups)) {
    if (groupClaims.length < 2) continue;
    const [source, pair] = key.split("::");

    // Sort by date
    const sorted = groupClaims
      .filter(c => c.published_at)
      .sort((a, b) => new Date(a.published_at!).getTime() - new Date(b.published_at!).getTime());

    // Compare each pair within window — must be from DIFFERENT articles AND same topic
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        // Skip if same article (different claims in one article is not a "flip")
        if (sorted[i].article_id === sorted[j].article_id) continue;

        // CRITICAL: must be about the same topic area
        if (!sameTopicArea(sorted[i], sorted[j])) continue;

        const dateA = new Date(sorted[i].published_at!);
        const dateB = new Date(sorted[j].published_at!);
        const daysDiff = (dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24);

        if (daysDiff > WINDOW_DAYS) break;
        // Require at least 1 day difference
        if (daysDiff < 1) continue;

        const delta = sorted[j].direction - sorted[i].direction;
        if (Math.abs(delta) >= MIN_DELTA) {
          const score = Math.min(100, Math.abs(delta) * (1 + 1 / Math.sqrt(daysDiff + 1)));

          signals.push({
            pattern_type: "TEMPORAL_FLIP",
            title: `${pair}: ${source} direction reversal`,
            summary: `${source} shifted ${delta > 0 ? "toward cooperation" : "toward restriction"} on ${pair} (${sorted[i].direction > 0 ? "+" : ""}${sorted[i].direction} → ${sorted[j].direction > 0 ? "+" : ""}${sorted[j].direction}) within ${Math.round(daysDiff)} days.`,
            score: Math.round(score),
            claim_ids: [sorted[i].id, sorted[j].id],
            evidence: {
              claims: [sorted[i], sorted[j]].map(c => ({
                id: c.id,
                text: c.claim_text,
                source: c.source_name,
                direction: c.direction,
                bucket: getDominantBucket(c),
                pair,
                date: c.published_at,
              })),
              delta: Math.round(delta),
              window_days: Math.round(daysDiff),
            },
            pairs: [pair],
          });
        }
      }
    }
  }

  // Deduplicate: keep highest score per source+pair
  const seen = new Map<string, Signal>();
  for (const signal of signals.sort((a, b) => b.score - a.score)) {
    const key = `${signal.title}`;
    if (!seen.has(key)) seen.set(key, signal);
  }

  return Array.from(seen.values()).slice(0, 10);
}

/**
 * Pattern 3: Source disagreement
 * Two different sources say opposite things about the same pair+bucket.
 */
function detectSourceDisagreement(claims: ClaimRow[]): Signal[] {
  const signals: Signal[] = [];

  // Group by pair + dominant bucket
  const groups: Record<string, ClaimRow[]> = {};
  for (const claim of claims) {
    const bucket = getDominantBucket(claim);
    for (const pair of getClaimPairs(claim)) {
      const key = `${pair}::${bucket}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(claim);
    }
  }

  for (const [key, groupClaims] of Object.entries(groups)) {
    if (groupClaims.length < 3) continue;
    const [pair, bucket] = key.split("::");

    // Filter: only claims where this bucket is dominant (weight > 30)
    const dominantClaims = groupClaims.filter(c => {
      const b = bucket as Bucket;
      const weight = c[`bucket_${b}` as keyof ClaimRow] as number;
      return weight > 30;
    });
    if (dominantClaims.length < 3) continue;

    // Find claims from different sources with opposite directions
    const positive = dominantClaims.filter(c => c.direction > 20);
    const negative = dominantClaims.filter(c => c.direction < -20);

    if (positive.length === 0 || negative.length === 0) continue;

    // Check they come from different sources
    const posSources = new Set(positive.map(c => c.source_name));
    const negSources = new Set(negative.map(c => c.source_name));

    const disagreeSources = [...negSources].filter(s => !posSources.has(s));
    if (disagreeSources.length === 0) continue;

    // Find best disagreeing pair that's about the SAME topic
    const sortedPos = positive.sort((a, b) => b.direction - a.direction);
    const sortedNeg = negative.sort((a, b) => a.direction - b.direction);

    let topPos: ClaimRow | null = null;
    let topNeg: ClaimRow | null = null;

    for (const p of sortedPos) {
      for (const n of sortedNeg) {
        if (p.source_name !== n.source_name && sameTopicArea(p, n)) {
          topPos = p;
          topNeg = n;
          break;
        }
      }
      if (topPos) break;
    }

    if (!topPos || !topNeg) continue;

    const gap = topPos.direction - topNeg.direction;
    const score = Math.min(100, gap * Math.sqrt(positive.length + negative.length) / 8);

    signals.push({
      pattern_type: "SOURCE_DISAGREEMENT",
      title: `${pair} ${bucket}: ${topPos.source_name} vs ${topNeg.source_name}`,
      summary: `On ${pair} ${bucket}: ${topPos.source_name} says cooperation (+${topPos.direction}) while ${topNeg.source_name} says restriction (${topNeg.direction}). Indicates expert disagreement on trajectory.`,
      score: Math.round(score),
      claim_ids: [topPos.id, topNeg.id],
      evidence: {
        claims: [topPos, topNeg].map(c => ({
          id: c.id,
          text: c.claim_text,
          source: c.source_name,
          direction: c.direction,
          bucket: getDominantBucket(c),
          pair,
          date: c.published_at,
        })),
        gap,
      },
      pairs: [pair],
    });
  }

  return signals.sort((a, b) => b.score - a.score).slice(0, 10);
}

/**
 * Main detection function: runs all patterns and returns scored signals.
 */
export async function runDetection(sqlClient: NeonQueryFunction<false, false>): Promise<Signal[]> {
  // Fetch all extracted claims with article metadata
  const claims = await sqlClient`
    SELECT c.*, a.source_name, a.title, a.published_at
    FROM claims c
    JOIN articles a ON c.article_id = a.id
    WHERE a.status = 'extracted'
    ORDER BY a.published_at DESC NULLS LAST
  ` as unknown as ClaimRow[];

  if (claims.length < 5) {
    return [];
  }

  const allSignals: Signal[] = [
    ...detectCrossBucketDivergence(claims),
    ...detectTemporalFlip(claims),
    ...detectSourceDisagreement(claims),
  ];

  // Sort by score, deduplicate similar signals
  const sorted = allSignals.sort((a, b) => b.score - a.score);

  // Filter: only surface signals with score > 60
  return sorted.filter(s => s.score > 60);
}
