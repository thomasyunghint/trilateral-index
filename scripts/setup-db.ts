/**
 * Initialize the Neon PostgreSQL database with the TGFI schema.
 * Run: DATABASE_URL="..." npx tsx scripts/setup-db.ts
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: Set DATABASE_URL environment variable");
    process.exit(1);
  }

  const sql = neon(url);
  console.log("Connecting to Neon...\n");

  // pgcrypto for gen_random_uuid
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;
  console.log("  OK: pgcrypto extension");

  // Articles table
  await sql`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      source_name TEXT NOT NULL,
      source_url TEXT,
      title TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      published_at TIMESTAMPTZ,
      fetched_at TIMESTAMPTZ DEFAULT NOW(),
      full_text TEXT,
      word_count INTEGER,
      status TEXT DEFAULT 'pending'
    )
  `;
  console.log("  OK: articles table");

  await sql`CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_articles_fetched ON articles(fetched_at DESC)`;
  console.log("  OK: articles indexes");

  // Claims table
  await sql`
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
      claim_text TEXT NOT NULL,
      claim_type TEXT NOT NULL,
      direction INTEGER,
      verbatim_quote TEXT,
      bucket_trade REAL DEFAULT 0,
      bucket_investment REAL DEFAULT 0,
      bucket_technology REAL DEFAULT 0,
      bucket_finance REAL DEFAULT 0,
      bucket_leverage REAL DEFAULT 0,
      bucket_policy REAL DEFAULT 0,
      pairs TEXT[] DEFAULT '{}',
      extracted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  OK: claims table");

  await sql`CREATE INDEX IF NOT EXISTS idx_claims_article ON claims(article_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(claim_type)`;
  console.log("  OK: claims indexes");

  // Signals table (Phase 3)
  await sql`
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      pattern_type TEXT NOT NULL,
      claim_ids TEXT[] DEFAULT '{}',
      score REAL,
      status TEXT DEFAULT 'SIGNAL',
      title TEXT,
      summary TEXT,
      evidence JSONB DEFAULT '{}',
      detected_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    )
  `;
  console.log("  OK: signals table");

  await sql`CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_signals_pattern ON signals(pattern_type)`;
  console.log("  OK: signals indexes");

  // Ingest log
  await sql`
    CREATE TABLE IF NOT EXISTS ingest_log (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      run_at TIMESTAMPTZ DEFAULT NOW(),
      sources_checked INTEGER DEFAULT 0,
      articles_found INTEGER DEFAULT 0,
      articles_new INTEGER DEFAULT 0,
      errors JSONB DEFAULT '[]'
    )
  `;
  console.log("  OK: ingest_log table");

  // Verify
  const result = await sql`SELECT COUNT(*) as n FROM articles`;
  console.log(`\nDatabase ready. Articles: ${result[0].n}`);
}

main().catch(console.error);
