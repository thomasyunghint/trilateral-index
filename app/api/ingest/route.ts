import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { getDb } from "@/lib/db";
import { SOURCES } from "@/lib/sources";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "TGFI-Monitor/1.0 (Academic Research; contact: yunghint@asu.edu)",
  },
});

export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

        const wordCount = content.split(/\s+/).length;

        try {
          const result = await sql`
            INSERT INTO articles (source_name, source_url, title, url, published_at, full_text, word_count)
            VALUES (
              ${source.name},
              ${source.rss_url},
              ${item.title},
              ${item.link},
              ${item.pubDate ? new Date(item.pubDate).toISOString() : null},
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

  await sql`
    INSERT INTO ingest_log (sources_checked, articles_found, articles_new, errors)
    VALUES (${SOURCES.length}, ${totalFound}, ${totalNew}, ${JSON.stringify(errors)})
  `;

  return NextResponse.json({
    success: true,
    sources_checked: SOURCES.length,
    articles_found: totalFound,
    articles_new: totalNew,
    errors: errors.length,
    error_details: errors,
  });
}
