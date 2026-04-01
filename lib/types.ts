export type Bucket =
  | "trade"
  | "investment"
  | "technology"
  | "finance"
  | "leverage"
  | "policy";

export type BilateralPair = "CN-US" | "CN-EU" | "US-EU";

export type Direction =
  | "Strong Cooperation"
  | "Cooperation"
  | "Neutral"
  | "Conflict"
  | "Strong Conflict";

export interface BucketScore {
  bucket: Bucket;
  composite: number;
  textScore: number;
  hardDataScore: number | null;
  convergence: number | null;
  nArticles: number;
  direction: Direction;
}

export interface PairSummary {
  overallScore: number;
  direction: Direction;
  buckets: Record<Bucket, BucketScore>;
  strongestCooperation: { bucket: Bucket; score: number };
  strongestConflict: { bucket: Bucket; score: number };
}

export interface TGFISummary {
  period: string;
  computedAt: string;
  pairs: Record<BilateralPair, PairSummary>;
  overall: {
    score: number;
    direction: Direction;
    totalArticles: number;
  };
}

export interface TimeSeriesPoint {
  period: string;
  score: number;
}

export const BUCKET_LABELS: Record<Bucket, string> = {
  trade: "Trade",
  investment: "Investment",
  technology: "Technology",
  finance: "Finance",
  leverage: "Leverage",
  policy: "Policy",
};

export const PAIR_LABELS: Record<BilateralPair, string> = {
  "CN-US": "China–US",
  "CN-EU": "China–EU",
  "US-EU": "US–EU",
};

export const BUCKETS: Bucket[] = [
  "trade",
  "investment",
  "technology",
  "finance",
  "leverage",
  "policy",
];

export const PAIRS: BilateralPair[] = ["CN-US", "CN-EU", "US-EU"];
