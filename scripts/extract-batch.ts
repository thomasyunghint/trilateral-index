/**
 * Batch extraction: process more articles at once than the cron (which does 5 per run).
 * Use this for catching up after backfill.
 *
 * Run: DATABASE_URL="..." ANTHROPIC_API_KEY="..." npx tsx scripts/extract-batch.ts [batch_size]
 * Default batch_size: 30
 */
import { neon } from "@neondatabase/serverless";
import { extractClaims } from "../lib/extractor";
import { requireEnv } from "./utils";

requireEnv("DATABASE_URL", "ANTHROPIC_API_KEY");

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const batchSizeRaw = parseInt(process.argv[2] || "30");
  const batchSize = isNaN(batchSizeRaw) ? 30 : Math.max(1, Math.min(100, batchSizeRaw));

  console.log(`=== BATCH EXTRACTION (${batchSize} articles) ===\n`);

  const pending = await sql`
    SELECT id, source_name, title, full_text, word_count
    FROM articles
    WHERE status = 'pending' AND full_text IS NOT NULL AND word_count > 30
    ORDER BY published_at DESC NULLS LAST
    LIMIT ${batchSize}
  `;

  console.log(`Found ${pending.length} pending articles with content.\n`);

  let extracted = 0;
  let skipped = 0;
  let failed = 0;
  let totalClaims = 0;

  for (const article of pending) {
    const shortTitle = (article.title as string).slice(0, 55);
    try {
      const extraction = await extractClaims(
        article.full_text as string,
        article.title as string,
        article.source_name as string,
      );

      if (extraction.claims.length === 0) {
        await sql`UPDATE articles SET status = 'skipped' WHERE id = ${article.id}`;
        skipped++;
        console.log(`  SKIP: "${shortTitle}" (${article.source_name})`);
        continue;
      }

      for (const claim of extraction.claims) {
        await sql`
          INSERT INTO claims (article_id, claim_text, claim_type, direction, verbatim_quote,
            bucket_trade, bucket_investment, bucket_technology, bucket_finance, bucket_leverage, bucket_policy, pairs)
          VALUES (${article.id}, ${claim.text}, ${claim.type}, ${claim.direction}, ${claim.quote},
            ${extraction.bucket_weights.trade}, ${extraction.bucket_weights.investment},
            ${extraction.bucket_weights.technology}, ${extraction.bucket_weights.finance},
            ${extraction.bucket_weights.leverage}, ${extraction.bucket_weights.policy},
            ${extraction.pairs})
        `;
      }

      await sql`UPDATE articles SET status = 'extracted' WHERE id = ${article.id}`;
      extracted++;
      totalClaims += extraction.claims.length;
      console.log(`  ${extraction.claims.length} claims: "${shortTitle}" (${article.source_name}) → ${extraction.pairs.join(",")}`);
    } catch (err) {
      await sql`UPDATE articles SET status = 'failed' WHERE id = ${article.id}`;
      failed++;
      console.log(`  FAIL: "${shortTitle}" - ${(err as Error).message?.slice(0, 50)}`);
    }
  }

  const [a] = await sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'extracted') as extracted, COUNT(*) FILTER (WHERE status = 'skipped') as skipped, COUNT(*) FILTER (WHERE status = 'pending') as pending FROM articles`;
  const [c] = await sql`SELECT COUNT(*) as total FROM claims`;

  console.log(`\n=== BATCH COMPLETE ===`);
  console.log(`This run: ${extracted} extracted, ${skipped} skipped, ${failed} failed, ${totalClaims} new claims`);
  console.log(`DB: ${a.total} articles (${a.extracted} extracted, ${a.skipped} skipped, ${a.pending} pending)`);
  console.log(`Claims: ${c.total} total`);
}

main().catch(console.error);
