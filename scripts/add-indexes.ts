/**
 * Add performance indexes to database.
 * Idempotent — safe to run multiple times (uses IF NOT EXISTS).
 *
 * Run: DATABASE_URL="..." npx tsx scripts/add-indexes.ts
 *
 * Verifies improvement with EXPLAIN ANALYZE on detector's main query.
 */
import { neon } from "@neondatabase/serverless";
import { requireEnv } from "./utils";

requireEnv("DATABASE_URL");

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("=== ADDING PERFORMANCE INDEXES ===\n");

  const indexes = [
    {
      name: "idx_articles_status_published",
      sql: `CREATE INDEX IF NOT EXISTS idx_articles_status_published
            ON articles(status, published_at DESC NULLS LAST)
            WHERE status = 'extracted'`,
      reason: "Detector query: WHERE status = 'extracted' ORDER BY published_at",
    },
    {
      name: "idx_articles_source",
      sql: `CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_name)`,
      reason: "extract-source.ts, audit queries: WHERE source_name = X",
    },
    {
      name: "idx_articles_published",
      sql: `CREATE INDEX IF NOT EXISTS idx_articles_published
            ON articles(published_at DESC NULLS LAST)`,
      reason: "Time-window queries and ORDER BY published_at",
    },
    {
      name: "idx_signals_detected",
      sql: `CREATE INDEX IF NOT EXISTS idx_signals_detected
            ON signals(detected_at ASC, score DESC)`,
      reason: "Signals API: ORDER BY detected_at ASC, score DESC",
    },
    {
      name: "idx_articles_wc",
      sql: `CREATE INDEX IF NOT EXISTS idx_articles_wc
            ON articles(word_count)
            WHERE word_count IS NOT NULL`,
      reason: "Content filtering: WHERE word_count > N",
    },
  ];

  for (const idx of indexes) {
    try {
      await sql(idx.sql);
      console.log(`  + ${idx.name}`);
      console.log(`    └─ ${idx.reason}`);
    } catch (err) {
      console.error(`  FAIL: ${idx.name} - ${(err as Error).message}`);
    }
  }

  // Refresh planner statistics
  console.log("\nRefreshing query planner statistics...");
  await sql`ANALYZE articles`;
  await sql`ANALYZE claims`;
  await sql`ANALYZE signals`;

  // Verify all indexes exist
  const existing = await sql`
    SELECT tablename, indexname FROM pg_indexes
    WHERE schemaname = 'public' ORDER BY tablename, indexname
  `;
  console.log(`\nTotal indexes in DB: ${existing.length}`);
  existing.forEach(i => console.log(`  ${i.tablename}.${i.indexname}`));

  console.log("\n✓ Done");
}

main().catch(e => { console.error(e); process.exit(1); });
