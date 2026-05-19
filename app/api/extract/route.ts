import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { extractClaims } from "@/lib/extractor";
import { verifyCronAuth } from "@/lib/auth";

export const maxDuration = 300;

// 10 articles per 30min cron = 480/day max throughput
// Cost: ~$0.003/article * 10 = $0.03/run * 48 runs/day = $1.44/day = ~$43/month
const BATCH_SIZE = 10;
const MAX_CLAIMS_PER_ARTICLE = 30;

export async function GET(request: Request) {
  const authErr = verifyCronAuth(request);
  if (authErr) return authErr;

  const sql = getDb();

  // Recovery: roll back any articles stuck in 'processing' for >10 minutes
  // (worker crashed before completing). Uses fetched_at as the change timestamp.
  await sql`
    UPDATE articles
    SET status = 'pending'
    WHERE status = 'processing'
      AND fetched_at < NOW() - INTERVAL '10 minutes'
  `;

  // Atomically claim articles by transitioning pending → processing
  // FOR UPDATE SKIP LOCKED prevents two concurrent workers from picking the same row
  // (handles cron + manual batch scripts running in parallel)
  const pending = await sql`
    UPDATE articles
    SET status = 'processing'
    WHERE id IN (
      SELECT id FROM articles
      WHERE status = 'pending'
        AND full_text IS NOT NULL
        AND word_count > 50
      ORDER BY fetched_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, source_name, title, full_text, word_count
  `;

  if (pending.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: "No pending articles" });
  }

  let processed = 0;
  let failed = 0;
  const results: Array<{ article_id: string; claims_count: number }> = [];

  for (const article of pending) {
    try {
      const extraction = await extractClaims(
        article.full_text,
        article.title,
        article.source_name,
      );

      if (extraction.claims.length === 0) {
        await sql`UPDATE articles SET status = 'skipped' WHERE id = ${article.id}`;
        processed++;
        results.push({ article_id: article.id, claims_count: 0 });
        continue;
      }

      // Cap claims per article to prevent runaway inserts
      const claims = extraction.claims.slice(0, MAX_CLAIMS_PER_ARTICLE);
      for (const claim of claims) {
        await sql`
          INSERT INTO claims (
            article_id, claim_text, claim_type, direction, verbatim_quote,
            bucket_trade, bucket_investment, bucket_technology,
            bucket_finance, bucket_leverage, bucket_policy, pairs
          ) VALUES (
            ${article.id},
            ${claim.text},
            ${claim.type},
            ${claim.direction},
            ${claim.quote},
            ${extraction.bucket_weights.trade},
            ${extraction.bucket_weights.investment},
            ${extraction.bucket_weights.technology},
            ${extraction.bucket_weights.finance},
            ${extraction.bucket_weights.leverage},
            ${extraction.bucket_weights.policy},
            ${extraction.pairs}
          )
        `;
      }

      await sql`UPDATE articles SET status = 'extracted' WHERE id = ${article.id}`;
      processed++;
      results.push({ article_id: article.id, claims_count: extraction.claims.length });
    } catch (err) {
      await sql`UPDATE articles SET status = 'failed' WHERE id = ${article.id}`;
      failed++;
      console.error(`Extraction failed for ${article.id}:`, err);
    }
  }

  return NextResponse.json({
    success: true,
    processed,
    failed,
    results,
  });
}
