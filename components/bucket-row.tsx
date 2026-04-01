"use client";

import { useState } from "react";
import type { Bucket, BilateralPair, BucketScore } from "@/lib/types";
import { BUCKET_LABELS } from "@/lib/types";
import { ScoreBadge, getScoreColor } from "./score-badge";
import { Sparkline } from "./sparkline";
import { useMode } from "./mode-context";
import {
  ArrowLeftRight,
  DollarSign,
  Cpu,
  Landmark,
  Shield,
  ScrollText,
  ChevronDown,
  FileText,
  Database,
  Info,
  BarChart3,
} from "lucide-react";

const BUCKET_ICONS: Record<Bucket, typeof ArrowLeftRight> = {
  trade: ArrowLeftRight,
  investment: DollarSign,
  technology: Cpu,
  finance: Landmark,
  leverage: Shield,
  policy: ScrollText,
};

const BUCKET_DESCRIPTIONS: Record<Bucket, string> = {
  trade:
    "Bilateral trade flows, tariffs, quotas, FTAs, and trade disputes",
  investment:
    "FDI flows, investment screening, M&A, and capital controls",
  technology:
    "Tech transfer, semiconductor controls, AI governance, and R&D cooperation",
  finance:
    "Currency dynamics, SWIFT, reserves, financial sanctions, and capital markets",
  leverage:
    "Economic weaponization: rare earths, energy, food, and supply chain chokepoints",
  policy:
    "Government signals, diplomatic events, summits, and regulatory shifts",
};

const BUCKET_SOURCES: Record<Bucket, { papers: string[]; data: string[] }> = {
  trade: {
    papers: [
      "Anderson & van Wincoop (2003) Gravity with Gravitas, AER",
      "Aiyar, Malacrino & Presbitero (2024) Investing in Friends, European J. Political Economy",
    ],
    data: ["OECD Monthly Trade (SDMX API)", "WTO Tariff Database", "UN COMTRADE"],
  },
  investment: {
    papers: [
      "Kalinova, Palerm & Thomsen (2010) OECD FDI Restrictiveness Index",
      "Mistura & Roulet (2019) The Determinants of FDI, OECD",
    ],
    data: ["OECD FDI Statistics by partner", "OECD FDI Regulatory Restrictiveness Index", "CFIUS Annual Reports"],
  },
  technology: {
    papers: [
      "Jinji & Ozawa (2024) Economic Consequences of US-China Decoupling, CEPR/RIETI",
      "Gentzkow, Kelly & Taddy (2019) Text as Data, JEL",
    ],
    data: ["WIPO Patent Filings", "OECD MSTI", "US BIS Entity List"],
  },
  finance: {
    papers: [
      "Chinn & Ito (2006) KAOPEN Financial Openness Index, JDE",
      "Cipriani, Goldberg & La Spada (2023) Financial Sanctions, SWIFT, JEP",
    ],
    data: ["IMF COFER", "BIS Triennial Survey", "SWIFT RMB Tracker", "IMF IFS"],
  },
  leverage: {
    papers: [
      "Farrell & Newman (2019) Weaponized Interdependence, International Security",
      "Clayton, Maggiori & Schoar (2024) Economic Coercion & Fragmentation, BIS",
    ],
    data: ["USGS Mineral Summaries", "IEA Energy Security", "Eurostat Critical Raw Materials"],
  },
  policy: {
    papers: [
      "Baker, Bloom & Davis (2016) Measuring Economic Policy Uncertainty, QJE",
      "Caldara & Iacoviello (2022) Measuring Geopolitical Risk, AER",
    ],
    data: ["GDELT 2.0 Events", "UN Ideal Point Distance", "Treaty Databases"],
  },
};

const BUCKET_WEIGHTS: Record<Bucket, { text: number; hard: number }> = {
  trade: { text: 0.3, hard: 0.7 },
  investment: { text: 0.4, hard: 0.6 },
  technology: { text: 0.6, hard: 0.4 },
  finance: { text: 0.25, hard: 0.75 },
  leverage: { text: 0.8, hard: 0.2 },
  policy: { text: 0.5, hard: 0.5 },
};

import type { Granularity } from "./trilateral-diagram";

interface BucketRowProps {
  bucket: Bucket;
  scores: Record<string, BucketScore>;
  granularity?: Granularity;
}

export function BucketRow({ bucket, scores, granularity = "Q" }: BucketRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const { mode } = useMode();
  const Icon = BUCKET_ICONS[bucket];
  const weights = BUCKET_WEIGHTS[bucket];

  const cnUs = scores["CN-US"];
  const cnEu = scores["CN-EU"];
  const usEu = scores["US-EU"];
  const avg = (cnUs.composite + cnEu.composite + usEu.composite) / 3;

  return (
    <div className="data-card overflow-hidden">
      {/* ── Main row ── */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-bg-hover/30 transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {/* Icon + Label */}
        <div className="flex items-center gap-3 w-40 shrink-0">
          <Icon size={16} strokeWidth={2} className="text-text-muted" />
          <div className="text-left">
            <div className="text-sm font-medium text-text-primary">
              {BUCKET_LABELS[bucket]}
            </div>
            <div className="text-xs text-text-muted hidden sm:block">
              {BUCKET_DESCRIPTIONS[bucket].split(",")[0]}
            </div>
          </div>
        </div>

        {/* Bilateral scores */}
        <div className="flex-1 grid grid-cols-3 gap-2">
          {[
            { label: "CN-US", score: cnUs },
            { label: "CN-EU", score: cnEu },
            { label: "US-EU", score: usEu },
          ].map(({ label, score }) => (
            <div key={label} className="text-center">
              <ScoreBadge score={score.composite} size="sm" />
              <div className="text-[10px] text-text-muted mt-0.5 font-mono">
                {score.nArticles} art.
              </div>
            </div>
          ))}
        </div>

        {/* Average */}
        <div className="w-20 text-right shrink-0">
          <ScoreBadge score={avg} size="md" />
        </div>

        {/* Chart toggle button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowChart(!showChart);
          }}
          className={`p-1.5 rounded-md transition-colors ${
            showChart
              ? "text-accent bg-accent/10"
              : "text-text-disabled hover:text-text-muted"
          }`}
          title="Time series"
          aria-label={`Toggle time series chart for ${BUCKET_LABELS[bucket]}`}
        >
          <BarChart3 size={14} strokeWidth={2} />
        </button>

        {/* Expand chevron */}
        <ChevronDown
          size={14}
          className={`text-text-muted transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-bg-primary/50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {(
              [
                { pair: "CN-US" as const, score: cnUs },
                { pair: "CN-EU" as const, score: cnEu },
                { pair: "US-EU" as const, score: usEu },
              ] as const
            ).map(({ pair, score }) => (
              <div key={pair} className="space-y-2">
                <div className="font-medium text-text-secondary text-sm">
                  {pair.replace("-", " \u2013 ")}
                </div>
                <div className="space-y-1.5">
                  {/* Text score */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-text-muted">
                      <FileText size={10} strokeWidth={2} /> Text
                    </span>
                    <span
                      className={`score-value ${getScoreColor(score.textScore)}`}
                    >
                      {score.textScore > 0 ? "+" : ""}
                      {score.textScore.toFixed(1)}
                    </span>
                  </div>

                  {/* Hard data score */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-text-muted">
                      <Database size={10} strokeWidth={2} /> Hard
                    </span>
                    <span
                      className={`score-value ${
                        score.hardDataScore !== null
                          ? getScoreColor(score.hardDataScore)
                          : "text-text-disabled"
                      }`}
                    >
                      {score.hardDataScore !== null
                        ? `${score.hardDataScore > 0 ? "+" : ""}${score.hardDataScore.toFixed(1)}`
                        : "\u2014"}
                    </span>
                  </div>

                  {/* Weight bar */}
                  <div className="flex items-center gap-0.5 pt-1">
                    <div
                      className="h-1 rounded-full bg-accent/30"
                      style={{ width: `${weights.text * 100}%` }}
                    />
                    <div
                      className="h-1 rounded-full bg-accent"
                      style={{ width: `${weights.hard * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-text-disabled">
                    <span>Text {(weights.text * 100).toFixed(0)}%</span>
                    <span>Hard {(weights.hard * 100).toFixed(0)}%</span>
                  </div>

                  {/* Convergence — quant mode only */}
                  {mode === "quant" && score.convergence !== null && (
                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <span className="text-text-muted">Convergence</span>
                      <span className="score-value text-accent">
                        {(score.convergence * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Sources & methodology */}
          <details className="learn-more mt-3 pt-2 border-t border-border/50">
            <summary className="flex items-center gap-1">
              <Info size={10} strokeWidth={2} />
              Sources &amp; methodology
            </summary>
            <div className="space-y-3">
              <p className="text-xs text-text-muted leading-relaxed" style={{ maxWidth: "65ch" }}>
                {BUCKET_DESCRIPTIONS[bucket]}. Scores: &minus;100
                (conflict) to +100 (cooperation). Weight:{" "}
                {(weights.text * 100).toFixed(0)}% text /{" "}
                {(weights.hard * 100).toFixed(0)}% hard.
              </p>

              {/* Academic papers */}
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FileText size={9} strokeWidth={2} />
                  Key papers
                </div>
                <ul className="space-y-0.5">
                  {BUCKET_SOURCES[bucket].papers.map((p) => (
                    <li key={p} className="text-[11px] text-text-secondary leading-snug pl-3 relative before:absolute before:left-0 before:top-[7px] before:h-[3px] before:w-[3px] before:rounded-full before:bg-accent/40">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Data sources */}
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Database size={9} strokeWidth={2} />
                  Hard data sources
                </div>
                <div className="flex flex-wrap gap-1">
                  {BUCKET_SOURCES[bucket].data.map((d) => (
                    <span key={d} className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-bg-surface text-text-muted border border-border/50">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* ── Time-series sparklines ── */}
      {showChart && (
        <div
          className={`border-t border-border px-4 py-3 ${
            expanded ? "bg-bg-primary/30" : "bg-bg-primary/50"
          }`}
        >
          <div className="grid grid-cols-3 gap-4">
            {(["CN-US", "CN-EU", "US-EU"] as BilateralPair[]).map((pair) => (
              <div key={pair} className="space-y-1">
                <div className="text-xs text-text-secondary font-mono">
                  {pair}
                </div>
                <div className="h-12">
                  <Sparkline pair={pair} bucket={bucket} granularity={granularity} />
                </div>
                <div className="flex justify-between text-[10px] text-text-disabled font-mono">
                  <span>{granularity === "M" ? "Apr \u201924" : "Q2 \u201924"}</span>
                  <span>{granularity === "M" ? "Mar \u201926" : "Q1 \u201926"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
