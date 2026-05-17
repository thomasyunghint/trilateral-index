import { neon } from "@neondatabase/serverless";
import { extractClaims } from "../lib/extractor";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const pending = await sql`
    SELECT id, source_name, title, full_text, word_count
    FROM articles
    WHERE status = 'pending' AND full_text IS NOT NULL AND word_count > 30
      AND source_name IN ('MERICS', 'Rhodium Group', 'Bruegel', 'BIS')
    LIMIT 4
  `;

  console.log(`Processing ${pending.length} relevant articles...\n`);

  for (const article of pending) {
    console.log(`"${(article.title as string).slice(0, 70)}" (${article.source_name})`);
    try {
      const extraction = await extractClaims(
        article.full_text as string,
        article.title as string,
        article.source_name as string,
      );

      if (extraction.claims.length === 0) {
        await sql`UPDATE articles SET status = 'skipped' WHERE id = ${article.id}`;
        console.log("  → Skipped (irrelevant)\n");
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
      console.log(`  → ${extraction.claims.length} claims | Pairs: ${extraction.pairs.join(", ")}`);
      console.log(`  Buckets: T=${extraction.bucket_weights.trade} I=${extraction.bucket_weights.investment} Tech=${extraction.bucket_weights.technology} F=${extraction.bucket_weights.finance} L=${extraction.bucket_weights.leverage} P=${extraction.bucket_weights.policy}\n`);
    } catch (err) {
      await sql`UPDATE articles SET status = 'failed' WHERE id = ${article.id}`;
      console.log(`  → FAILED: ${(err as Error).message?.slice(0, 80)}\n`);
    }
  }

  const [a] = await sql`SELECT COUNT(*) FILTER (WHERE status = 'extracted') as extracted FROM articles`;
  const [c] = await sql`SELECT COUNT(*) as total FROM claims`;
  console.log(`\nDB: ${a.extracted} articles extracted, ${c.total} claims stored`);
}

main().catch(console.error);
