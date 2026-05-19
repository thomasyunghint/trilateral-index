/**
 * Extract claims from a specific source (or list of sources).
 * Useful for targeted extraction to rebalance claim distribution.
 *
 * Run: DATABASE_URL="..." ANTHROPIC_API_KEY="..." npx tsx scripts/extract-source.ts "Bruegel" [limit]
 * Run: DATABASE_URL="..." ANTHROPIC_API_KEY="..." npx tsx scripts/extract-source.ts "Bruegel,BIS,NBER" 30
 */
import { neon } from "@neondatabase/serverless";
import { extractClaims } from "../lib/extractor";
import { requireEnv } from "./utils";

requireEnv("DATABASE_URL", "ANTHROPIC_API_KEY");

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const sourceArg = process.argv[2] || "Bruegel";
  const limit = parseInt(process.argv[3] || "30");
  const sources = sourceArg.split(",").map(s => s.trim());

  console.log(`=== TARGETED EXTRACTION ===`);
  console.log(`Sources: ${sources.join(", ")} | Limit: ${limit}\n`);

  // Atomically claim articles (prevents race with concurrent cron + scripts)
  const pending = await sql`
    UPDATE articles
    SET status = 'processing'
    WHERE id IN (
      SELECT id FROM articles
      WHERE status = 'pending'
        AND full_text IS NOT NULL
        AND word_count > 100
        AND source_name = ANY(${sources})
      ORDER BY word_count DESC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, source_name, title, full_text, word_count
  `;

  console.log(`Found ${pending.length} pending articles.\n`);

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
        console.log(`  SKIP: "${shortTitle}" [${article.source_name}]`);
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
      console.log(`  ${extraction.claims.length} claims: "${shortTitle}" [${article.source_name}] → ${extraction.pairs.join(",")}`);
    } catch (err) {
      await sql`UPDATE articles SET status = 'failed' WHERE id = ${article.id}`;
      failed++;
      console.log(`  FAIL: "${shortTitle}" - ${(err as Error).message?.slice(0, 50)}`);
    }
  }

  // Report
  const [stats] = await sql`
    SELECT COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'extracted') as extracted,
      COUNT(*) FILTER (WHERE status = 'pending' AND word_count > 100) as pending_with_content
    FROM articles WHERE source_name = ANY(${sources})
  `;
  const [claimStats] = await sql`SELECT COUNT(*) as total FROM claims`;

  console.log(`\n=== BATCH COMPLETE ===`);
  console.log(`This run: ${extracted} extracted, ${skipped} skipped, ${failed} failed, +${totalClaims} claims`);
  console.log(`Sources: ${stats.total} total articles (${stats.extracted} extracted, ${stats.pending_with_content} still pending w/ content)`);
  console.log(`Total claims in DB: ${claimStats.total}`);
}

main().catch(console.error);
