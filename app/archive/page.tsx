import { Archive, Clock, Filter } from "lucide-react";
import { QUARTERLY_PAIR_SCORES, MOCK_SUMMARY } from "@/lib/mock-data";

// Article counts per quarter (estimated from pipeline throughput)
const ARTICLE_COUNTS: Record<string, number> = {
  "2024-Q2": 115, "2024-Q3": 128, "2024-Q4": 141,
  "2025-Q1": 156, "2025-Q2": 172, "2025-Q3": 195,
  "2025-Q4": 218, "2026-Q1": MOCK_SUMMARY.overall.totalArticles,
};

// Derive headline TGFI per quarter from pair scores — single source of truth
const QUARTERS = [...QUARTERLY_PAIR_SCORES]
  .map((q, i, arr) => {
    const s = q.scores;
    const score = Math.round(((s["CN-US"] + s["CN-EU"] + s["US-EU"]) / 3) * 10) / 10;
    return {
      period: q.period,
      score,
      articles: ARTICLE_COUNTS[q.period] ?? 100,
      status: i === arr.length - 1 ? "current" as const : "complete" as const,
    };
  })
  .reverse(); // most recent first

function scoreColor(score: number): string {
  if (score >= 10) return "text-cooperation";
  if (score > -10) return "text-neutral";
  return "text-conflict";
}

export default function ArchivePage() {
  return (
    <div className="min-h-screen">
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
            <Archive size={12} />
            <span>Historical Data</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-text-primary">
            Archive
          </h1>
          <p className="mt-4 text-base text-text-secondary max-w-2xl leading-relaxed">
            Quarterly TGFI scores, classified articles, and source data.
            Each period preserves the full analytical pipeline output.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-text-primary">Quarterly Index</h2>
          <button className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors px-2 py-1 rounded border border-border">
            <Filter size={12} />
            Filter
          </button>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-5 gap-4 px-4 py-2 text-xs text-text-muted border-b border-border">
          <span>Period</span>
          <span>TGFI Score</span>
          <span>Articles</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {QUARTERS.map((q) => (
            <div
              key={q.period}
              className="grid grid-cols-5 gap-4 px-4 py-3 text-sm hover:bg-bg-hover/30 transition-colors"
            >
              <span className="font-mono text-text-primary flex items-center gap-2">
                <Clock size={12} className="text-text-muted" />
                {q.period}
              </span>
              <span className={`font-mono score-value ${scoreColor(q.score)}`}>
                {q.score > 0 ? "+" : ""}{q.score.toFixed(1)}
              </span>
              <span className="font-mono text-text-secondary">{q.articles}</span>
              <span>
                {q.status === "current" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
                    Live
                  </span>
                ) : (
                  <span className="text-xs text-text-muted">Complete</span>
                )}
              </span>
              <span className="text-right">
                <button className="text-xs text-text-muted hover:text-accent transition-colors">
                  View
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-xs text-text-muted">
          Data retention: all periods preserved with full article classifications and scores.
        </div>
      </footer>
    </div>
  );
}
