/**
 * Sources — live feed of recent ingests per source.
 * Server component: queries DB for last 10 articles per source.
 */
import Link from "next/link";
import { getDb } from "@/lib/db";
import { SOURCES } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Sources — TGFI",
};

const TIER_LABELS: Record<string, { tier: string; description: string }> = {
  NBER: { tier: "T1 Academic", description: "National Bureau of Economic Research" },
  BIS: { tier: "T1 Academic", description: "Bank for International Settlements" },
  Bruegel: { tier: "T1 Advisory", description: "European economic policy think tank" },
  MERICS: { tier: "T1 Advisory", description: "Mercator Institute for China Studies" },
  PIIE: { tier: "T1 Advisory", description: "Peterson Institute for International Economics · 403-blocked, RSS only" },
  "Rhodium Group": { tier: "T1 Advisory", description: "China-focused research firm" },
  RAND: { tier: "T1 Advisory", description: "RAND Corporation · 403-blocked, RSS only" },
  ECFR: { tier: "T2 Policy", description: "European Council on Foreign Relations" },
  "CF40 Research": { tier: "T2 Policy", description: "China Finance 40 Forum" },
};

type ArticleRow = {
  id: string;
  source_name: string;
  title: string;
  url: string;
  published_at: string | null;
  fetched_at: string;
  word_count: number | null;
  status: string;
};

type SourceStats = {
  source_name: string;
  total: number;
  extracted: number;
  with_content: number;
  avg_words: number | null;
  last_ingested: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function SourcesPage() {
  const sql = getDb();

  const stats = (await sql`
    SELECT
      source_name,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE status = 'extracted')::int as extracted,
      COUNT(*) FILTER (WHERE word_count > 100)::int as with_content,
      ROUND(AVG(word_count) FILTER (WHERE word_count > 10))::int as avg_words,
      MAX(fetched_at) as last_ingested
    FROM articles
    GROUP BY source_name
    ORDER BY total DESC
  `) as SourceStats[];

  // Get last 8 articles per source
  const articles = (await sql`
    SELECT
      a.id, a.source_name, a.title, a.url, a.published_at, a.fetched_at,
      a.word_count, a.status
    FROM articles a
    WHERE a.id IN (
      SELECT id FROM (
        SELECT id, source_name,
               ROW_NUMBER() OVER (PARTITION BY source_name ORDER BY fetched_at DESC) as rn
        FROM articles
      ) ranked
      WHERE rn <= 8
    )
    ORDER BY source_name, fetched_at DESC
  `) as ArticleRow[];

  const grouped: Record<string, ArticleRow[]> = {};
  for (const a of articles) {
    if (!grouped[a.source_name]) grouped[a.source_name] = [];
    grouped[a.source_name].push(a);
  }

  // Total counts
  const totalArticles = stats.reduce((s, r) => s + r.total, 0);
  const totalClaims = stats.reduce((s, r) => s + r.extracted, 0);

  return (
    <div>
      <header className="tgfi-masthead">
        <div className="tgfi-container">
          <h1 className="tgfi-masthead-title">Sources</h1>
          <div className="tgfi-masthead-meta">
            <span><span className="live-dot" />Live ingest feed</span>
            <span>{SOURCES.length} active sources</span>
            <span>{totalArticles.toLocaleString()} articles total</span>
            <span>{totalClaims.toLocaleString()} extracted</span>
          </div>
        </div>
      </header>

      <div className="tgfi-container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <section style={{ marginBottom: 48 }}>
          <p style={{
            fontSize: 16, lineHeight: 1.65, color: "rgb(var(--ink-2))",
            fontFamily: "var(--font-playfair-display), Georgia, serif",
            fontStyle: "italic",
            maxWidth: 680,
          }}>
            TGFI ingests from {SOURCES.length} primary sources every 30 minutes. No newspapers,
            no opinion blogs — only T1 academic publishers and T1/T2 policy institutes. Below
            is the live feed, ordered by total ingest volume.
          </p>
        </section>

        {stats.map((stat) => {
          const meta = TIER_LABELS[stat.source_name] || { tier: "—", description: "" };
          const sourceArticles = grouped[stat.source_name] || [];
          return (
            <div key={stat.source_name} className="source-feed-card">
              <div className="source-feed-head">
                <div>
                  <div className="source-feed-name">{stat.source_name}</div>
                  <div style={{
                    fontSize: 12, color: "rgb(var(--ink-3))",
                    marginTop: 4, lineHeight: 1.5,
                  }}>{meta.description}</div>
                </div>
                <span className="source-feed-tier">{meta.tier}</span>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
                margin: "12px 0 16px",
                padding: "12px 0",
                borderBottom: "1px solid rgb(var(--rule-1))",
                fontFamily: "var(--font-jetbrains-mono), monospace",
                fontSize: 11,
                color: "rgb(var(--ink-3))",
              }}>
                <div>
                  <div style={{ fontSize: 18, color: "rgb(var(--ink-1))", fontWeight: 600 }}>
                    {stat.total.toLocaleString()}
                  </div>
                  <div style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Articles</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, color: "rgb(var(--ink-1))", fontWeight: 600 }}>
                    {stat.extracted.toLocaleString()}
                  </div>
                  <div style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Extracted</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, color: "rgb(var(--ink-1))", fontWeight: 600 }}>
                    {stat.avg_words?.toLocaleString() ?? "—"}
                  </div>
                  <div style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Avg words</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, color: "rgb(var(--ink-1))", fontWeight: 600 }}>
                    {formatRelativeTime(stat.last_ingested)}
                  </div>
                  <div style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Last ingest</div>
                </div>
              </div>

              <div style={{
                fontFamily: "var(--font-jetbrains-mono), monospace",
                fontSize: 10, fontWeight: 600,
                letterSpacing: "0.1em", textTransform: "uppercase",
                color: "rgb(var(--ink-4))",
                marginBottom: 8,
              }}>Recent articles</div>

              <div className="source-feed-articles">
                {sourceArticles.length === 0 && (
                  <div style={{ fontSize: 13, color: "rgb(var(--ink-4))" }}>No recent articles.</div>
                )}
                {sourceArticles.map((a) => (
                  <div key={a.id} className="source-feed-article">
                    <span className="source-feed-article-date">
                      {formatDate(a.published_at || a.fetched_at)}
                    </span>
                    <span className="source-feed-article-title">
                      <a href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a>
                      <span style={{
                        marginLeft: 8,
                        fontFamily: "var(--font-jetbrains-mono), monospace",
                        fontSize: 10,
                        color:
                          a.status === "extracted" ? "rgb(var(--coop-1))"
                          : a.status === "skipped" ? "rgb(var(--ink-4))"
                          : a.status === "failed" ? "rgb(var(--conflict-1))"
                          : "rgb(var(--accent-1))",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}>
                        {a.status}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="tgfi-footer">
        <div className="tgfi-container">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>TGFI Sources · Updated continuously</span>
            <span>
              <Link href="/">← Back to signals</Link>
              <span style={{ margin: "0 12px", color: "rgb(var(--ink-5))" }}>·</span>
              <Link href="/methodology">Methodology</Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
