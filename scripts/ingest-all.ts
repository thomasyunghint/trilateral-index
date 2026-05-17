import { neon } from "@neondatabase/serverless";
import Parser from "rss-parser";
import { SOURCES } from "../lib/sources";
import { extractClaims } from "../lib/extractor";
import { requireEnv } from "./utils";

requireEnv("DATABASE_URL", "ANTHROPIC_API_KEY");

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const parser = new Parser({
    timeout: 10000,
    headers: { "User-Agent": "TGFI-Monitor/1.0 (Academic Research)" },
  });

  console.log("=== INGESTING ALL SOURCES ===\n");

  let totalNew = 0;
  for (const source of SOURCES) {
    try {
      const feed = await parser.parseURL(source.rss_url);
      const items = (feed.items || []).slice(0, 15);
      let newCount = 0;

      for (const item of items) {
        if (!item.link || !item.title) continue;
        const content = item["content:encoded"] || item.content || item.contentSnippet || item.summary || "";
        const wordCount = content.split(/\s+/).length;

        const result = await sql`
          INSERT INTO articles (source_name, source_url, title, url, published_at, full_text, word_count)
          VALUES (${source.name}, ${source.rss_url}, ${item.title}, ${item.link},
            ${item.pubDate ? new Date(item.pubDate).toISOString() : null},
            ${content || null}, ${wordCount || null})
          ON CONFLICT (url) DO NOTHING
          RETURNING id
        `;
        if (result.length > 0) newCount++;
      }

      console.log(`  ${source.name}: ${newCount} new / ${items.length} items`);
      totalNew += newCount;
    } catch (err) {
      console.log(`  ${source.name}: ERROR - ${(err as Error).message?.slice(0, 50)}`);
    }
  }

  console.log(`\nIngested ${totalNew} new articles.`);

  console.log("\n=== EXTRACTING CLAIMS (batch of 10) ===\n");

  const pending = await sql`
    SELECT id, source_name, title, full_text, word_count
    FROM articles
    WHERE status = 'pending' AND full_text IS NOT NULL AND word_count > 30
    ORDER BY RANDOM()
    LIMIT 10
  `;

  let claimsTotal = 0;
  for (const article of pending) {
    const shortTitle = (article.title as string).slice(0, 60);
    try {
      const extraction = await extractClaims(article.full_text as string, article.title as string, article.source_name as string);

      if (extraction.claims.length === 0) {
        await sql`UPDATE articles SET status = 'skipped' WHERE id = ${article.id}`;
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
      claimsTotal += extraction.claims.length;
      console.log(`  ${extraction.claims.length} claims: "${shortTitle}" (${article.source_name}) → ${extraction.pairs.join(",")}`);
    } catch (err) {
      await sql`UPDATE articles SET status = 'failed' WHERE id = ${article.id}`;
      console.log(`  FAIL: "${shortTitle}" - ${(err as Error).message?.slice(0, 50)}`);
    }
  }

  const [a] = await sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'extracted') as extracted, COUNT(*) FILTER (WHERE status = 'skipped') as skipped FROM articles`;
  const [c] = await sql`SELECT COUNT(*) as total FROM claims`;
  console.log(`\n=== FINAL STATUS ===`);
  console.log(`Articles: ${a.total} total | ${a.extracted} extracted | ${a.skipped} skipped`);
  console.log(`Claims: ${c.total} total (${claimsTotal} new this run)`);
}

main().catch(console.error);
