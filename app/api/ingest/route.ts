import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { getDb } from "@/lib/db";
import { SOURCES } from "@/lib/sources";
import { verifyCronAuth } from "@/lib/auth";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "TGFI-Monitor/1.0 (Academic Research)",
  },
});

export const maxDuration = 120;

function safeISODate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(request: Request) {
  const authErr = verifyCronAuth(request);
  if (authErr) return authErr;

  const sql = getDb();
  const errors: Array<{ source: string; error: string }> = [];
  let totalFound = 0;
  let totalNew = 0;

  for (const source of SOURCES) {
    try {
      const feed = await parser.parseURL(source.rss_url);
      const items = (feed.items || []).slice(0, 20);
      totalFound += items.length;

      for (const item of items) {
        if (!item.link || !item.title) continue;

        const content =
          item["content:encoded"] ||
          item.content ||
          item.contentSnippet ||
          item.summary ||
          "";

        const wordCount = content.trim().length > 0 ? content.trim().split(/\s+/).length : 0;

        try {
          const result = await sql`
            INSERT INTO articles (source_name, source_url, title, url, published_at, full_text, word_count)
            VALUES (
              ${source.name},
              ${source.rss_url},
              ${item.title},
              ${item.link},
              ${safeISODate(item.pubDate)},
              ${content || null},
              ${wordCount || null}
            )
            ON CONFLICT (url) DO NOTHING
            RETURNING id
          `;
          if (result.length > 0) totalNew++;
        } catch {
          // duplicate URL, skip silently
        }
      }
    } catch (err) {
      errors.push({
        source: source.name,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  try {
    await sql`
      INSERT INTO ingest_log (sources_checked, articles_found, articles_new, errors)
      VALUES (${SOURCES.length}, ${totalFound}, ${totalNew}, ${JSON.stringify(errors)})
    `;
  } catch (logErr) {
    console.error("Failed to write ingest_log:", logErr);
  }

  return NextResponse.json({
    success: true,
    sources_checked: SOURCES.length,
    articles_found: totalFound,
    articles_new: totalNew,
    errors: errors.length,
    error_details: errors,
  });
}
