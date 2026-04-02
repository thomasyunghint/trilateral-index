"use client";

import { useState, useMemo } from "react";
import type { Bucket, BilateralPair } from "@/lib/types";
import { ScoreBadge, getScoreColor } from "@/components/score-badge";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  Filter,
  BarChart3,
  FileText,
  ExternalLink,
  ChevronDown,
} from "lucide-react";

/* ─── Types ─── */
type ReviewStatus = "pending" | "accepted" | "rejected" | "overridden";

interface ClassifiedArticle {
  id: string;
  title: string;
  source: string;
  date: string;
  pair: BilateralPair;
  bucket: Bucket;
  excerpt: string;
  llm: {
    score: number;
    rationale: string;
    keyPhrases: string[];
    confidence: number;
  };
  status: ReviewStatus;
  humanScore: number | null;
  humanNote: string;
}

/* ─── Mock classified articles ─── */
const INITIAL_ARTICLES: ClassifiedArticle[] = [
  // CN-US Trade
  {
    id: "a01",
    title: "The Impact of Section 301 Tariffs on US-China Bilateral Trade Flows",
    source: "NBER Working Paper #31842",
    date: "2026-02",
    pair: "CN-US",
    bucket: "trade",
    excerpt:
      "We estimate that the cumulative effect of Section 301 tariffs reduced US imports from China by 23% relative to the synthetic control, with significant trade diversion toward Vietnam and Mexico.",
    llm: {
      score: -58,
      rationale:
        "Documents major tariff-driven trade decline between US and China. Quantifies 23% reduction in bilateral imports. Clear fragmentation signal.",
      keyPhrases: ["Section 301 tariffs", "23% reduction", "trade diversion", "Vietnam", "Mexico"],
      confidence: 0.94,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a02",
    title: "Quantifying Trade Diversion Effects of the US-China Trade War: 2018\u20132025",
    source: "IMF Working Paper WP/26/045",
    date: "2026-01",
    pair: "CN-US",
    bucket: "trade",
    excerpt:
      "Using a structural gravity model, we find that US-China bilateral trade fell $180B below gravity-predicted levels by 2025, while US-ASEAN trade exceeded predictions by $95B.",
    llm: {
      score: -65,
      rationale:
        "Gravity model analysis shows $180B under-trading vs predicted levels. Strong quantitative evidence of fragmentation. Uses our exact methodological framework.",
      keyPhrases: ["gravity model", "$180B below predicted", "trade war", "ASEAN diversion"],
      confidence: 0.97,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a03",
    title: "Phase One Trade Agreement: Compliance Assessment and Forward Implications",
    source: "PIIE Policy Brief 26-3",
    date: "2026-03",
    pair: "CN-US",
    bucket: "trade",
    excerpt:
      "China fulfilled approximately 58% of its Phase One purchase commitments by end-2025. While below target, the agreement framework prevented further escalation.",
    llm: {
      score: -15,
      rationale:
        "Mixed signal. Partial compliance (58%) suggests ongoing engagement but unfulfilled commitments. Prevented escalation = slight positive, but underperformance = negative. Net slightly negative.",
      keyPhrases: ["Phase One", "58% compliance", "purchase commitments", "prevented escalation"],
      confidence: 0.82,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a04",
    title: "Supply Chain Reorganization Following US-China Decoupling: Evidence from Firm-Level Data",
    source: "NBER Working Paper #32105",
    date: "2025-11",
    pair: "CN-US",
    bucket: "trade",
    excerpt:
      "Using customs transaction data, we document that 34% of US importers who sourced primarily from China in 2017 had diversified to alternative suppliers by 2025.",
    llm: {
      score: -52,
      rationale:
        "34% supplier diversification away from China is a strong fragmentation indicator. Firm-level evidence of structural decoupling, not just price effects.",
      keyPhrases: ["supply chain", "34% diversified", "decoupling", "customs data"],
      confidence: 0.91,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a05",
    title: "US Export Controls on Advanced Semiconductors: Trade Volume Implications",
    source: "BIS Quarterly Review, March 2026",
    date: "2026-03",
    pair: "CN-US",
    bucket: "trade",
    excerpt:
      "US semiconductor exports to China declined 42% following the October 2022 controls. However, total Chinese semiconductor imports remained stable due to substitution from non-US sources.",
    llm: {
      score: -55,
      rationale:
        "42% decline in bilateral semiconductor trade is major. However, China found alternatives, so total supply was maintained. Bilateral fragmentation clear, but systemic impact limited.",
      keyPhrases: ["semiconductor exports", "42% decline", "export controls", "substitution"],
      confidence: 0.89,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  // CN-EU Trade
  {
    id: "a06",
    title: "EU Anti-Subsidy Investigation on Chinese Electric Vehicles: Preliminary Findings",
    source: "OECD Trade Policy Paper No. 289",
    date: "2026-01",
    pair: "CN-EU",
    bucket: "trade",
    excerpt:
      "Provisional countervailing duties of 17\u201338% on Chinese BEV imports were imposed in October 2024. Chinese EV exports to the EU declined 28% in the subsequent two quarters.",
    llm: {
      score: -48,
      rationale:
        "Major trade barrier imposed. 17-38% duties directly reduced EV bilateral trade by 28%. Clear protectionist action and fragmentation signal.",
      keyPhrases: ["anti-subsidy", "countervailing duties", "17-38%", "EV exports", "28% decline"],
      confidence: 0.93,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a07",
    title: "European De-risking Strategy: Rebalancing Trade Dependencies with China",
    source: "Bruegel Working Paper 2026/02",
    date: "2026-02",
    pair: "CN-EU",
    bucket: "trade",
    excerpt:
      "EU import concentration from China in critical raw materials decreased from 62% to 54% between 2022 and 2025, driven by diversification policies and new supplier agreements.",
    llm: {
      score: -32,
      rationale:
        "Gradual reduction in EU dependence on China (62% to 54%). De-risking is a moderate fragmentation signal \u2014 not decoupling, but deliberate diversification.",
      keyPhrases: ["de-risking", "62% to 54%", "critical raw materials", "diversification"],
      confidence: 0.88,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a08",
    title: "China-EU Bilateral Trade in Agricultural Products Under New SPS Standards",
    source: "FAO Trade Policy Technical Note",
    date: "2025-12",
    pair: "CN-EU",
    bucket: "trade",
    excerpt:
      "New EU sanitary and phytosanitary standards reduced Chinese agricultural exports by 12%, though bilateral consultation mechanisms were established to address compliance gaps.",
    llm: {
      score: -18,
      rationale:
        "Moderate negative: new standards reduced trade 12%. But consultation mechanisms suggest willingness to cooperate on resolution. Mixed signal, lean slightly negative.",
      keyPhrases: ["SPS standards", "12% reduction", "agricultural", "consultation mechanisms"],
      confidence: 0.85,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  // US-EU Trade
  {
    id: "a09",
    title: "Transatlantic Critical Minerals Partnership: Trade Flow Analysis",
    source: "PIIE Working Paper 26-4",
    date: "2026-02",
    pair: "US-EU",
    bucket: "trade",
    excerpt:
      "US-EU bilateral trade in critical minerals increased 35% following the Critical Minerals Agreement, with preferential tariff treatment extending to lithium, cobalt, and nickel.",
    llm: {
      score: 55,
      rationale:
        "35% increase in bilateral critical minerals trade plus preferential tariffs is a strong cooperation signal. Deepening trade integration in strategic sector.",
      keyPhrases: ["critical minerals", "35% increase", "preferential tariffs", "lithium", "cobalt"],
      confidence: 0.95,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a10",
    title: "US-EU Trade and Technology Council: Outcomes of the Fifth Ministerial Meeting",
    source: "Brookings Policy Brief",
    date: "2026-01",
    pair: "US-EU",
    bucket: "trade",
    excerpt:
      "The TTC achieved mutual recognition of conformity assessment in three additional sectors, expected to reduce non-tariff trade costs by $2.8B annually.",
    llm: {
      score: 62,
      rationale:
        "Mutual recognition agreements are strong cooperation indicators. $2.8B in reduced trade costs is concrete. TTC framework deepening bilateral economic ties.",
      keyPhrases: ["TTC", "mutual recognition", "$2.8B cost reduction", "conformity assessment"],
      confidence: 0.92,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a11",
    title: "Resolution of the Large Civil Aircraft Dispute: Trade Impact Assessment",
    source: "WTO Dispute Settlement Body Report",
    date: "2025-10",
    pair: "US-EU",
    bucket: "trade",
    excerpt:
      "The 17-year Boeing-Airbus dispute was formally resolved in 2024. Retaliatory tariffs worth $11.5B were permanently removed.",
    llm: {
      score: 72,
      rationale:
        "Permanent removal of $11.5B in retaliatory tariffs after 17-year dispute is a major cooperation milestone. Concrete bilateral trade liberalization.",
      keyPhrases: ["Boeing-Airbus", "$11.5B tariffs removed", "dispute resolution", "17 years"],
      confidence: 0.96,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a12",
    title: "Steel and Aluminum Trade Arrangements: US-EU Section 232 Negotiations",
    source: "NBER Working Paper #31990",
    date: "2025-12",
    pair: "US-EU",
    bucket: "trade",
    excerpt:
      "The tariff-rate quota system replaced blanket 25%/10% tariffs. EU steel exports to the US recovered to 85% of pre-2018 levels by Q4 2025.",
    llm: {
      score: 28,
      rationale:
        "Recovery to 85% of pre-tariff levels is positive but incomplete. TRQ replacement is improvement over blanket tariffs. Moderate cooperation signal.",
      keyPhrases: ["Section 232", "tariff-rate quota", "85% recovery", "steel exports"],
      confidence: 0.87,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  // Intentionally misclassified / edge cases for Thomas to catch
  {
    id: "a13",
    title: "US-China Cultural Exchange Programs: Trends in Educational Mobility",
    source: "UNESCO Institute for Statistics",
    date: "2026-01",
    pair: "CN-US",
    bucket: "trade",
    excerpt:
      "Chinese student enrollment in US universities declined 18% from 2019 levels, while new Confucius Institute closures reduced cultural exchange infrastructure.",
    llm: {
      score: -25,
      rationale:
        "Declining educational exchange and institutional closures suggest deteriorating bilateral relations with negative economic spillovers.",
      keyPhrases: ["student enrollment", "Confucius Institute", "cultural exchange", "18% decline"],
      confidence: 0.61,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a14",
    title: "US-China Climate Cooperation Framework at COP31",
    source: "UNFCCC Secretariat",
    date: "2026-03",
    pair: "CN-US",
    bucket: "trade",
    excerpt:
      "China and the US jointly announced a methane reduction pledge and a bilateral clean energy investment framework worth $15B over five years.",
    llm: {
      score: 35,
      rationale:
        "$15B bilateral investment framework and joint climate pledge indicate improving cooperation.",
      keyPhrases: ["COP31", "methane pledge", "$15B clean energy", "bilateral cooperation"],
      confidence: 0.58,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a15",
    title: "Chinese Rare Earth Export Restrictions and US Manufacturing Vulnerability",
    source: "USGS Mineral Industry Survey",
    date: "2026-02",
    pair: "CN-US",
    bucket: "trade",
    excerpt:
      "China\u2019s gallium and germanium export controls reduced US rare earth imports by 35%, forcing emergency stockpile releases and accelerated domestic mining permits.",
    llm: {
      score: -68,
      rationale:
        "35% reduction in rare earth imports is severe. Emergency stockpile releases indicate critical supply disruption. Major economic weaponization.",
      keyPhrases: ["gallium", "germanium", "export controls", "35% reduction", "stockpile"],
      confidence: 0.72,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
  {
    id: "a16",
    title: "EU Carbon Border Adjustment Mechanism: Implications for Chinese Exports",
    source: "OECD Environment Working Paper",
    date: "2025-11",
    pair: "CN-EU",
    bucket: "trade",
    excerpt:
      "CBAM implementation is projected to increase costs on Chinese steel and aluminum exports to the EU by 15\u201325%, potentially redirecting $8B in annual trade flows.",
    llm: {
      score: -42,
      rationale:
        "CBAM creates significant new trade barriers. 15-25% cost increase and $8B trade diversion is substantial. Regulatory-driven fragmentation.",
      keyPhrases: ["CBAM", "carbon border", "15-25% cost increase", "$8B diversion", "steel"],
      confidence: 0.90,
    },
    status: "pending",
    humanScore: null,
    humanNote: "",
  },
];

/* ─── Component ─── */
export default function ReviewPage() {
  const [articles, setArticles] = useState<ClassifiedArticle[]>(INITIAL_ARTICLES);
  const [filterPair, setFilterPair] = useState<BilateralPair | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ReviewStatus | "all">("all");
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overrideScore, setOverrideScore] = useState("");
  const [overrideNote, setOverrideNote] = useState("");

  // Stats
  const stats = useMemo(() => {
    const total = articles.length;
    const accepted = articles.filter((a) => a.status === "accepted").length;
    const rejected = articles.filter((a) => a.status === "rejected").length;
    const overridden = articles.filter((a) => a.status === "overridden").length;
    const pending = articles.filter((a) => a.status === "pending").length;
    return { total, accepted, rejected, overridden, pending };
  }, [articles]);

  // Filtered
  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (filterPair !== "all" && a.pair !== filterPair) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      return true;
    });
  }, [articles, filterPair, filterStatus]);

  // Actions
  const accept = (id: string) =>
    setArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "accepted" as const } : a))
    );

  const reject = (id: string) =>
    setArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "rejected" as const } : a))
    );

  const startOverride = (id: string) => {
    const art = articles.find((a) => a.id === id);
    setOverrideId(id);
    setOverrideScore(art?.llm.score.toString() ?? "0");
    setOverrideNote("");
  };

  const submitOverride = () => {
    if (!overrideId) return;
    const score = parseFloat(overrideScore);
    if (isNaN(score) || score < -100 || score > 100) return;
    setArticles((prev) =>
      prev.map((a) =>
        a.id === overrideId
          ? { ...a, status: "overridden" as const, humanScore: score, humanNote: overrideNote }
          : a
      )
    );
    setOverrideId(null);
    setOverrideScore("");
    setOverrideNote("");
  };

  const resetArticle = (id: string) =>
    setArticles((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: "pending" as const, humanScore: null, humanNote: "" } : a
      )
    );

  const statusColor = (s: ReviewStatus) => {
    switch (s) {
      case "accepted": return "text-cooperation";
      case "rejected": return "text-conflict";
      case "overridden": return "text-warning";
      default: return "text-text-muted";
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
            <FileText size={12} />
            <span>Human-in-the-Loop Validation</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-text-primary">
            Article Review
          </h1>
          <p className="mt-4 text-base text-text-secondary max-w-2xl leading-relaxed">
            Claude Opus classified {stats.total} articles. Review each
            classification: accept if reasonable, reject if off-topic,
            or override with your own score.
          </p>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-b border-border bg-bg-surface/50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3">
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-text-muted" />
              <span className="text-text-muted">Pending</span>
              <span className="font-mono font-medium text-text-primary">{stats.pending}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cooperation" />
              <span className="text-text-muted">Accepted</span>
              <span className="font-mono font-medium text-cooperation">{stats.accepted}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-conflict" />
              <span className="text-text-muted">Rejected</span>
              <span className="font-mono font-medium text-conflict">{stats.rejected}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warning" />
              <span className="text-text-muted">Overridden</span>
              <span className="font-mono font-medium text-text-primary">{stats.overridden}</span>
            </div>
            <div className="ml-auto font-mono text-text-muted">
              {stats.total - stats.pending} / {stats.total} reviewed
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden flex">
            {stats.accepted > 0 && (
              <div
                className="h-full bg-cooperation transition-all"
                style={{ width: `${(stats.accepted / stats.total) * 100}%` }}
              />
            )}
            {stats.overridden > 0 && (
              <div
                className="h-full bg-warning transition-all"
                style={{ width: `${(stats.overridden / stats.total) * 100}%` }}
              />
            )}
            {stats.rejected > 0 && (
              <div
                className="h-full bg-conflict transition-all"
                style={{ width: `${(stats.rejected / stats.total) * 100}%` }}
              />
            )}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center gap-4">
          <Filter size={14} className="text-text-muted" />
          <div className="flex items-center gap-1">
            {(["all", "CN-US", "CN-EU", "US-EU"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPair(p)}
                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                  filterPair === p
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {p === "all" ? "All pairs" : p}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1">
            {(["all", "pending", "accepted", "rejected", "overridden"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  filterStatus === s
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-text-muted">
            {filtered.length} article{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      </section>

      {/* Article Cards */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <div className="space-y-3">
          {filtered.map((article) => (
            <div
              key={article.id}
              className={`data-card overflow-hidden transition-all ${
                article.status === "accepted"
                  ? "border-cooperation/30"
                  : article.status === "rejected"
                  ? "border-conflict/30 opacity-60"
                  : article.status === "overridden"
                  ? "border-warning/30"
                  : ""
              }`}
            >
              <div className="px-4 py-3">
                {/* Top row: title + metadata */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-bg-surface border border-border text-text-muted">
                        {article.pair}
                      </span>
                      <span className="font-mono text-[10px] text-text-disabled">
                        {article.date}
                      </span>
                      {article.status !== "pending" && (
                        <span className={`text-[10px] font-medium uppercase tracking-wider ${statusColor(article.status)}`}>
                          {article.status}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-text-primary leading-snug">
                      {article.title}
                    </h3>
                    <div className="text-xs text-text-muted mt-0.5">
                      {article.source}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <ScoreBadge score={article.status === "overridden" && article.humanScore !== null ? article.humanScore : article.llm.score} size="md" />
                    {article.status === "overridden" && article.humanScore !== null && (
                      <div className="text-[10px] text-text-muted mt-0.5 font-mono line-through">
                        LLM: {article.llm.score > 0 ? "+" : ""}{article.llm.score}
                      </div>
                    )}
                  </div>
                </div>

                {/* Excerpt */}
                <details className="mt-2">
                  <summary className="text-[11px] text-text-muted cursor-pointer hover:text-text-secondary transition-colors select-none">
                    Article excerpt
                  </summary>
                  <p className="mt-1 text-xs text-text-secondary leading-relaxed bg-bg-surface/50 rounded p-2">
                    {article.excerpt}
                  </p>
                </details>

                {/* LLM Rationale */}
                <div className="mt-2 p-2 rounded bg-bg-surface/50 border-l-2 border-accent/30">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">
                    LLM Rationale
                    <span className="ml-2 normal-case tracking-normal">
                      (confidence: {(article.llm.confidence * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {article.llm.rationale}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {article.llm.keyPhrases.map((kp) => (
                      <span
                        key={kp}
                        className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-accent/8 text-accent border border-accent/20"
                      >
                        {kp}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Human override note */}
                {article.status === "overridden" && article.humanNote && (
                  <div className="mt-2 p-2 rounded bg-warning/5 border-l-2 border-warning/30">
                    <div className="text-[10px] text-warning uppercase tracking-wider mb-0.5">
                      Human Override Note
                    </div>
                    <p className="text-xs text-text-secondary">{article.humanNote}</p>
                  </div>
                )}

                {/* Override form */}
                {overrideId === article.id && (
                  <div className="mt-3 p-3 rounded-md bg-bg-surface border border-border space-y-2">
                    <div className="text-xs font-medium text-text-primary">Override Score</div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={-100}
                        max={100}
                        step={1}
                        value={overrideScore}
                        onChange={(e) => setOverrideScore(e.target.value)}
                        className="w-20 px-2 py-1 text-sm font-mono rounded border border-border bg-white text-text-primary focus:outline-none focus:border-accent"
                      />
                      <input
                        type="text"
                        placeholder="Reason for override (optional)"
                        value={overrideNote}
                        onChange={(e) => setOverrideNote(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs rounded border border-border bg-white text-text-primary focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={submitOverride}
                        className="px-3 py-1 rounded text-xs font-medium bg-accent text-white hover:bg-accent-strong transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setOverrideId(null)}
                        className="px-2 py-1 rounded text-xs text-text-muted hover:text-text-secondary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {article.status === "pending" && overrideId !== article.id && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => accept(article.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-cooperation bg-cooperation/10 hover:bg-cooperation/20 transition-colors"
                    >
                      <CheckCircle2 size={12} />
                      Accept
                    </button>
                    <button
                      onClick={() => reject(article.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-conflict bg-conflict/10 hover:bg-conflict/20 transition-colors"
                    >
                      <XCircle size={12} />
                      Reject
                    </button>
                    <button
                      onClick={() => startOverride(article.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-text-muted bg-bg-surface hover:bg-bg-hover transition-colors border border-border"
                    >
                      <Pencil size={12} />
                      Override
                    </button>
                  </div>
                )}

                {/* Reset button for reviewed articles */}
                {article.status !== "pending" && overrideId !== article.id && (
                  <div className="mt-2">
                    <button
                      onClick={() => resetArticle(article.id)}
                      className="text-[11px] text-text-disabled hover:text-text-muted transition-colors"
                    >
                      Reset to pending
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Validation Summary (shown when all reviewed) */}
      {stats.pending === 0 && (
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-8">
          <div className="data-card p-4 border-accent/30">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={16} className="text-accent" />
              <h3 className="text-sm font-medium text-text-primary">
                Validation Summary
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-mono font-medium text-text-primary">
                  {stats.total}
                </div>
                <div className="text-xs text-text-muted">Total articles</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-medium text-cooperation">
                  {((stats.accepted / stats.total) * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-text-muted">Acceptance rate</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-medium text-conflict">
                  {((stats.rejected / stats.total) * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-text-muted">Rejection rate</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-medium text-text-primary">
                  {((stats.overridden / stats.total) * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-text-muted">Override rate</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted leading-relaxed">
              Report: {stats.accepted + stats.overridden} articles retained
              ({(((stats.accepted + stats.overridden) / stats.total) * 100).toFixed(0)}%),
              {stats.rejected} rejected as off-topic or misclassified,
              {stats.overridden} score-overridden by human reviewer.
              Methodology: human-in-the-loop validation per Egami et al. (2023).
            </p>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-xs text-text-muted">
          Classification model: Claude Opus 4 (temperature 0, structured output).
          Validation framework: Egami, Hinck, Stewart &amp; Wei (2023) Design-Based Supervised Learning.
        </div>
      </footer>
    </div>
  );
}
