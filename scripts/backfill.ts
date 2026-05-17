/**
 * Historical Backfill Script
 * Fetches older articles from source archives (beyond what RSS provides).
 *
 * Strategy per source type:
 * - WordPress feeds (ECFR, Atlantic Council, ECIPE, Rhodium): ?paged=N on RSS
 * - Substack (CF40): /archive page pagination
 * - Custom archives (MERICS, Bruegel, PIIE, BIS, NBER, RAND): HTML scraping
 *
 * Run: DATABASE_URL="..." npx tsx scripts/backfill.ts
 * Optional: DATABASE_URL="..." npx tsx scripts/backfill.ts --source="MERICS"
 */
import { neon } from "@neondatabase/serverless";
import Parser from "rss-parser";
import * as cheerio from "cheerio";

const sql = neon(process.env.DATABASE_URL!);
const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "TGFI-Monitor/1.0 (Academic Research; contact: yunghint@asu.edu)" },
});

const DELAY_MS = 1500; // polite crawling delay
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function insertArticle(source: string, title: string, url: string, publishedAt: string | null, content: string | null) {
  const wordCount = content ? content.split(/\s+/).length : 0;
  try {
    const result = await sql`
      INSERT INTO articles (source_name, source_url, title, url, published_at, full_text, word_count)
      VALUES (${source}, ${'backfill'}, ${title}, ${url},
        ${publishedAt}, ${content || null}, ${wordCount || null})
      ON CONFLICT (url) DO NOTHING
      RETURNING id
    `;
    return result.length > 0;
  } catch {
    return false;
  }
}

// === WORDPRESS RSS PAGINATION ===
// WordPress feeds support ?paged=2, ?paged=3 etc.
async function backfillWordPressFeed(name: string, baseUrl: string, maxPages: number = 10) {
  console.log(`\n--- ${name} (WordPress RSS pagination) ---`);
  let totalNew = 0;

  for (let page = 2; page <= maxPages; page++) {
    const url = baseUrl.includes("?") ? `${baseUrl}&paged=${page}` : `${baseUrl}?paged=${page}`;
    try {
      const feed = await parser.parseURL(url);
      if (!feed.items || feed.items.length === 0) {
        console.log(`  Page ${page}: empty, stopping.`);
        break;
      }

      let pageNew = 0;
      for (const item of feed.items) {
        if (!item.link || !item.title) continue;
        const content = item["content:encoded"] || item.content || item.contentSnippet || item.summary || "";
        const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : null;
        const added = await insertArticle(name, item.title, item.link, pubDate, content);
        if (added) pageNew++;
      }

      console.log(`  Page ${page}: ${feed.items.length} items, ${pageNew} new`);
      totalNew += pageNew;
      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`  Page ${page}: ERROR - ${(err as Error).message?.slice(0, 60)}`);
      break; // likely hit end of archive
    }
  }

  console.log(`  Total new from ${name}: ${totalNew}`);
  return totalNew;
}

// === SUBSTACK ARCHIVE (CF40) ===
async function backfillSubstack(name: string, subdomain: string, maxPages: number = 10) {
  console.log(`\n--- ${name} (Substack archive) ---`);
  let totalNew = 0;
  let offset = 0;
  const limit = 12;

  for (let page = 0; page < maxPages; page++) {
    const url = `https://${subdomain}.substack.com/api/v1/archive?sort=new&search=&offset=${offset}&limit=${limit}`;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "TGFI-Monitor/1.0 (Academic Research)" }
      });
      if (!resp.ok) {
        console.log(`  Page ${page}: HTTP ${resp.status}, stopping.`);
        break;
      }
      const posts = await resp.json() as Array<{
        title: string;
        canonical_url: string;
        post_date: string;
        body_text?: string;
        subtitle?: string;
        description?: string;
      }>;

      if (posts.length === 0) {
        console.log(`  Page ${page}: empty, stopping.`);
        break;
      }

      let pageNew = 0;
      for (const post of posts) {
        const content = post.body_text || post.subtitle || post.description || "";
        const added = await insertArticle(
          name,
          post.title,
          post.canonical_url,
          post.post_date ? new Date(post.post_date).toISOString() : null,
          content
        );
        if (added) pageNew++;
      }

      console.log(`  Offset ${offset}: ${posts.length} posts, ${pageNew} new`);
      totalNew += pageNew;
      offset += limit;
      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`  Offset ${offset}: ERROR - ${(err as Error).message?.slice(0, 60)}`);
      break;
    }
  }

  console.log(`  Total new from ${name}: ${totalNew}`);
  return totalNew;
}

// === MERICS PUBLICATIONS ===
async function backfillMerics(maxPages: number = 15) {
  console.log(`\n--- MERICS (HTML scraping) ---`);
  let totalNew = 0;

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://merics.org/en/publications?page=${page}`;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "TGFI-Monitor/1.0 (Academic Research)" }
      });
      if (!resp.ok) break;
      const html = await resp.text();
      const $ = cheerio.load(html);

      const articles = $("article, .views-row, .node--type-publication, .teaser");
      if (articles.length === 0) {
        // try alternate selectors
        const links = $("a[href*='/en/']").filter((_, el) => {
          const href = $(el).attr("href") || "";
          return href.includes("/comment/") || href.includes("/report/") || href.includes("/brief/");
        });
        if (links.length === 0) {
          console.log(`  Page ${page}: no articles found, stopping.`);
          break;
        }

        let pageNew = 0;
        links.each((_, el) => {
          const href = $(el).attr("href") || "";
          const title = $(el).text().trim();
          if (title && href) {
            const fullUrl = href.startsWith("http") ? href : `https://merics.org${href}`;
            // queue for insertion (async inside each is tricky, handle below)
          }
        });
      }

      let pageNew = 0;
      for (const el of articles.toArray()) {
        const $el = $(el);
        const linkEl = $el.find("a").first();
        const title = $el.find("h2, h3, .field--name-title").first().text().trim() || linkEl.text().trim();
        const href = linkEl.attr("href") || "";
        if (!title || !href) continue;

        const fullUrl = href.startsWith("http") ? href : `https://merics.org${href}`;
        const dateText = $el.find("time, .date, .field--name-created").first().attr("datetime") ||
                         $el.find("time, .date").first().text().trim();
        const pubDate = dateText ? new Date(dateText).toISOString() : null;
        const snippet = $el.find(".field--name-body, .summary, p").first().text().trim();

        const added = await insertArticle("MERICS", title, fullUrl, pubDate, snippet);
        if (added) pageNew++;
      }

      console.log(`  Page ${page}: ${articles.length} items, ${pageNew} new`);
      totalNew += pageNew;
      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`  Page ${page}: ERROR - ${(err as Error).message?.slice(0, 60)}`);
      break;
    }
  }

  console.log(`  Total new from MERICS: ${totalNew}`);
  return totalNew;
}

// === BRUEGEL PUBLICATIONS ===
async function backfillBruegel(maxPages: number = 20) {
  console.log(`\n--- Bruegel (HTML scraping) ---`);
  let totalNew = 0;

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://www.bruegel.org/publications?page=${page}`;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "TGFI-Monitor/1.0 (Academic Research)" }
      });
      if (!resp.ok) break;
      const html = await resp.text();
      const $ = cheerio.load(html);

      const articles = $(".views-row, article, .node, .publication-item, .teaser");
      if (articles.length === 0) {
        console.log(`  Page ${page}: no articles, stopping.`);
        break;
      }

      let pageNew = 0;
      for (const el of articles.toArray()) {
        const $el = $(el);
        const linkEl = $el.find("a").first();
        const title = $el.find("h2, h3, .title").first().text().trim() || linkEl.text().trim();
        const href = linkEl.attr("href") || "";
        if (!title || !href) continue;

        const fullUrl = href.startsWith("http") ? href : `https://www.bruegel.org${href}`;
        const dateText = $el.find("time, .date, .meta-date").first().text().trim();
        const pubDate = dateText ? new Date(dateText).toISOString() : null;
        const snippet = $el.find(".summary, .description, p").first().text().trim();

        const added = await insertArticle("Bruegel", title, fullUrl, pubDate, snippet);
        if (added) pageNew++;
      }

      console.log(`  Page ${page}: ${articles.length} items, ${pageNew} new`);
      totalNew += pageNew;
      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`  Page ${page}: ERROR - ${(err as Error).message?.slice(0, 60)}`);
      break;
    }
  }

  console.log(`  Total new from Bruegel: ${totalNew}`);
  return totalNew;
}

// === PIIE PUBLICATIONS ===
async function backfillPiie(maxPages: number = 15) {
  console.log(`\n--- PIIE (HTML scraping) ---`);
  let totalNew = 0;

  for (let page = 0; page < maxPages; page++) {
    const url = `https://www.piie.com/research/publications?page=${page}`;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "TGFI-Monitor/1.0 (Academic Research)" }
      });
      if (!resp.ok) break;
      const html = await resp.text();
      const $ = cheerio.load(html);

      const articles = $(".views-row, article, .node, .publication-row");
      if (articles.length === 0) {
        console.log(`  Page ${page}: no articles, stopping.`);
        break;
      }

      let pageNew = 0;
      for (const el of articles.toArray()) {
        const $el = $(el);
        const linkEl = $el.find("a").first();
        const title = $el.find("h2, h3, .title").first().text().trim() || linkEl.text().trim();
        const href = linkEl.attr("href") || "";
        if (!title || !href) continue;

        const fullUrl = href.startsWith("http") ? href : `https://www.piie.com${href}`;
        const dateText = $el.find("time, .date, .field--name-field-date").first().text().trim();
        const pubDate = dateText ? new Date(dateText).toISOString() : null;
        const snippet = $el.find(".body, .summary, .teaser, p").first().text().trim();

        const added = await insertArticle("PIIE", title, fullUrl, pubDate, snippet);
        if (added) pageNew++;
      }

      console.log(`  Page ${page}: ${articles.length} items, ${pageNew} new`);
      totalNew += pageNew;
      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`  Page ${page}: ERROR - ${(err as Error).message?.slice(0, 60)}`);
      break;
    }
  }

  console.log(`  Total new from PIIE: ${totalNew}`);
  return totalNew;
}

// === BIS WORKING PAPERS ===
async function backfillBis(maxPages: number = 10) {
  console.log(`\n--- BIS (HTML scraping) ---`);
  let totalNew = 0;

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://www.bis.org/doclist/wppubls.htm?from=&till=&objid=wppubls&page=${page}&paging_length=25&sort_list=date_desc&theme=wppubls&ml=false&mlurl=&suburl=`;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "TGFI-Monitor/1.0 (Academic Research)" }
      });
      if (!resp.ok) break;
      const html = await resp.text();
      const $ = cheerio.load(html);

      const items = $(".documentList tbody tr, .doc_list tbody tr, .list_item, .documentList .item");
      if (items.length === 0) {
        // BIS might use different structure
        const links = $("a[href*='/publ/work']");
        if (links.length === 0) {
          console.log(`  Page ${page}: no items found, stopping.`);
          break;
        }

        let pageNew = 0;
        for (const el of links.toArray()) {
          const $el = $(el);
          const title = $el.text().trim();
          const href = $el.attr("href") || "";
          if (!title || !href || title.length < 10) continue;

          const fullUrl = href.startsWith("http") ? href : `https://www.bis.org${href}`;
          const added = await insertArticle("BIS", title, fullUrl, null, null);
          if (added) pageNew++;
        }

        console.log(`  Page ${page}: ${links.length} links, ${pageNew} new`);
        totalNew += pageNew;
      } else {
        let pageNew = 0;
        for (const el of items.toArray()) {
          const $el = $(el);
          const linkEl = $el.find("a").first();
          const title = linkEl.text().trim();
          const href = linkEl.attr("href") || "";
          if (!title || !href) continue;

          const fullUrl = href.startsWith("http") ? href : `https://www.bis.org${href}`;
          const dateText = $el.find(".item_date, td:last-child").text().trim();
          const pubDate = dateText ? new Date(dateText).toISOString() : null;

          const added = await insertArticle("BIS", title, fullUrl, pubDate, null);
          if (added) pageNew++;
        }

        console.log(`  Page ${page}: ${items.length} items, ${pageNew} new`);
        totalNew += pageNew;
      }

      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`  Page ${page}: ERROR - ${(err as Error).message?.slice(0, 60)}`);
      break;
    }
  }

  console.log(`  Total new from BIS: ${totalNew}`);
  return totalNew;
}

// === NBER WORKING PAPERS ===
async function backfillNber(maxPages: number = 10) {
  console.log(`\n--- NBER (API) ---`);
  let totalNew = 0;

  // NBER has a papers listing page
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://www.nber.org/papers?page=${page}&perPage=50&sortBy=public_date`;
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "TGFI-Monitor/1.0 (Academic Research)",
          "Accept": "text/html"
        }
      });
      if (!resp.ok) {
        console.log(`  Page ${page}: HTTP ${resp.status}, stopping.`);
        break;
      }
      const html = await resp.text();
      const $ = cheerio.load(html);

      const papers = $(".digest-card, .paper-card, article, .citation");
      if (papers.length === 0) {
        const links = $("a[href*='/papers/w']");
        if (links.length === 0) {
          console.log(`  Page ${page}: no papers found, stopping.`);
          break;
        }

        let pageNew = 0;
        for (const el of links.toArray()) {
          const $el = $(el);
          const title = $el.text().trim();
          const href = $el.attr("href") || "";
          if (!title || !href || title.length < 10) continue;

          const fullUrl = href.startsWith("http") ? href : `https://www.nber.org${href}`;
          const added = await insertArticle("NBER", title, fullUrl, null, null);
          if (added) pageNew++;
        }
        console.log(`  Page ${page}: ${links.length} links, ${pageNew} new`);
        totalNew += pageNew;
      } else {
        let pageNew = 0;
        for (const el of papers.toArray()) {
          const $el = $(el);
          const linkEl = $el.find("a").first();
          const title = $el.find("h3, h4, .title").first().text().trim() || linkEl.text().trim();
          const href = linkEl.attr("href") || "";
          if (!title || !href) continue;

          const fullUrl = href.startsWith("http") ? href : `https://www.nber.org${href}`;
          const dateText = $el.find(".date, time").first().text().trim();
          const pubDate = dateText ? new Date(dateText).toISOString() : null;
          const snippet = $el.find(".description, .abstract, p").first().text().trim();

          const added = await insertArticle("NBER", title, fullUrl, pubDate, snippet || null);
          if (added) pageNew++;
        }
        console.log(`  Page ${page}: ${papers.length} papers, ${pageNew} new`);
        totalNew += pageNew;
      }

      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`  Page ${page}: ERROR - ${(err as Error).message?.slice(0, 60)}`);
      break;
    }
  }

  console.log(`  Total new from NBER: ${totalNew}`);
  return totalNew;
}

// === RAND PUBLICATIONS ===
async function backfillRand(maxPages: number = 10) {
  console.log(`\n--- RAND (HTML scraping) ---`);
  let totalNew = 0;

  for (let page = 1; page <= maxPages; page++) {
    // RAND search with China/trade filter
    const url = `https://www.rand.org/search.html?query=china+trade+technology&sortBy=relevance&page=${page}`;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "TGFI-Monitor/1.0 (Academic Research)" }
      });
      if (!resp.ok) break;
      const html = await resp.text();
      const $ = cheerio.load(html);

      const results = $(".search-result, .result-item, article, .text");
      if (results.length === 0) {
        console.log(`  Page ${page}: no results, stopping.`);
        break;
      }

      let pageNew = 0;
      for (const el of results.toArray()) {
        const $el = $(el);
        const linkEl = $el.find("a").first();
        const title = $el.find("h3, h2, .title").first().text().trim() || linkEl.text().trim();
        const href = linkEl.attr("href") || "";
        if (!title || !href || title.length < 10) continue;

        const fullUrl = href.startsWith("http") ? href : `https://www.rand.org${href}`;
        const snippet = $el.find("p, .description, .body").first().text().trim();
        const dateText = $el.find(".date, time, .meta").first().text().trim();
        const pubDate = dateText ? new Date(dateText).toISOString() : null;

        const added = await insertArticle("RAND", title, fullUrl, pubDate, snippet || null);
        if (added) pageNew++;
      }

      console.log(`  Page ${page}: ${results.length} results, ${pageNew} new`);
      totalNew += pageNew;
      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`  Page ${page}: ERROR - ${(err as Error).message?.slice(0, 60)}`);
      break;
    }
  }

  console.log(`  Total new from RAND: ${totalNew}`);
  return totalNew;
}

// === MAIN ===
async function main() {
  const filterSource = process.argv.find(a => a.startsWith("--source="))?.split("=")[1];

  console.log("=== TGFI HISTORICAL BACKFILL ===");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Filter: ${filterSource || "ALL"}\n`);

  let grandTotal = 0;

  const tasks: Array<{ name: string; fn: () => Promise<number> }> = [
    { name: "ECFR", fn: () => backfillWordPressFeed("ECFR", "https://ecfr.eu/feed/", 15) },
    { name: "Atlantic Council GCH", fn: () => backfillWordPressFeed("Atlantic Council GCH", "https://www.atlanticcouncil.org/programs/global-china-hub/feed/", 15) },
    { name: "ECIPE", fn: () => backfillWordPressFeed("ECIPE", "https://ecipe.org/feed/", 10) },
    { name: "Rhodium Group", fn: () => backfillWordPressFeed("Rhodium Group", "https://rhg.com/feed", 10) },
    { name: "CF40 Research", fn: () => backfillSubstack("CF40 Research", "cf40research", 15) },
    { name: "MERICS", fn: () => backfillMerics(15) },
    { name: "Bruegel", fn: () => backfillBruegel(20) },
    { name: "PIIE", fn: () => backfillPiie(15) },
    { name: "BIS", fn: () => backfillBis(10) },
    { name: "NBER", fn: () => backfillNber(10) },
    { name: "RAND", fn: () => backfillRand(10) },
  ];

  for (const task of tasks) {
    if (filterSource && task.name !== filterSource) continue;
    try {
      const count = await task.fn();
      grandTotal += count;
    } catch (err) {
      console.log(`\n  FATAL ERROR for ${task.name}: ${(err as Error).message?.slice(0, 80)}`);
    }
  }

  // Final DB status
  const [a] = await sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending FROM articles`;
  const [c] = await sql`SELECT COUNT(*) as total FROM claims`;

  console.log(`\n=== BACKFILL COMPLETE ===`);
  console.log(`New articles added: ${grandTotal}`);
  console.log(`DB total: ${a.total} articles (${a.pending} pending extraction)`);
  console.log(`Claims: ${c.total}`);
}

main().catch(console.error);
