-- TGFI Insight Engine — Database Schema
-- Run this against your Neon PostgreSQL instance

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Phase 1: Raw articles from RSS feeds
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
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'extracted', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_fetched ON articles(fetched_at DESC);

-- Phase 2: Extracted claims from articles
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('QUANTITATIVE', 'CAUSAL', 'INTERPRETIVE', 'PREDICTIVE')),
  direction INTEGER CHECK (direction BETWEEN -100 AND 100),
  verbatim_quote TEXT,
  bucket_trade REAL DEFAULT 0,
  bucket_investment REAL DEFAULT 0,
  bucket_technology REAL DEFAULT 0,
  bucket_finance REAL DEFAULT 0,
  bucket_leverage REAL DEFAULT 0,
  bucket_policy REAL DEFAULT 0,
  pairs TEXT[] DEFAULT '{}',
  extracted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_article ON claims(article_id);
CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(claim_type);
CREATE INDEX IF NOT EXISTS idx_claims_pairs ON claims USING GIN(pairs);

-- Phase 3: Detected signals (for later)
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  pattern_type TEXT NOT NULL,
  claim_ids TEXT[] DEFAULT '{}',
  score REAL,
  status TEXT DEFAULT 'SIGNAL' CHECK (status IN ('SIGNAL', 'HYPOTHESIS', 'INSIGHT', 'THESIS', 'ARCHIVED', 'DISPROVEN')),
  title TEXT,
  summary TEXT,
  evidence JSONB DEFAULT '{}',
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_pattern ON signals(pattern_type);

-- Ingestion log (track RSS fetch runs)
CREATE TABLE IF NOT EXISTS ingest_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  run_at TIMESTAMPTZ DEFAULT NOW(),
  sources_checked INTEGER DEFAULT 0,
  articles_found INTEGER DEFAULT 0,
  articles_new INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'
);
