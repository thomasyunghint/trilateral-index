/**
 * Full integration test: Ingest RSS → Extract claims → Verify in DB
 * Run: DATABASE_URL="..." ANTHROPIC_API_KEY="..." npx tsx scripts/test-full-pipeline.ts
 */
import { neon } from "@neondatabase/serverless";
import Parser from "rss-parser";
import { extractClaims } from "../lib/extractor";
import { SOURCES } from "../lib/sources";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const parser = new Parser({
    timeout: 10000,
    headers: { "User-Agent": "TGFI-Monitor/1.0 (Academic Research; contact: yunghint@asu.edu)" },
  });

  console.log("=== PHASE 1: INGESTION ===\n");

  let totalNew = 0;
  const testSources = SOURCES.slice(0, 5);

  for (const source of testSources) {
    try {
      const feed = await parser.parseURL(source.rss_url);
      const items = (feed.items || []).slice(0, 5);
      let newCount = 0;

      for (const item of items) {
        if (!item.link || !item.title) continue;
        const content = item["content:encoded"] || item.content || item.contentSnippet || item.summary || "";
        const wordCount = content.split(/\s+/).length;

        const result = await sql`
          INSERT INTO articles (source_name, source_url, title, url, published_at, full_text, word_count)
          VALUES (
            ${source.name}, ${source.rss_url}, ${item.title}, ${item.link},
            ${item.pubDate ? new Date(item.pubDate).toISOString() : null},
            ${content || null}, ${wordCount || null}
          )
          ON CONFLICT (url) DO NOTHING
          RETURNING id
        `;
        if (result.length > 0) newCount++;
      }

      console.log(`  ${source.name}: ${items.length} items, ${newCount} new`);
      totalNew += newCount;
    } catch (err) {
      console.log(`  ${source.name}: ERROR - ${(err as Error).message?.slice(0, 60)}`);
    }
  }

  console.log(`\nTotal new articles: ${totalNew}`);

  console.log("\n=== PHASE 2: EXTRACTION (first 2 articles) ===\n");

  const pending = await sql`
    SELECT id, source_name, title, full_text, word_count
    FROM articles
    WHERE status = 'pending' AND full_text IS NOT NULL AND word_count > 50
    ORDER BY fetched_at ASC
    LIMIT 2
  `;

  console.log(`Pending articles with content: ${pending.length}`);

  for (const article of pending) {
    console.log(`\nProcessing: "${article.title}" (${article.source_name})`);

    try {
      const extraction = await extractClaims(article.full_text, article.title, article.source_name);

      if (extraction.claims.length === 0) {
        await sql`UPDATE articles SET status = 'skipped' WHERE id = ${article.id}`;
        console.log("  → Skipped (no relevant claims)");
        continue;
      }

      for (const claim of extraction.claims) {
        await sql`
          INSERT INTO claims (
            article_id, claim_text, claim_type, direction, verbatim_quote,
            bucket_trade, bucket_investment, bucket_technology,
            bucket_finance, bucket_leverage, bucket_policy, pairs
          ) VALUES (
            ${article.id}, ${claim.text}, ${claim.type}, ${claim.direction}, ${claim.quote},
            ${extraction.bucket_weights.trade}, ${extraction.bucket_weights.investment},
            ${extraction.bucket_weights.technology}, ${extraction.bucket_weights.finance},
            ${extraction.bucket_weights.leverage}, ${extraction.bucket_weights.policy},
            ${extraction.pairs}
          )
        `;
      }

      await sql`UPDATE articles SET status = 'extracted' WHERE id = ${article.id}`;
      console.log(`  → ${extraction.claims.length} claims extracted`);
      console.log(`  Buckets: T=${extraction.bucket_weights.trade} I=${extraction.bucket_weights.investment} Tech=${extraction.bucket_weights.technology} F=${extraction.bucket_weights.finance} L=${extraction.bucket_weights.leverage} P=${extraction.bucket_weights.policy}`);
      console.log(`  Pairs: ${extraction.pairs.join(", ")}`);
    } catch (err) {
      await sql`UPDATE articles SET status = 'failed' WHERE id = ${article.id}`;
      console.log(`  → FAILED: ${(err as Error).message?.slice(0, 80)}`);
    }
  }

  console.log("\n=== DATABASE STATUS ===\n");

  const [articles] = await sql`
    SELECT COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'extracted') as extracted,
      COUNT(*) FILTER (WHERE status = 'pending') as pending
    FROM articles
  `;
  const [claims] = await sql`SELECT COUNT(*) as total FROM claims`;

  console.log(`Articles: ${articles.total} total (${articles.extracted} extracted, ${articles.pending} pending)`);
  console.log(`Claims: ${claims.total} total`);
}

main().catch(console.error);
