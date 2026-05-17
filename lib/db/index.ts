import { neon } from "@neondatabase/serverless";

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  return neon(url);
}

export type Article = {
  id: string;
  source_name: string;
  source_url: string | null;
  title: string;
  url: string;
  published_at: string | null;
  fetched_at: string;
  full_text: string | null;
  word_count: number | null;
  status: "pending" | "extracted" | "failed" | "skipped";
};

export type Claim = {
  id: string;
  article_id: string;
  claim_text: string;
  claim_type: "QUANTITATIVE" | "CAUSAL" | "INTERPRETIVE" | "PREDICTIVE";
  direction: number;
  verbatim_quote: string | null;
  bucket_trade: number;
  bucket_investment: number;
  bucket_technology: number;
  bucket_finance: number;
  bucket_leverage: number;
  bucket_policy: number;
  pairs: string[];
  extracted_at: string;
};
