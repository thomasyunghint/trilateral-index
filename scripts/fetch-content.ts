/**
 * Fetch full text for articles that only have title/link (no content).
 * This fixes Bruegel (342 empty) and Rhodium (100 empty) from backfill.
 *
 * Strategy: fetch each article's URL, parse HTML, extract main content.
 *
 * Run: DATABASE_URL="..." npx tsx scripts/fetch-content.ts [--source="Bruegel"] [--limit=50]
 */
import { neon } from "@neondatabase/serverless";
import * as cheerio from "cheerio";

const sql = neon(process.env.DATABASE_URL!);
const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Extract main article text from HTML.
 * Tries multiple selectors common across think tank sites.
 */
function extractContent(html: string, url: string): string {
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, header, footer, .sidebar, .menu, .cookie, .share, .related, .newsletter, .comments, aside").remove();

  // Source-specific selectors
  const selectors = [
    // Bruegel
    ".field--name-body",
    ".node__content .body",
    "article .body",
    ".publication-body",
    ".post-content",
    // Rhodium
    ".entry-content",
    ".post-body",
    ".article-content",
    ".content-body",
    // Generic think tank
    "article .content",
    ".article-body",
    ".main-content article",
    "[role='main'] article",
    "main article",
    ".wysiwyg",
    // Fallback
    "article",
    "main",
    ".content",
  ];

  for (const selector of selectors) {
    const el = $(selector);
    if (el.length > 0) {
      const text = el.text().replace(/\s+/g, " ").trim();
      if (text.length > 200) return text;
    }
  }

  // Last resort: all paragraphs
  const paragraphs = $("p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(t => t.length > 50)
    .join(" ");

  return paragraphs;
}

async function fetchArticleContent(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "TGFI-Monitor/1.0 (Academic Research; contact: yunghint@asu.edu)",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const content = extractContent(html, url);
    return content.length > 100 ? content : null;
  } catch {
    return null;
  }
}

async function main() {
  const filterSource = process.argv.find(a => a.startsWith("--source="))?.split("=")[1];
  const limit = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] || "50");

  console.log("=== FETCH MISSING CONTENT ===");
  console.log(`Source: ${filterSource || "ALL"} | Limit: ${limit}\n`);

  // Find articles with no/minimal content
  const empty = filterSource
    ? await sql`
        SELECT id, url, source_name, title
        FROM articles
        WHERE (full_text IS NULL OR word_count < 100)
          AND source_name = ${filterSource}
        ORDER BY published_at DESC NULLS LAST
        LIMIT ${limit}
      `
    : await sql`
        SELECT id, url, source_name, title
        FROM articles
        WHERE (full_text IS NULL OR word_count < 100)
        ORDER BY published_at DESC NULLS LAST
        LIMIT ${limit}
      `;

  console.log(`Found ${empty.length} articles with missing content.\n`);

  let fetched = 0;
  let failed = 0;

  for (const article of empty) {
    const shortTitle = (article.title as string).slice(0, 55);
    const content = await fetchArticleContent(article.url as string);

    if (content) {
      const wordCount = content.split(/\s+/).length;
      await sql`
        UPDATE articles
        SET full_text = ${content}, word_count = ${wordCount}, status = 'pending'
        WHERE id = ${article.id}
      `;
      fetched++;
      console.log(`  OK (${wordCount}w): "${shortTitle}" [${article.source_name}]`);
    } else {
      failed++;
      console.log(`  FAIL: "${shortTitle}" [${article.source_name}]`);
    }

    await sleep(DELAY_MS);
  }

  // Audit
  const [before] = await sql`SELECT COUNT(*) as n FROM articles WHERE word_count < 10 OR full_text IS NULL`;
  const [after] = await sql`SELECT source_name, AVG(word_count)::int as avg, COUNT(*) FILTER (WHERE word_count > 100) as good FROM articles WHERE source_name IN ('Bruegel', 'Rhodium Group') GROUP BY source_name`;

  console.log(`\n=== RESULTS ===`);
  console.log(`Fetched: ${fetched} | Failed: ${failed}`);
  console.log(`Still empty in DB: ${before.n}`);
}

main().catch(console.error);
