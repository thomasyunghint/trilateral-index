"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Activity,
  TrendingUp,
  BarChart3,
  Target,
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types (inline to avoid import issues with server-only backtest)    */
/* ------------------------------------------------------------------ */

interface ETFConfig {
  symbol: string;
  name: string;
  description: string;
  primaryPair: string;
  color: string;
}

interface CorrelationResult {
  tgfiMetric: string;
  etfSymbol: string;
  lag: number;
  correlation: number;
  nObservations: number;
  pValue: number | null;
  significant: boolean;
}

interface LeadLagProfile {
  tgfiMetric: string;
  etfSymbol: string;
  lags: number[];
  correlations: number[];
  bestLag: number;
  bestCorrelation: number;
}

interface HitRateResult {
  tgfiMetric: string;
  etfSymbol: string;
  lag: number;
  totalPeriods: number;
  correctDirectionPeriods: number;
  hitRate: number;
}

interface EventStudy {
  date: string;
  event: string;
  tgfiChange: number;
  pair: string;
  etfReturns: Record<string, number>;
  window: string;
}

interface BacktestResult {
  runAt: string;
  config: {
    etfs: ETFConfig[];
    tgfiFrequency: string;
    lags: number[];
    startPeriod: string;
    endPeriod: string;
  };
  correlations: CorrelationResult[];
  leadLag: LeadLagProfile[];
  hitRates: HitRateResult[];
  events: EventStudy[];
  summary: {
    avgIC: number;
    bestPredictivePair: string;
    avgHitRate: number;
    nPeriods: number;
  };
  _warning?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function corrColor(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.5) return r > 0 ? "text-cooperation" : "text-conflict";
  if (abs >= 0.3) return r > 0 ? "text-green-400" : "text-red-400";
  return "text-text-muted";
}

function corrBg(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.5) return r > 0 ? "bg-cooperation/15" : "bg-conflict/15";
  if (abs >= 0.3) return r > 0 ? "bg-green-500/10" : "bg-red-500/10";
  return "bg-bg-surface/50";
}

function hitRateColor(hr: number): string {
  if (hr >= 0.6) return "text-cooperation";
  if (hr >= 0.5) return "text-text-secondary";
  return "text-conflict";
}

function formatPct(n: number, decimals = 1): string {
  const s = n.toFixed(decimals);
  return n > 0 ? `+${s}` : s;
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function BacktestPage() {
  const [data, setData] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<string>("all");
  const [selectedLag, setSelectedLag] = useState(1);

  useEffect(() => {
    fetchBacktest();
  }, []);

  async function fetchBacktest(mode = "mock") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backtest?mode=${mode}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: BacktestResult = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  /* Filtered data */
  const filteredCorrelations = useMemo(() => {
    if (!data) return [];
    return data.correlations.filter(
      (c) =>
        c.lag === selectedLag &&
        (selectedPair === "all" || c.tgfiMetric === selectedPair),
    );
  }, [data, selectedPair, selectedLag]);

  const filteredLeadLag = useMemo(() => {
    if (!data) return [];
    return data.leadLag.filter(
      (l) =>
        selectedPair === "all" || l.tgfiMetric === selectedPair,
    );
  }, [data, selectedPair]);

  const filteredHitRates = useMemo(() => {
    if (!data) return [];
    return data.hitRates.filter(
      (h) =>
        selectedPair === "all" || h.tgfiMetric === selectedPair,
    );
  }, [data, selectedPair]);

  const pairOptions = ["all", "Overall", "CN-US", "CN-EU", "US-EU"];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-text-muted">
          <RefreshCw size={16} className="animate-spin" />
          <span className="font-mono text-sm">Running backtest analysis...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle size={24} className="text-conflict mx-auto mb-2" />
          <p className="text-text-muted text-sm">
            Backtest failed: {error ?? "No data"}
          </p>
          <button
            onClick={() => fetchBacktest()}
            className="mt-3 text-xs text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* ─── Header ─── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
            <BarChart3 size={12} />
            <span>External Validity</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-text-primary">
            Backtest
          </h1>
          <p className="mt-4 text-base text-text-secondary max-w-2xl leading-relaxed">
            Does TGFI predict financial market movements? Correlation analysis
            between fragmentation scores and ETF returns across 6 instruments,
            4 lag horizons, and 3 bilateral pairs.
          </p>
          {data._warning && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-3 py-1.5 w-fit">
              <AlertTriangle size={12} />
              {data._warning}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-text-muted font-mono">
              {data.config.startPeriod} to {data.config.endPeriod}
            </span>
            <span className="text-text-muted">|</span>
            <span className="text-xs text-text-muted font-mono">
              {data.summary.nPeriods} periods
            </span>
            <span className="text-text-muted">|</span>
            <span className="text-xs text-text-muted font-mono">
              Run {new Date(data.runAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </section>

      {/* ─── Summary KPIs ─── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryCard
              label="Avg Information Coefficient"
              value={data.summary.avgIC.toFixed(3)}
              subtext="Lag-1 |r| across all pairs"
              icon={<TrendingUp size={14} />}
              quality={data.summary.avgIC >= 0.15 ? "good" : data.summary.avgIC >= 0.05 ? "ok" : "weak"}
            />
            <SummaryCard
              label="Directional Hit Rate"
              value={`${(data.summary.avgHitRate * 100).toFixed(1)}%`}
              subtext="TGFI direction predicts ETF"
              icon={<Target size={14} />}
              quality={data.summary.avgHitRate >= 0.55 ? "good" : data.summary.avgHitRate >= 0.5 ? "ok" : "weak"}
            />
            <SummaryCard
              label="Best Predictive Pair"
              value={data.summary.bestPredictivePair}
              subtext="Highest avg lag-1 IC"
              icon={<Zap size={14} />}
              quality="good"
            />
            <SummaryCard
              label="ETFs Tested"
              value={data.config.etfs.length.toString()}
              subtext={data.config.etfs.map((e) => e.symbol).join(", ")}
              icon={<Activity size={14} />}
              quality="neutral"
            />
          </div>
        </div>
      </section>

      {/* ─── Filters ─── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">TGFI Pair:</span>
            <div className="flex gap-1">
              {pairOptions.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPair(p)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    selectedPair === p
                      ? "bg-accent/20 text-accent border border-accent/30"
                      : "text-text-muted hover:text-text-secondary border border-transparent"
                  }`}
                >
                  {p === "all" ? "All" : p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Lag:</span>
            <div className="flex gap-1">
              {data.config.lags.map((lag) => (
                <button
                  key={lag}
                  onClick={() => setSelectedLag(lag)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    selectedLag === lag
                      ? "bg-accent/20 text-accent border border-accent/30"
                      : "text-text-muted hover:text-text-secondary border border-transparent"
                  }`}
                >
                  {lag === 0 ? "t" : `t+${lag}`}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => fetchBacktest("live")}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors px-2 py-1 rounded border border-border"
            >
              <RefreshCw size={12} />
              Live ETF data
            </button>
            <button
              onClick={() => fetchBacktest("mock")}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors px-2 py-1 rounded border border-border"
            >
              <RefreshCw size={12} />
              Mock data
            </button>
          </div>
        </div>
      </section>

      {/* ─── Correlation Heatmap ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
            <BarChart3 size={16} />
            Correlation Matrix
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Pearson r between TGFI monthly changes and ETF returns at lag = {selectedLag === 0 ? "t (concurrent)" : `t+${selectedLag} (TGFI leads by ${selectedLag}mo)`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <CorrelationTable
            correlations={filteredCorrelations}
            etfs={data.config.etfs}
          />
        </div>
      </section>

      {/* ─── Lead-Lag Profiles ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 border-t border-border">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
            <TrendingUp size={16} />
            Lead-Lag Analysis
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Information coefficient (|r|) across lag horizons. Higher at lag &gt; 0 suggests TGFI has predictive power.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLeadLag.map((profile) => (
            <LeadLagCard key={`${profile.tgfiMetric}-${profile.etfSymbol}`} profile={profile} />
          ))}
        </div>
      </section>

      {/* ─── Hit Rates ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 border-t border-border">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
            <Target size={16} />
            Directional Hit Rates
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Percentage of months where TGFI direction correctly predicts ETF return direction (lag = 1 month).
            Random = 50%.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredHitRates.map((hr) => (
            <HitRateCard key={`${hr.tgfiMetric}-${hr.etfSymbol}`} result={hr} />
          ))}
        </div>
      </section>

      {/* ─── Event Studies ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 border-t border-border">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
            <Zap size={16} />
            Event Studies
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Largest TGFI monthly moves and concurrent ETF reactions. Based on mock timeline data.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th className="text-left py-2 px-3 font-normal">Period</th>
                <th className="text-left py-2 px-3 font-normal">Event</th>
                <th className="text-left py-2 px-3 font-normal">Pair</th>
                <th className="text-right py-2 px-3 font-normal">TGFI</th>
                {data.config.etfs.slice(0, 4).map((etf) => (
                  <th key={etf.symbol} className="text-right py-2 px-3 font-normal">
                    {etf.symbol}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.events.map((evt, i) => (
                <tr key={i} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-2 px-3 font-mono text-text-secondary">{evt.date}</td>
                  <td className="py-2 px-3 text-text-primary max-w-[200px] truncate">{evt.event}</td>
                  <td className="py-2 px-3 font-mono text-text-muted">{evt.pair}</td>
                  <td className={`py-2 px-3 text-right font-mono ${evt.tgfiChange < 0 ? "text-conflict" : "text-cooperation"}`}>
                    {formatPct(evt.tgfiChange)}
                  </td>
                  {data.config.etfs.slice(0, 4).map((etf) => {
                    const ret = evt.etfReturns[etf.symbol];
                    return (
                      <td key={etf.symbol} className={`py-2 px-3 text-right font-mono ${
                        ret == null ? "text-text-muted" : ret < 0 ? "text-conflict" : "text-cooperation"
                      }`}>
                        {ret != null ? `${formatPct(ret)}%` : "--"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Methodology Note ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 border-t border-border">
        <div className="bg-bg-surface/50 border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">Methodology</h3>
          <div className="space-y-2 text-xs text-text-muted leading-relaxed">
            <p>
              <strong className="text-text-secondary">Correlation:</strong> Pearson r between TGFI monthly score changes and ETF monthly returns.
              Lag = N means TGFI at time t is compared to ETF return at t+N months.
            </p>
            <p>
              <strong className="text-text-secondary">Information Coefficient:</strong> Average absolute correlation at lag-1.
              IC &gt; 0.05 is considered informative in quantitative finance (Grinold & Kahn, 2000).
            </p>
            <p>
              <strong className="text-text-secondary">Hit Rate:</strong> Fraction of months where TGFI direction matches ETF direction.
              &gt; 55% is practically useful for trading signals.
            </p>
            <p>
              <strong className="text-text-secondary">P-values:</strong> Approximate using t-distribution. With N &lt; 24 observations,
              statistical power is limited. Results should be interpreted as directional evidence, not definitive proof.
            </p>
            <p>
              <strong className="text-text-secondary">Data source:</strong> {" "}
              {data._warning ? "Synthetic ETF returns correlated with TGFI mock data." : "Yahoo Finance monthly adjusted close prices."}
              {" "}TGFI scores from mock timeline data. Connect real pipeline for production-grade results.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-xs text-text-muted">
          <p>
            Backtesting framework. References: Grinold & Kahn (2000) Active Portfolio Management;
            Campbell, Lo & MacKinlay (1997) Econometrics of Financial Markets.
            Not investment advice.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================== */
/*  Sub-components                                                      */
/* ================================================================== */

function SummaryCard({
  label,
  value,
  subtext,
  icon,
  quality,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
  quality: "good" | "ok" | "weak" | "neutral";
}) {
  const qualityColors = {
    good: "text-cooperation",
    ok: "text-amber-400",
    weak: "text-conflict",
    neutral: "text-accent",
  };

  return (
    <div className="bg-bg-surface/50 border border-border rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-mono font-semibold ${qualityColors[quality]}`}>
        {value}
      </div>
      <div className="text-[10px] text-text-muted mt-1 font-mono">{subtext}</div>
    </div>
  );
}

function CorrelationTable({
  correlations,
  etfs,
}: {
  correlations: CorrelationResult[];
  etfs: ETFConfig[];
}) {
  // Group by TGFI metric
  const metrics = Array.from(new Set(correlations.map((c) => c.tgfiMetric)));
  const symbols = etfs.map((e) => e.symbol);

  if (correlations.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-text-muted">
        No correlation data for this selection.
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-2 px-3 text-xs text-text-muted font-normal">
            TGFI Metric
          </th>
          {symbols.map((s) => (
            <th key={s} className="text-center py-2 px-3 text-xs text-text-muted font-normal">
              {s}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {metrics.map((metric) => (
          <tr key={metric} className="hover:bg-bg-hover/30 transition-colors">
            <td className="py-2.5 px-3 font-mono text-text-secondary text-xs">
              {metric}
            </td>
            {symbols.map((symbol) => {
              const corr = correlations.find(
                (c) => c.tgfiMetric === metric && c.etfSymbol === symbol,
              );
              if (!corr) {
                return (
                  <td key={symbol} className="text-center py-2.5 px-3 text-text-muted">
                    --
                  </td>
                );
              }
              return (
                <td key={symbol} className="text-center py-2.5 px-1">
                  <div
                    className={`inline-flex flex-col items-center px-2.5 py-1 rounded ${corrBg(corr.correlation)}`}
                  >
                    <span className={`font-mono text-sm font-medium ${corrColor(corr.correlation)}`}>
                      {corr.correlation > 0 ? "+" : ""}
                      {corr.correlation.toFixed(3)}
                    </span>
                    <span className="text-[9px] text-text-muted">
                      n={corr.nObservations}
                      {corr.significant && (
                        <span className="ml-1 text-cooperation">*</span>
                      )}
                    </span>
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LeadLagCard({ profile }: { profile: LeadLagProfile }) {
  const maxAbs = Math.max(...profile.correlations.map(Math.abs), 0.01);

  return (
    <div className="bg-bg-surface/50 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-mono text-xs text-text-secondary">
            {profile.tgfiMetric}
          </span>
          <span className="text-text-muted mx-1.5">vs</span>
          <span className="font-mono text-xs text-text-primary font-medium">
            {profile.etfSymbol}
          </span>
        </div>
        <div className="text-[10px] text-text-muted font-mono">
          best: t+{profile.bestLag}
        </div>
      </div>

      {/* Horizontal bar chart */}
      <div className="space-y-1.5">
        {profile.lags.map((lag, i) => {
          const corr = profile.correlations[i];
          const width = Math.abs(corr) / Math.max(maxAbs, 0.5) * 100;
          const isNeg = corr < 0;
          const isBest = lag === profile.bestLag;

          return (
            <div key={lag} className="flex items-center gap-2">
              <span className="w-8 text-[10px] font-mono text-text-muted text-right">
                {lag === 0 ? "t" : `t+${lag}`}
              </span>
              <div className="flex-1 h-4 relative">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                {/* Bar */}
                <div
                  className={`absolute top-0.5 h-3 rounded-sm transition-all ${
                    isBest ? (isNeg ? "bg-conflict" : "bg-cooperation") :
                    (isNeg ? "bg-conflict/50" : "bg-cooperation/50")
                  }`}
                  style={{
                    width: `${Math.min(width, 50)}%`,
                    left: isNeg ? `${50 - Math.min(width, 50)}%` : "50%",
                  }}
                />
              </div>
              <span className={`w-14 text-right text-[10px] font-mono ${corrColor(corr)}`}>
                {corr > 0 ? "+" : ""}{corr.toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HitRateCard({ result }: { result: HitRateResult }) {
  const pct = result.hitRate * 100;
  const isGood = pct >= 55;
  const isOk = pct >= 50;

  return (
    <div className="bg-bg-surface/50 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-text-secondary">
            {result.tgfiMetric}
          </span>
          <span className="text-text-muted text-xs">vs</span>
          <span className="font-mono text-xs text-text-primary font-medium">
            {result.etfSymbol}
          </span>
        </div>
        {isGood ? (
          <CheckCircle size={12} className="text-cooperation" />
        ) : (
          <div className={`h-2 w-2 rounded-full ${isOk ? "bg-amber-400" : "bg-conflict"}`} />
        )}
      </div>

      {/* Hit rate bar */}
      <div className="relative h-6 bg-bg-base rounded overflow-hidden mb-2">
        <div
          className={`absolute left-0 top-0 bottom-0 rounded transition-all ${
            isGood ? "bg-cooperation/30" : isOk ? "bg-amber-400/30" : "bg-conflict/30"
          }`}
          style={{ width: `${pct}%` }}
        />
        {/* 50% line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-text-muted/30" />
        <span className={`absolute inset-0 flex items-center justify-center text-xs font-mono font-medium ${hitRateColor(result.hitRate)}`}>
          {pct.toFixed(1)}%
        </span>
      </div>

      <div className="flex justify-between text-[10px] text-text-muted font-mono">
        <span>{result.correctDirectionPeriods}/{result.totalPeriods} correct</span>
        <span>lag = {result.lag}mo</span>
      </div>
    </div>
  );
}
