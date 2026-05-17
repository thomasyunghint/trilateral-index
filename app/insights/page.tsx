"use client";

import { useState, useEffect } from "react";

type EvidenceClaim = {
  id: string;
  text: string;
  source: string;
  direction: number;
  bucket: string;
  pair: string;
  date: string | null;
};

type Signal = {
  pattern_type: string;
  title: string;
  summary: string;
  score: number;
  claim_ids: string[];
  evidence: {
    claims: EvidenceClaim[];
    gap?: number;
    delta?: number;
    window_days?: number;
  };
  pairs: string[];
  analysis?: {
    title: string;
    analysis: string;
    confidence: number;
    tags: string[];
  };
};

type StatusData = {
  articles: { total: string; extracted: string; pending: string; skipped: string };
  claims: { total: string };
  last_ingest: { run_at: string; articles_new: number } | null;
  source_coverage: Array<{ source_name: string; count: string }>;
};

function PatternBadge({ type }: { type: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    CROSS_BUCKET_DIVERGENCE: { label: "DIVERGENCE", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    TEMPORAL_FLIP: { label: "DIRECTION REVERSAL", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
    SOURCE_DISAGREEMENT: { label: "EXPERT DISAGREEMENT", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  };
  const { label, color } = labels[type] || { label: type, color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" };
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase border rounded ${color}`}>
      {label}
    </span>
  );
}

function DirectionBar({ value }: { value: number }) {
  const width = Math.abs(value);
  const isPositive = value > 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />
        {isPositive ? (
          <div
            className="absolute top-0 bottom-0 bg-emerald-500 rounded-full"
            style={{ left: "50%", width: `${width / 2}%` }}
          />
        ) : (
          <div
            className="absolute top-0 bottom-0 bg-rose-500 rounded-full"
            style={{ right: "50%", width: `${width / 2}%` }}
          />
        )}
      </div>
      <span className={`text-xs font-mono ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
        {value > 0 ? "+" : ""}{value}
      </span>
    </div>
  );
}

function InsightCard({ signal, rank }: { signal: Signal; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const title = signal.analysis?.title || signal.title;
  const body = signal.analysis?.analysis || signal.summary;
  const confidence = signal.analysis?.confidence || Math.round(signal.score / 10);
  const tags = signal.analysis?.tags || signal.pairs;

  return (
    <div className="insights-card border border-zinc-800 rounded-lg p-6 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-zinc-600 font-mono">#{rank}</span>
          <PatternBadge type={signal.pattern_type} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wide">Confidence</span>
          <span className="text-sm font-bold text-zinc-200">{confidence}/10</span>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-zinc-100 mb-3 leading-tight">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed mb-4">{body}</p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {tags.map((tag, i) => (
            <span key={i} className="px-2 py-0.5 text-[11px] bg-zinc-800 text-zinc-400 rounded border border-zinc-700">
              {tag}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {expanded ? "Hide evidence" : "Show evidence"}
      </button>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          {signal.evidence.claims.map((claim, i) => (
            <div key={i} className="insights-evidence rounded p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase">{claim.source}</span>
                <span className="text-[10px] text-zinc-600">
                  {claim.date ? new Date(claim.date).toLocaleDateString() : ""}
                </span>
                <span className="text-[10px] text-zinc-600 uppercase">{claim.bucket}</span>
              </div>
              <p className="text-xs text-zinc-300 mb-2">{claim.text}</p>
              <DirectionBar value={claim.direction} />
            </div>
          ))}
          {signal.evidence.gap && (
            <div className="text-xs text-zinc-500">
              Gap: {signal.evidence.gap} points | Window: {signal.evidence.window_days || "N/A"} days
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InsightsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      try {
        // Try cached signals first, fall back to live detection
        const [signalsRes, statusRes] = await Promise.all([
          fetch("/api/signals?limit=10", { signal: controller.signal }),
          fetch("/api/status", { signal: controller.signal }),
        ]);

        if (controller.signal.aborted) return;

        if (signalsRes.ok) {
          const data = await signalsRes.json();
          if (data.signals && data.signals.length > 0) {
            setSignals(data.signals);
          } else {
            // No cached signals — try live detection
            const detectRes = await fetch("/api/detect?limit=10", { signal: controller.signal });
            if (detectRes.ok) {
              const detectData = await detectRes.json();
              setSignals(detectData.signals || []);
            }
          }
        } else {
          setError("Failed to load signals");
        }

        if (statusRes.ok) {
          const data = await statusRes.json();
          setStatus(data);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message || "Failed to load data");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm animate-pulse">Running detection patterns...</div>
      </div>
    );
  }

  const totalArticles = status?.articles.total || "0";
  const totalClaims = status?.claims.total || "0";
  const sourcesActive = status?.source_coverage.length || 0;
  const lastRun = status?.last_ingest?.run_at
    ? new Date(status.last_ingest.run_at).toLocaleString()
    : "Never";

  return (
    <div className="min-h-screen text-zinc-100" style={{ backgroundColor: '#09090b', color: '#fafafa' }}>
      {/* Header */}
      <header className="insights-header border-b px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">Live Monitoring</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Trilateral Insight Engine</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Automated detection of geopolitical signals across China-US-EU economic relations
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          <StatCard label="Articles Ingested" value={totalArticles} />
          <StatCard label="Claims Extracted" value={totalClaims} />
          <StatCard label="Signals Detected" value={String(signals.length)} highlight />
          <StatCard label="Sources Active" value={String(sourcesActive)} />
          <StatCard label="Last Ingest" value={lastRun} small />
        </div>

        {/* Signals */}
        {signals.length > 0 ? (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-lg font-semibold text-zinc-200">Priority Signals</h2>
              <span className="px-2 py-0.5 text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded font-medium">
                {signals.length} ACTIVE
              </span>
            </div>
            <div className="grid gap-4">
              {signals.map((signal, i) => (
                <InsightCard key={i} signal={signal} rank={i + 1} />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-zinc-600">
            <p className="text-lg">No signals above threshold</p>
            <p className="text-sm mt-2">Detection runs every 12 hours. Currently processing {status?.articles.pending || 0} pending articles.</p>
          </div>
        )}

        {/* Source Coverage */}
        {status?.source_coverage && (
          <div className="mt-12 border-t border-zinc-800/50 pt-8">
            <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-4">Source Coverage</h3>
            <div className="flex flex-wrap gap-3">
              {status.source_coverage.map((s, i) => (
                <div key={i} className="insights-source flex items-center gap-2 border rounded px-3 py-1.5">
                  <span className="text-xs text-zinc-300">{s.source_name}</span>
                  <span className="text-[10px] text-zinc-600 font-mono">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-8 p-4 bg-red-950/30 border border-red-900/50 rounded text-sm text-red-400">
            Error: {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="insights-footer border-t px-8 py-4 mt-16">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-[11px] text-zinc-600">
            TGFI Research System | Prof. Keyu Jin, HKUST
          </span>
          <span className="text-[11px] text-zinc-600">
            Detection: Haiku 4.5 | Analysis: Sonnet 4 | Pipeline: Vercel + Neon
          </span>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, highlight, small }: { label: string; value: string; highlight?: boolean; small?: boolean }) {
  return (
    <div className="insights-stat border rounded-lg px-4 py-3">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-semibold ${highlight ? "text-rose-400" : "text-zinc-100"} ${small ? "text-sm" : "text-xl font-mono"}`}>
        {value}
      </div>
    </div>
  );
}
