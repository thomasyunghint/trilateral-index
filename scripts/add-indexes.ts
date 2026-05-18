/**
 * Add performance indexes to database.
 * Idempotent — safe to run multiple times (uses IF NOT EXISTS).
 *
 * Run: DATABASE_URL="..." npx tsx scripts/add-indexes.ts
 */
import { neon } from "@neondatabase/serverless";
import { requireEnv } from "./utils";

requireEnv("DATABASE_URL");

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("=== ADDING PERFORMANCE INDEXES ===\n");

  // Each index added separately as tagged template (Neon requirement)
  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_articles_status_published
              ON articles(status, published_at DESC NULLS LAST)
              WHERE status = 'extracted'`;
    console.log("  + idx_articles_status_published (partial)");
    console.log("    └─ Detector query: WHERE status='extracted' ORDER BY published_at");

    await sql`CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_name)`;
    console.log("  + idx_articles_source");
    console.log("    └─ extract-source.ts, audit: WHERE source_name = X");

    await sql`CREATE INDEX IF NOT EXISTS idx_articles_published
              ON articles(published_at DESC NULLS LAST)`;
    console.log("  + idx_articles_published");
    console.log("    └─ Time-window queries");

    await sql`CREATE INDEX IF NOT EXISTS idx_signals_detected
              ON signals(detected_at ASC, score DESC)`;
    console.log("  + idx_signals_detected");
    console.log("    └─ Signals API: ORDER BY detected_at ASC, score DESC");

    await sql`CREATE INDEX IF NOT EXISTS idx_articles_wc
              ON articles(word_count)
              WHERE word_count IS NOT NULL`;
    console.log("  + idx_articles_wc (partial)");
    console.log("    └─ Content filtering: WHERE word_count > N");
  } catch (err) {
    console.error("Failed to create index:", (err as Error).message);
    process.exit(1);
  }

  console.log("\nRefreshing query planner statistics...");
  await sql`ANALYZE articles`;
  await sql`ANALYZE claims`;
  await sql`ANALYZE signals`;

  const existing = await sql`
    SELECT tablename, indexname FROM pg_indexes
    WHERE schemaname = 'public' ORDER BY tablename, indexname
  `;
  console.log(`\nTotal indexes in DB: ${existing.length}`);
  existing.forEach(i => console.log(`  ${i.tablename}.${i.indexname}`));

  console.log("\n✓ Done");
}

main().catch(e => { console.error(e); process.exit(1); });
