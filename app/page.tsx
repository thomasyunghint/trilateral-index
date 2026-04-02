"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MOCK_SUMMARY, QUARTERLY_PAIR_SCORES, MONTHLY_PAIR_SCORES, getBucketScoresAtIndex } from "@/lib/mock-data";
import { BUCKETS, PAIR_LABELS, type BilateralPair, type Bucket, type BucketScore } from "@/lib/types";
import { TrilateralDiagram, type Granularity, getTimelineData } from "@/components/trilateral-diagram";
import { BucketRow } from "@/components/bucket-row";
import { ScoreBadge, DirectionLabel } from "@/components/score-badge";
import { useMode } from "@/components/mode-context";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Newspaper,
  Clock,
  Layers,
  ArrowRight,
} from "lucide-react";

function TrendIcon({ score }: { score: number }) {
  if (score >= 10) return <TrendingUp size={14} className="text-cooperation" />;
  if (score <= -10) return <TrendingDown size={14} className="text-conflict" />;
  return <Minus size={14} className="text-neutral" />;
}

/** Map a monthly index (0-23) to the nearest quarterly index (0-7) for bucket data lookup */
function monthlyToQuarterlyIdx(monthlyIdx: number): number {
  // Monthly: 24 entries (Apr 2024 - Mar 2026), Quarterly: 8 entries (Q2 2024 - Q1 2026)
  // Each quarter spans 3 months
  return Math.min(7, Math.floor(monthlyIdx / 3));
}

export default function IndexPage() {
  const [selectedPair, setSelectedPair] = useState<BilateralPair | null>(null);
  const { mode } = useMode();
  const data = MOCK_SUMMARY;

  // Global timeline state
  const [granularity, setGranularity] = useState<Granularity>("Q");
  const [timelineIdx, setTimelineIdx] = useState(() =>
    (granularity === "Q" ? QUARTERLY_PAIR_SCORES : MONTHLY_PAIR_SCORES).length - 1
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timelineData = getTimelineData(granularity);
  const safeIdx = Math.min(timelineIdx, timelineData.length - 1);
  const isLive = safeIdx === timelineData.length - 1;

  // Reset idx on granularity change
  useEffect(() => {
    setTimelineIdx(timelineData.length - 1);
    setIsPlaying(false);
  }, [granularity, timelineData.length]);

  // Auto-play timer
  useEffect(() => {
    if (isPlaying) {
      const speed = granularity === "M" ? 600 : 1200;
      intervalRef.current = setInterval(() => {
        setTimelineIdx((prev) => {
          if (prev >= timelineData.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, speed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, timelineData.length, granularity]);

  // Get bucket scores for current timeline position
  const getBucketScores = useCallback((bucket: Bucket) => {
    if (isLive) {
      return {
        "CN-US": data.pairs["CN-US"].buckets[bucket],
        "CN-EU": data.pairs["CN-EU"].buckets[bucket],
        "US-EU": data.pairs["US-EU"].buckets[bucket],
      };
    }
    // Historical: use quarterly index (time series mock is quarterly)
    const qIdx = granularity === "M" ? monthlyToQuarterlyIdx(safeIdx) : safeIdx;
    return getBucketScoresAtIndex(qIdx, bucket);
  }, [isLive, safeIdx, granularity, data]);

  const currentPeriod = timelineData[safeIdx]?.period ?? data.period;

  // Timeline-aware KPI scores
  const defaultScores = { "CN-US": 0, "CN-EU": 0, "US-EU": 0 } as Record<BilateralPair, number>;
  const currentScores = timelineData[safeIdx]?.scores ?? defaultScores;
  const headlineScore = isLive
    ? data.overall.score
    : Math.round(((currentScores["CN-US"] + currentScores["CN-EU"] + currentScores["US-EU"]) / 3) * 10) / 10;
  const prevIdx = Math.max(0, safeIdx > 0 ? safeIdx - 1 : 0);
  const prevScores = timelineData[prevIdx]?.scores ?? defaultScores;
  const prevHeadline = (prevScores["CN-US"] + prevScores["CN-EU"] + prevScores["US-EU"]) / 3;
  const headlineDelta = safeIdx > 0
    ? Math.round((headlineScore - prevHeadline) * 10) / 10
    : 0;
  const prevPeriodLabel = safeIdx > 0 ? timelineData[prevIdx].period : "";

  const getOverallPairScore = (pair: BilateralPair): number => {
    if (isLive) return data.pairs[pair].overallScore;
    return currentScores[pair];
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Left: Headline + KPIs */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
                  <Clock size={12} />
                  <span className="font-mono">
                    {currentPeriod} &middot; Updated {new Date(data.computedAt).toLocaleDateString()}
                  </span>
                </div>
                <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.25rem] tracking-tight text-text-primary leading-[1.15]">
                  Trilateral Geoeconomic
                  <br />
                  <span className="text-gradient">Fragmentation Index</span>
                </h1>
                <p className="mt-3 text-lg sm:text-xl text-text-secondary max-w-lg leading-snug">
                  Are China, the US, and the EU cooperating
                  or fragmenting economically?
                </p>
                <p className="mt-2 text-sm text-text-muted max-w-lg leading-relaxed">
                  A composite index across 6 geoeconomic dimensions.{" "}
                  <span className="score-value text-accent">{data.overall.totalArticles}</span>{" "}
                  articles classified this quarter, blended with structured data
                  from OECD, IMF, BIS, SWIFT, WIPO, GDELT, and UN sources.
                </p>
              </div>

              {/* Overall Score Card */}
              <div className="data-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-text-muted uppercase tracking-wider mb-1 group/tgfi relative inline-flex items-center gap-1 cursor-help">
                      <span>Headline TGFI</span>
                      <svg width="12" height="12" viewBox="0 0 16 16" className="opacity-40 group-hover/tgfi:opacity-70 transition-opacity">
                        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
                        <text x="8" y="11.5" textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="600">?</text>
                      </svg>
                      <div className="absolute bottom-full left-0 mb-2 w-72 p-3 rounded-md bg-[rgb(var(--text-primary))] text-[rgb(var(--bg-primary))] text-[11px] leading-relaxed opacity-0 pointer-events-none group-hover/tgfi:opacity-100 group-hover/tgfi:pointer-events-auto transition-opacity duration-200 z-50 shadow-lg normal-case tracking-normal font-sans">
                        <div className="font-semibold mb-1">Trilateral Geoeconomic Fragmentation Index</div>
                        <div>Weighted average of 6 dimensions (Trade, Investment, Technology, Finance, Leverage, Policy) across 3 bilateral pairs (CN-US, CN-EU, US-EU). Each dimension blends LLM-classified text scores with structured hard data. Scale: -100 (conflict) to +100 (cooperation).</div>
                        <div className="mt-1.5 text-[10px] opacity-70">Framework: OECD Handbook on Composite Indicators (2008)</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <ScoreBadge score={headlineScore} size="xl" />
                      <div className="space-y-0.5">
                        <DirectionLabel score={headlineScore} />
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <TrendIcon score={headlineDelta} />
                          <span className="font-mono">
                            {headlineDelta > 0 ? "+" : ""}{headlineDelta.toFixed(1)} vs {prevPeriodLabel || "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-1 hidden sm:block">
                    <div className="flex items-center gap-1.5 text-xs text-text-muted">
                      <Newspaper size={10} />
                      <span className="font-mono">{data.overall.totalArticles} articles</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-text-muted">
                      <Layers size={10} />
                      <span className="font-mono">3 layers</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bilateral Pair Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(["CN-US", "CN-EU", "US-EU"] as BilateralPair[]).map((pair) => {
                  const isSelected = selectedPair === pair;
                  return (
                    <button
                      key={pair}
                      onClick={() => setSelectedPair(isSelected ? null : pair)}
                      className={`data-card p-3 text-left transition-all ${
                        isSelected ? "!border-accent/50" : ""
                      }`}
                    >
                      <div className="text-xs text-text-muted font-mono mb-1">{pair}</div>
                      <div className="flex items-center gap-2">
                        <ScoreBadge score={getOverallPairScore(pair)} size="sm" />
                        <TrendIcon score={getOverallPairScore(pair)} />
                      </div>
                      <div className="mt-1.5 text-[10px] text-text-muted">
                        {PAIR_LABELS[pair]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Trilateral Diagram (with global timeline) */}
            <div className="flex items-center justify-center">
              <TrilateralDiagram
                selectedPair={selectedPair}
                onSelectPair={(pair) =>
                  setSelectedPair(selectedPair === pair ? null : pair)
                }
                granularity={granularity}
                setGranularity={setGranularity}
                timelineIdx={timelineIdx}
                setTimelineIdx={setTimelineIdx}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Bucket Scores Section */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-medium text-text-primary">
              Dimensional Breakdown
            </h2>
            <p className="text-sm text-text-muted mt-0.5">
              6 geoeconomic dimensions &middot; Click to expand methodology and sources
              {!isLive && (
                <span className="ml-2 text-accent font-mono text-xs">
                  Showing: {currentPeriod}
                </span>
              )}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cooperation" />
              Cooperation
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-neutral" />
              Neutral
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-conflict" />
              Conflict
            </span>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-4 px-4 py-2 text-xs text-text-muted border-b border-border mb-2">
          <div className="w-40 shrink-0">Dimension</div>
          <div className="flex-1 grid grid-cols-3 gap-2 text-center">
            <span>CN-US</span>
            <span>CN-EU</span>
            <span>US-EU</span>
          </div>
          <div className="w-20 text-right shrink-0">Avg</div>
          <div className="w-4" />
        </div>

        {/* Bucket rows — scores update with timeline */}
        <div className="space-y-1">
          {BUCKETS.map((bucket) => (
            <BucketRow key={bucket} bucket={bucket} scores={getBucketScores(bucket)} granularity={granularity} />
          ))}
        </div>
      </section>

      {/* Methodology teaser */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
          <div className="data-card p-4 flex items-center justify-between">
            <div>
              <div className="text-base font-medium text-text-primary">Methodology</div>
              <p className="text-sm text-text-muted mt-0.5">
                30 peer-reviewed papers across 6 dimensions. OECD Handbook on Composite
                Indicators framework. No arbitrary weights.
              </p>
            </div>
            <a
              href="/methodology"
              className="flex items-center gap-1 text-sm text-accent hover:text-accent-weak transition-colors"
            >
              Explore <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* Quant mode */}
      {mode === "quant" && (
        <section className="border-t border-accent/20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
            <div className="data-card border-accent/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-accent border border-accent/30 px-1.5 py-0.5 rounded">
                  QR Mode
                </span>
                <span className="text-sm font-medium text-text-primary">
                  Signal Validation
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Granger causality tests against FXI, EWG, EURUSD, REMX, KWEB.
                Cross-method convergence analysis. Factor exposure decomposition.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center text-xs text-text-muted">
          Meridian &middot; Trilateral Geoeconomic Fragmentation Index
        </div>
      </footer>
    </div>
  );
}
