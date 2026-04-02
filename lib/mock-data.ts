import type {
  Bucket,
  BilateralPair,
  BucketScore,
  Direction,
  PairSummary,
  TGFISummary,
  TimeSeriesPoint,
} from "./types";

function scoreToDirection(score: number): Direction {
  if (score >= 50) return "Strong Cooperation";
  if (score >= 15) return "Cooperation";
  if (score > -15) return "Neutral";
  if (score > -50) return "Conflict";
  return "Strong Conflict";
}

/** Text-vs-hard blending weights per bucket */
export const BLEND_WEIGHTS: Record<Bucket, { text: number; hard: number }> = {
  trade: { text: 0.3, hard: 0.7 },
  investment: { text: 0.4, hard: 0.6 },
  technology: { text: 0.6, hard: 0.4 },
  finance: { text: 0.25, hard: 0.75 },
  leverage: { text: 0.8, hard: 0.2 },
  policy: { text: 0.5, hard: 0.5 },
};

/**
 * Create a BucketScore from independent text and hard data scores.
 * composite = textScore * w_text + hardDataScore * w_hard (when hard data exists).
 */
function makeBucketScore(
  bucket: Bucket,
  textScore: number,
  nArticles: number,
  hardDataScore: number | null = null,
  convergence: number | null = null,
): BucketScore {
  const w = BLEND_WEIGHTS[bucket];
  const composite =
    hardDataScore !== null
      ? Math.round((textScore * w.text + hardDataScore * w.hard) * 10) / 10
      : textScore;
  return {
    bucket,
    composite,
    textScore,
    hardDataScore,
    convergence,
    nArticles,
    direction: scoreToDirection(composite),
  };
}

function makePairSummary(buckets: Record<Bucket, BucketScore>): PairSummary {
  const vals = Object.values(buckets);
  const avg = vals.reduce((s, b) => s + b.composite, 0) / vals.length;
  const best = vals.reduce((a, b) => (b.composite > a.composite ? b : a));
  const worst = vals.reduce((a, b) => (b.composite < a.composite ? b : a));
  return {
    overallScore: Math.round(avg * 10) / 10,
    direction: scoreToDirection(avg),
    buckets,
    strongestCooperation: { bucket: best.bucket, score: best.composite },
    strongestConflict: { bucket: worst.bucket, score: worst.composite },
  };
}

// Build pairs first so overall score is derived, not hardcoded
const MOCK_PAIRS: TGFISummary["pairs"] = {
  "CN-US": makePairSummary({
    trade: makeBucketScore("trade", -51.3, 18, -38, 0.82),
    investment: makeBucketScore("investment", -47.5, 12, -60, 0.91),
    technology: makeBucketScore("technology", -68, 24, null, null),
    finance: makeBucketScore("finance", -34, 8, -18, 0.88),
    leverage: makeBucketScore("leverage", -45, 15, null, null),
    policy: makeBucketScore("policy", -35, 20, null, null),
  }),
  "CN-EU": makePairSummary({
    trade: makeBucketScore("trade", -21.3, 14, -8, 0.85),
    investment: makeBucketScore("investment", -25, 9, -30, 0.95),
    technology: makeBucketScore("technology", -35, 16, null, null),
    finance: makeBucketScore("finance", -4, 5, 12, 0.87),
    leverage: makeBucketScore("leverage", -20, 11, null, null),
    policy: makeBucketScore("policy", -15, 13, null, null),
  }),
  "US-EU": makePairSummary({
    trade: makeBucketScore("trade", 13.3, 10, 30, 0.9),
    investment: makeBucketScore("investment", 27.5, 7, 40, 0.92),
    technology: makeBucketScore("technology", 45, 12, null, null),
    finance: makeBucketScore("finance", 46, 6, 58, 0.96),
    leverage: makeBucketScore("leverage", 18, 8, null, null),
    policy: makeBucketScore("policy", 40, 15, null, null),
  }),
};

// Derive headline TGFI from pair averages (no more hardcoded -12.8)
const overallAvg =
  (MOCK_PAIRS["CN-US"].overallScore +
    MOCK_PAIRS["CN-EU"].overallScore +
    MOCK_PAIRS["US-EU"].overallScore) /
  3;

const totalArticles = (["CN-US", "CN-EU", "US-EU"] as BilateralPair[]).reduce(
  (sum, pair) =>
    sum +
    Object.values(MOCK_PAIRS[pair].buckets).reduce(
      (s, b) => s + b.nArticles,
      0,
    ),
  0,
);

export const MOCK_SUMMARY: TGFISummary = {
  period: "2026-Q1",
  computedAt: "2026-04-01T12:00:00Z",
  pairs: MOCK_PAIRS,
  overall: {
    score: Math.round(overallAvg * 10) / 10,
    direction: scoreToDirection(overallAvg),
    totalArticles,
  },
};

// Quarterly overall scores per pair (average across 6 buckets)
export const QUARTERLY_PAIR_SCORES: {
  period: string;
  scores: Record<BilateralPair, number>;
}[] = [
  { period: "2024-Q2", scores: { "CN-US": -23.3, "CN-EU": -1.7, "US-EU": 39.5 } },
  { period: "2024-Q3", scores: { "CN-US": -27.3, "CN-EU": -4.5, "US-EU": 37.7 } },
  { period: "2024-Q4", scores: { "CN-US": -31.2, "CN-EU": -6.7, "US-EU": 36.0 } },
  { period: "2025-Q1", scores: { "CN-US": -32.7, "CN-EU": -9.2, "US-EU": 34.8 } },
  { period: "2025-Q2", scores: { "CN-US": -35.3, "CN-EU": -10.5, "US-EU": 35.2 } },
  { period: "2025-Q3", scores: { "CN-US": -38.0, "CN-EU": -13.0, "US-EU": 35.8 } },
  { period: "2025-Q4", scores: { "CN-US": -40.2, "CN-EU": -14.8, "US-EU": 35.2 } },
  // Last entry derived from MOCK_PAIRS — single source of truth
  { period: "2026-Q1", scores: {
    "CN-US": MOCK_PAIRS["CN-US"].overallScore,
    "CN-EU": MOCK_PAIRS["CN-EU"].overallScore,
    "US-EU": MOCK_PAIRS["US-EU"].overallScore,
  } },
];

// Monthly overall scores per pair (Apr 2024 – Mar 2026)
export const MONTHLY_PAIR_SCORES: {
  period: string;
  scores: Record<BilateralPair, number>;
}[] = [
  { period: "2024-04", scores: { "CN-US": -21.0, "CN-EU": -0.5, "US-EU": 40.2 } },
  { period: "2024-05", scores: { "CN-US": -23.1, "CN-EU": -1.2, "US-EU": 39.8 } },
  { period: "2024-06", scores: { "CN-US": -25.8, "CN-EU": -3.4, "US-EU": 38.5 } },
  { period: "2024-07", scores: { "CN-US": -26.2, "CN-EU": -3.8, "US-EU": 38.1 } },
  { period: "2024-08", scores: { "CN-US": -27.5, "CN-EU": -4.7, "US-EU": 37.6 } },
  { period: "2024-09", scores: { "CN-US": -28.3, "CN-EU": -5.0, "US-EU": 37.3 } },
  { period: "2024-10", scores: { "CN-US": -29.5, "CN-EU": -5.8, "US-EU": 36.8 } },
  { period: "2024-11", scores: { "CN-US": -30.8, "CN-EU": -6.5, "US-EU": 36.2 } },
  { period: "2024-12", scores: { "CN-US": -33.1, "CN-EU": -7.8, "US-EU": 35.1 } },
  { period: "2025-01", scores: { "CN-US": -32.0, "CN-EU": -8.5, "US-EU": 35.0 } },
  { period: "2025-02", scores: { "CN-US": -33.2, "CN-EU": -9.5, "US-EU": 34.5 } },
  { period: "2025-03", scores: { "CN-US": -33.0, "CN-EU": -9.7, "US-EU": 34.8 } },
  { period: "2025-04", scores: { "CN-US": -34.1, "CN-EU": -9.8, "US-EU": 35.5 } },
  { period: "2025-05", scores: { "CN-US": -35.8, "CN-EU": -10.2, "US-EU": 35.0 } },
  { period: "2025-06", scores: { "CN-US": -36.0, "CN-EU": -11.5, "US-EU": 35.2 } },
  { period: "2025-07", scores: { "CN-US": -37.2, "CN-EU": -12.0, "US-EU": 36.0 } },
  { period: "2025-08", scores: { "CN-US": -38.5, "CN-EU": -13.5, "US-EU": 35.5 } },
  { period: "2025-09", scores: { "CN-US": -38.2, "CN-EU": -13.4, "US-EU": 36.0 } },
  { period: "2025-10", scores: { "CN-US": -39.0, "CN-EU": -14.0, "US-EU": 35.8 } },
  { period: "2025-11", scores: { "CN-US": -40.5, "CN-EU": -15.2, "US-EU": 35.0 } },
  { period: "2025-12", scores: { "CN-US": -41.0, "CN-EU": -15.0, "US-EU": 34.8 } },
  { period: "2026-01", scores: { "CN-US": -42.3, "CN-EU": -15.8, "US-EU": 35.5 } },
  { period: "2026-02", scores: { "CN-US": -43.8, "CN-EU": -16.5, "US-EU": 36.0 } },
  { period: "2026-03", scores: { "CN-US": -44.5, "CN-EU": -17.0, "US-EU": 36.3 } },
];

/**
 * Text/hard ratio from MOCK_PAIRS latest period, used to decompose
 * historical composites into consistent text and hard components.
 * ratio = textScore / hardDataScore for buckets with hard data.
 */
const TEXT_HARD_RATIOS: Record<BilateralPair, Partial<Record<Bucket, number>>> = {
  "CN-US": {
    trade: -51.3 / -38,        // 1.35
    investment: -47.5 / -60,   // 0.79
    finance: -34 / -18,        // 1.89
  },
  "CN-EU": {
    trade: -21.3 / -8,         // 2.66
    investment: -25 / -30,     // 0.83
    finance: -4 / 12,          // -0.33
  },
  "US-EU": {
    trade: 13.3 / 30,          // 0.44
    investment: 27.5 / 40,     // 0.69
    finance: 46 / 58,          // 0.79
  },
};

/**
 * Reconstruct bucket scores for a given historical quarter index.
 * Decomposes composite into text/hard using blend weights and the
 * text/hard ratio from MOCK_PAIRS, ensuring algebraic consistency:
 *   composite = textScore * w_text + hardDataScore * w_hard
 */
export function getBucketScoresAtIndex(
  quarterIdx: number,
  bucket: Bucket,
): Record<BilateralPair, BucketScore> {
  const pairs: BilateralPair[] = ["CN-US", "CN-EU", "US-EU"];
  const result = {} as Record<BilateralPair, BucketScore>;
  const w = BLEND_WEIGHTS[bucket];
  const hasHard = ["trade", "investment", "finance"].includes(bucket);

  for (const pair of pairs) {
    const ts = getMockTimeSeries(pair, bucket);
    const composite = ts[quarterIdx]?.score ?? 0;

    let hardDataScore: number | null = null;
    let textScore: number;

    if (hasHard) {
      // Algebraic decomposition: given composite and ratio r = text/hard,
      // composite = r*hard*w_text + hard*w_hard → hard = composite / (r*w_text + w_hard)
      const r = TEXT_HARD_RATIOS[pair][bucket] ?? 1;
      hardDataScore = Math.round((composite / (r * w.text + w.hard)) * 10) / 10;
      textScore = Math.round((r * hardDataScore) * 10) / 10;
    } else {
      textScore = composite;
    }

    result[pair] = {
      bucket,
      composite,
      textScore,
      hardDataScore,
      convergence: hasHard ? 0.85 + (quarterIdx % 5) * 0.02 : null,
      nArticles: Math.max(3, Math.round(12 + Math.abs(composite) * 0.1)),
      direction: scoreToDirection(composite),
    };
  }
  return result;
}

// Time series mock: last 8 quarters per bucket
export function getMockTimeSeries(
  pair: BilateralPair,
  bucket: Bucket,
): TimeSeriesPoint[] {
  const base: Record<BilateralPair, Record<Bucket, number[]>> = {
    "CN-US": {
      trade: [-20, -25, -30, -28, -35, -38, -40, -42],
      investment: [-30, -35, -40, -42, -48, -50, -52, -55],
      technology: [-40, -45, -50, -55, -58, -62, -65, -68],
      finance: [-10, -12, -15, -14, -18, -20, -19, -22],
      leverage: [-25, -28, -30, -32, -35, -38, -42, -45],
      policy: [-15, -18, -22, -25, -28, -30, -32, -35],
    },
    "CN-EU": {
      trade: [5, 2, 0, -3, -5, -8, -10, -12],
      investment: [-10, -12, -15, -18, -20, -22, -25, -28],
      technology: [-15, -18, -20, -22, -25, -28, -32, -35],
      finance: [15, 12, 10, 8, 10, 8, 10, 8],
      leverage: [-5, -8, -10, -12, -14, -16, -18, -20],
      policy: [0, -3, -5, -8, -10, -12, -14, -15],
    },
    "US-EU": {
      trade: [30, 28, 25, 22, 24, 22, 24, 25],
      investment: [40, 38, 36, 35, 34, 35, 34, 35],
      technology: [50, 48, 46, 45, 44, 45, 44, 45],
      finance: [55, 54, 55, 54, 55, 56, 55, 55],
      leverage: [20, 18, 16, 15, 16, 17, 18, 18],
      policy: [42, 40, 38, 38, 39, 40, 40, 40],
    },
  };

  const quarters = [
    "2024-Q2", "2024-Q3", "2024-Q4",
    "2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4",
    "2026-Q1",
  ];

  const values = base[pair]?.[bucket] ?? [0, 0, 0, 0, 0, 0, 0, 0];
  return quarters.map((q, i) => ({ period: q, score: values[i] }));
}

// Monthly time series: interpolate quarterly data to 24 monthly points
export function getMockMonthlyTimeSeries(
  pair: BilateralPair,
  bucket: Bucket,
): TimeSeriesPoint[] {
  const quarterly = getMockTimeSeries(pair, bucket);
  const months: TimeSeriesPoint[] = [];
  const monthLabels = [
    "2024-04","2024-05","2024-06","2024-07","2024-08","2024-09",
    "2024-10","2024-11","2024-12","2025-01","2025-02","2025-03",
    "2025-04","2025-05","2025-06","2025-07","2025-08","2025-09",
    "2025-10","2025-11","2025-12","2026-01","2026-02","2026-03",
  ];

  for (let m = 0; m < 24; m++) {
    const qIdx = Math.min(Math.floor(m / 3), quarterly.length - 2);
    const nextQIdx = qIdx + 1;
    const t = (m % 3) / 3;
    const score =
      quarterly[qIdx].score * (1 - t) + quarterly[nextQIdx].score * t;
    months.push({
      period: monthLabels[m],
      score: Math.round(score * 10) / 10,
    });
  }
  return months;
}
