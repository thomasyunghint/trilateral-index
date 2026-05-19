"use client";

import { useMemo, useState } from "react";

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */

export type EvidenceClaim = {
  id: string;
  text: string;
  source: string;
  direction: number;
  bucket: string;
  pair: string;
  date: string | null;
  paper_title?: string;
  paper_url?: string;
};

export type Credibility = {
  sourceTier: number;
  sourceDiversity: number;
  sampleSize: number;
  detectionMargin: number;
  reproducibility: number;
  composite: number;
  tierLabel: string;
  sourceCount: number;
  claimCount: number;
};

export type Favorability = {
  fromDirection: number;
  toDirection: number;
  delta: number;
  ci: number;
};

export type SignalRow = {
  id: string;
  rank: number;
  pattern_type: string;
  score: number;
  headline: string;
  summary: string;
  interpretation: string;
  detected_at: string;
  pair: string;
  bucket: string;
  tags: string[];
  claims: EvidenceClaim[];
  gap?: number;
  window_days?: number;
  delta?: number;
  credibility: Credibility;
  favorability: Favorability;
  dissenting?: EvidenceClaim[];
  sparkline?: Array<{ date: string; direction: number }>;
  baselineSigma?: number;
};

export type HeatmapCell = {
  pair: string;
  bucket: string;
  score: number | null;
  count: number;            // total claims in this pair × bucket cell
  signalCount?: number;     // how many surfaced signals match this cell
};

export type StatsBlock = {
  articles: number;
  extracted: number;
  claims: number;
  sources: number;
  signals: number;
  lastIngest: string | null;
};

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */

const PAIRS = ["CN-US", "CN-EU", "US-EU"] as const;
const BUCKETS = ["trade", "investment", "technology", "finance", "leverage", "policy"] as const;

function patternLabel(p: string): string {
  switch (p) {
    case "TEMPORAL_FLIP": return "Direction Reversal";
    case "SOURCE_DISAGREEMENT": return "Expert Disagreement";
    case "CROSS_BUCKET_DIVERGENCE": return "Cross-Bucket Divergence";
    default: return p;
  }
}

function patternBadgeClass(p: string): string {
  switch (p) {
    case "TEMPORAL_FLIP": return "flip";
    case "SOURCE_DISAGREEMENT": return "disagreement";
    case "CROSS_BUCKET_DIVERGENCE": return "divergence";
    default: return "";
  }
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

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Build a citation link to the original article using the Text Fragment URL
 * standard (#:~:text=...), which causes Chromium/Safari to scroll to and
 * highlight the matching passage when the page loads.
 *
 * Reference: https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments
 */
function buildCitationLink(c: EvidenceClaim): string | undefined {
  if (!c.paper_url) return undefined;

  // Pull the most distinctive substring from the claim text (skip short stop-words).
  // Use a contiguous middle chunk to maximise the chance of an exact match.
  const text = (c.text || "").trim();
  if (!text) return c.paper_url;

  // Trim trailing punctuation, take up to ~120 chars from the middle for a
  // recognisable but URL-friendly fragment.
  const max = 120;
  let snippet = text.replace(/[.!?]+$/, "");
  if (snippet.length > max) {
    // Take the middle slice — usually the most distinctive part of a claim.
    const start = Math.max(0, Math.floor((snippet.length - max) / 2));
    snippet = snippet.slice(start, start + max);
    // Trim partial words at both ends
    snippet = snippet.replace(/^\S*\s+/, "").replace(/\s+\S*$/, "");
  }

  // Strip characters that need heavy escaping or cause matching failures
  // (curly quotes, smart dashes, line breaks). The browser is forgiving but
  // ASCII quotes match more reliably.
  snippet = snippet
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  if (!snippet) return c.paper_url;

  return `${c.paper_url}#:~:text=${encodeURIComponent(snippet)}`;
}

/* ─────────────────────────────────────────────────────────────
   Masthead
   ───────────────────────────────────────────────────────────── */

function Masthead({ stats }: { stats: StatsBlock }) {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <header className="tgfi-masthead">
      <div className="tgfi-container">
        <h1 className="tgfi-masthead-title">
          Trilateral Geoeconomic Fragmentation Index
        </h1>
        <div className="tgfi-masthead-meta">
          <span><span className="live-dot" />Live monitoring</span>
          <span>As of {today}</span>
          <span>Last ingest {formatRelativeTime(stats.lastIngest)}</span>
          <span>{stats.claims.toLocaleString()} claims · {stats.sources} sources</span>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────
   Credibility 5-bar panel
   ───────────────────────────────────────────────────────────── */

function CredibilityPanel({ cred }: { cred: Credibility }) {
  const composite5 = (cred.composite * 5);
  const filled = Math.round(composite5);
  const stars = "●".repeat(filled) + "○".repeat(5 - filled);
  // Label tied to the visible star count so "3/5" never claims to be "High".
  const compositeLabel =
    filled >= 5 ? "High"
    : filled === 4 ? "Moderate-High"
    : filled === 3 ? "Moderate"
    : filled === 2 ? "Weak"
    : filled === 1 ? "Poor"
    : "Insufficient";

  const rows: Array<[string, number, string]> = [
    ["Source tier", cred.sourceTier, cred.tierLabel || "—"],
    ["Source diversity", cred.sourceDiversity, `${cred.sourceCount} source${cred.sourceCount !== 1 ? "s" : ""}`],
    ["Sample size", cred.sampleSize, `N=${cred.claimCount} claim${cred.claimCount !== 1 ? "s" : ""}`],
    ["Detection margin", cred.detectionMargin, cred.detectionMargin >= 1 ? "at ceiling" : `+${Math.round((cred.detectionMargin - 0.5) * 200)}% above threshold`],
    ["Reproducibility", cred.reproducibility, "rule-based"],
  ];

  function scoreBand(v: number): "strong" | "ok" | "weak" | "poor" {
    if (v >= 0.8) return "strong";
    if (v >= 0.5) return "ok";
    if (v >= 0.3) return "weak";
    return "poor";
  }

  return (
    <div className="cred-panel">
      <div className="signal-hero-section-label">Credibility</div>
      {rows.map(([label, value, hint]) => {
        const v = clamp(value, 0, 1);
        return (
          <div key={label} className="cred-row">
            <span className="cred-label">
              {label}{" "}
              <span style={{ color: "rgb(var(--ink-4))", marginLeft: 4 }}>({hint})</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              <span className="cred-bar">
                <span
                  className="cred-bar-fill"
                  data-score={scoreBand(v)}
                  style={{ width: `${v * 100}%` }}
                />
              </span>
            </span>
          </div>
        );
      })}
      <div className="cred-composite">
        <span className="cred-stars">{stars}</span>
        {filled}/5 · {compositeLabel}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Favorability panel (direction bar + baseline)
   ───────────────────────────────────────────────────────────── */

function FavorabilityPanel({
  fav,
  baselineSigma,
  windowDays,
}: {
  fav: Favorability;
  baselineSigma?: number;
  windowDays?: number;
}) {
  const fromPct = ((fav.fromDirection + 100) / 200) * 100;
  const toPct = ((fav.toDirection + 100) / 200) * 100;
  const isFlip = fav.delta !== 0;
  // Window label uses correct pluralisation
  const windowLabel = typeof windowDays === "number"
    ? ` over ${windowDays} day${windowDays === 1 ? "" : "s"}`
    : "";
  // Build a connector showing motion from fromPct → toPct
  const connectorLeft = Math.min(fromPct, toPct);
  const connectorWidth = Math.abs(toPct - fromPct);
  const motionColor = fav.delta > 0 ? "rgb(var(--coop-1))" : "rgb(var(--conflict-1))";

  return (
    <div className="fav-panel">
      <div className="signal-hero-section-label">Favorability</div>
      <div className="fav-headline">
        {isFlip ? (
          <>
            Δ direction{windowLabel}: {fav.fromDirection > 0 ? "+" : ""}{fav.fromDirection} → {fav.toDirection > 0 ? "+" : ""}{fav.toDirection}
          </>
        ) : (
          <>Current direction: {fav.toDirection > 0 ? "+" : ""}{fav.toDirection}</>
        )}
      </div>
      <div className="fav-bar-track" aria-label="direction from conflict to cooperation">
        <span className="fav-bar-zero" />
        {/* Connector showing motion between from and to */}
        {isFlip && (
          <span
            className="fav-bar-motion"
            style={{
              left: `${connectorLeft}%`,
              width: `${connectorWidth}%`,
              background: motionColor,
            }}
          />
        )}
        {isFlip && (
          <span
            className="fav-bar-from"
            style={{ left: `${clamp(fromPct, 0, 100)}%` }}
            title={`Before: ${fav.fromDirection}`}
          />
        )}
        <span
          className="fav-bar-to"
          style={{ left: `${clamp(toPct, 0, 100)}%` }}
          title={`After: ${fav.toDirection}`}
        />
      </div>
      <div className="fav-bar-axis">
        <span className="fav-conflict">−100 conflict</span>
        <span>0</span>
        <span className="fav-coop">+100 cooperation</span>
      </div>
      {isFlip && (
        <div className="fav-shift">
          Net shift: <strong>{fav.delta > 0 ? "+" : ""}{fav.delta} points</strong>{windowLabel}
        </div>
      )}
      {typeof baselineSigma === "number" && baselineSigma > 0 && (
        <div className="fav-baseline">
          <div className="fav-baseline-label">Baseline Context</div>
          <span className="fav-sigma">{baselineSigma.toFixed(1)}σ above source&rsquo;s normal volatility</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Evidence (auto-switch layout based on pattern type & count)
   ───────────────────────────────────────────────────────────── */

function EvidenceBlock({
  signal,
}: {
  signal: SignalRow;
}) {
  if (signal.claims.length === 0) return null;

  // Layout decision
  const useSideBySide = signal.claims.length === 2;
  const sequential = !useSideBySide;

  // For side-by-side, decide label scheme based on pattern type
  const isFlip = signal.pattern_type === "TEMPORAL_FLIP";
  const isDisagreement = signal.pattern_type === "SOURCE_DISAGREEMENT";

  let leftLabel = "Quote A";
  let rightLabel = "Quote B";
  let leftClass = "disagree-a";
  let rightClass = "disagree-b";
  let orderedClaims = signal.claims;

  if (useSideBySide && isFlip) {
    // Sort by date — earliest first
    const sorted = [...signal.claims].sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    leftLabel = `Before · ${formatDateShort(sorted[0].date)}`;
    rightLabel = `After · ${formatDateShort(sorted[1].date)}`;
    leftClass = "before";
    rightClass = "after";
    orderedClaims = sorted;
  } else if (useSideBySide && isDisagreement) {
    // Order: cooperation first (positive direction), then conflict
    const sorted = [...signal.claims].sort((a, b) => b.direction - a.direction);
    leftLabel = `${sorted[0].source} · ${formatDateShort(sorted[0].date)}`;
    rightLabel = `${sorted[1].source} · ${formatDateShort(sorted[1].date)}`;
    leftClass = "disagree-a";
    rightClass = "disagree-b";
    orderedClaims = sorted;
  }

  function renderQuote(c: EvidenceClaim, label: string, cls: string) {
    const linkHref = buildCitationLink(c);
    const isClickable = Boolean(linkHref);

    const inner = (
      <>
        <div className="evidence-quote-label">
          {label}
          {isClickable && <span className="evidence-quote-jumpicon" aria-hidden="true">↗</span>}
        </div>
        <p className="evidence-quote-text">&ldquo;{c.text}&rdquo;</p>
        <div className="evidence-quote-direction">
          Direction: {c.direction > 0 ? "+" : ""}{c.direction} ·{" "}
          {c.direction > 20 ? "cooperation" : c.direction < -20 ? "conflict" : "neutral"}
        </div>
        <div className="evidence-quote-citation">
          <span className="source-name">{c.source}</span>
          {c.paper_title && (
            <>
              {" · "}<span className="paper-title">&ldquo;{c.paper_title}&rdquo;</span>
            </>
          )}
          {c.date && <> · {formatDateShort(c.date)}</>}
          {isClickable && (
            <>{" · "}<span style={{ color: "rgb(var(--accent-1))" }}>Click to view in source ↗</span></>
          )}
        </div>
      </>
    );

    if (isClickable) {
      return (
        <a
          className={`evidence-quote evidence-quote-clickable ${cls}`}
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          title="Open original article and jump to this quote"
        >
          {inner}
        </a>
      );
    }
    return <div className={`evidence-quote ${cls}`}>{inner}</div>;
  }

  return (
    <section className="signal-hero-section">
      <div className="signal-hero-section-label">Primary Evidence</div>
      <div className={`evidence-grid ${sequential ? "sequential" : ""}`}>
        {useSideBySide ? (
          <>
            {renderQuote(orderedClaims[0], leftLabel, leftClass)}
            {renderQuote(orderedClaims[1], rightLabel, rightClass)}
          </>
        ) : (
          orderedClaims.map((c, i) => renderQuote(c, `${c.source} · ${formatDateShort(c.date)}`, i % 2 === 0 ? "before" : "after"))
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Dissenting evidence (counter-signals)
   ───────────────────────────────────────────────────────────── */

function DissentingEvidence({ items, signal }: { items: EvidenceClaim[]; signal: SignalRow }) {
  if (!items || items.length === 0) return null;
  const direction = signal.favorability.toDirection;
  const directionLabel = direction > 0 ? "cooperation" : "conflict";
  return (
    <section className="signal-hero-section">
      <div className="signal-hero-section-label">Dissenting Evidence</div>
      <div className="dissenting-list">
        {items.map((c) => {
          const link = buildCitationLink(c);
          const body = (
            <>
              <div className="dissenting-source">
                {c.source} · {formatDateShort(c.date)} · direction {c.direction > 0 ? "+" : ""}{c.direction}
                {link && <span style={{ marginLeft: 8, color: "rgb(var(--accent-1))" }}>↗</span>}
              </div>
              &ldquo;{c.text}&rdquo;
            </>
          );
          if (link) {
            return (
              <a
                key={c.id}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="dissenting-item dissenting-item-clickable"
                title="Open original article and jump to this quote"
              >
                {body}
              </a>
            );
          }
          return (
            <div key={c.id} className="dissenting-item">
              {body}
            </div>
          );
        })}
      </div>
      <div className="dissenting-summary">
        Counter-signals from same window did not mirror the {directionLabel} shift.
        This is unilateral repositioning, not consensus.
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sparkline
   ───────────────────────────────────────────────────────────── */

type SparklineHighlight = { date: string; direction: number; role: "flip" };

type DayPoint = {
  day: string;        // YYYY-MM-DD
  ts: number;
  mean: number;
  count: number;
  min: number;
  max: number;
};

/**
 * Aggregate raw per-claim data into one point per calendar day.
 * Many articles publish multiple claims per day, which produced visually
 * stacked dots in v1. Collapsing to daily averages makes the trend readable.
 */
function aggregateByDay(raw: Array<{ date: string; direction: number }>): DayPoint[] {
  const map = new Map<string, { sum: number; n: number; min: number; max: number }>();
  for (const r of raw) {
    if (!r.date) continue;
    const day = String(r.date).slice(0, 10);
    const bucket = map.get(day);
    if (!bucket) {
      map.set(day, { sum: r.direction, n: 1, min: r.direction, max: r.direction });
    } else {
      bucket.sum += r.direction;
      bucket.n += 1;
      bucket.min = Math.min(bucket.min, r.direction);
      bucket.max = Math.max(bucket.max, r.direction);
    }
  }
  return Array.from(map.entries())
    .map(([day, b]) => ({
      day,
      ts: new Date(day + "T12:00:00Z").getTime(),
      mean: Math.round(b.sum / b.n),
      count: b.n,
      min: b.min,
      max: b.max,
    }))
    .sort((a, b) => a.ts - b.ts);
}

function Sparkline({
  data,
  signalId,
  highlightDates = [],
}: {
  data: Array<{ date: string; direction: number }>;
  signalId: string;
  highlightDates?: SparklineHighlight[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!data || data.length < 2) return null;
  const daily = aggregateByDay(data);
  if (daily.length < 2) return null;

  const W = 720;
  const H = 220;
  const PAD_L = 56;
  const PAD_R = 20;
  const PAD_T = 16;
  const PAD_B = 32;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const ts = daily.map((d) => d.ts);
  const xMin = Math.min(...ts);
  const xMax = Math.max(...ts);
  const xRange = Math.max(xMax - xMin, 86400_000);
  const yRange = 200;

  const toX = (x: number) => PAD_L + ((x - xMin) / xRange) * innerW;
  const toY = (y: number) => PAD_T + ((100 - y) / yRange) * innerH;

  // Build segments (color by sign, split at zero crossing) using daily means
  type Segment = { x1: number; y1: number; x2: number; y2: number; color: string };
  const segments: Segment[] = [];
  for (let i = 0; i < daily.length - 1; i++) {
    const a = daily[i];
    const b = daily[i + 1];
    const aX = toX(a.ts);
    const aY = toY(a.mean);
    const bX = toX(b.ts);
    const bY = toY(b.mean);
    const aSign = a.mean >= 0;
    const bSign = b.mean >= 0;
    if (aSign === bSign) {
      segments.push({
        x1: aX, y1: aY, x2: bX, y2: bY,
        color: aSign ? "rgb(var(--coop-1))" : "rgb(var(--conflict-1))",
      });
    } else {
      const totalDir = a.mean - b.mean;
      const fraction = totalDir === 0 ? 0.5 : a.mean / totalDir;
      const crossX = aX + (bX - aX) * fraction;
      const crossY = toY(0);
      segments.push({
        x1: aX, y1: aY, x2: crossX, y2: crossY,
        color: aSign ? "rgb(var(--coop-1))" : "rgb(var(--conflict-1))",
      });
      segments.push({
        x1: crossX, y1: crossY, x2: bX, y2: bY,
        color: bSign ? "rgb(var(--coop-1))" : "rgb(var(--conflict-1))",
      });
    }
  }

  const yTicks = [100, 50, 0, -50, -100];
  const fmtDay = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const xLabels: Array<{ ts: number; anchor: "start" | "middle" | "end" }> = [
    { ts: xMin, anchor: "start" },
    { ts: xMin + xRange / 2, anchor: "middle" },
    { ts: xMax, anchor: "end" },
  ];

  // Map each highlight (flip point) to nearest day point for marking
  const highlightedDays = new Set<string>();
  for (const h of highlightDates) {
    const day = String(h.date).slice(0, 10);
    highlightedDays.add(day);
  }

  // Statistics for caption
  const allMeans = daily.map((d) => d.mean);
  const trendMin = Math.min(...allMeans);
  const trendMax = Math.max(...allMeans);
  const totalClaims = daily.reduce((s, d) => s + d.count, 0);

  const spanDays = Math.max(1, Math.round((xMax - xMin) / 86400_000));
  return (
    <section className="signal-hero-section sparkline-section">
      <div className="signal-hero-section-label">Baseline context</div>
      <p className="sparkline-explainer">
        Daily mean direction on this pair across {fmtDay(xMin)}&nbsp;&ndash;&nbsp;
        {fmtDay(xMax)} ({spanDays}&nbsp;day window). Each dot is one day, sized by
        the number of claims; <strong>diamonds</strong> mark the dates of the
        flip captured above.
      </p>

      <div className="sparkline-container">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="sparkline-svg-v2"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Cooperation / conflict shading */}
          <rect x={PAD_L} y={PAD_T} width={innerW} height={toY(0) - PAD_T}
                fill="rgb(var(--coop-1))" opacity="0.04" />
          <rect x={PAD_L} y={toY(0)} width={innerW} height={H - PAD_B - toY(0)}
                fill="rgb(var(--conflict-1))" opacity="0.04" />

          {/* Y-axis grid + labels */}
          {yTicks.map((tick) => {
            const y = toY(tick);
            const isZero = tick === 0;
            return (
              <g key={tick}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                      stroke={isZero ? "rgb(var(--ink-3))" : "rgb(var(--rule-2))"}
                      strokeWidth={isZero ? 1 : 0.5}
                      strokeDasharray={isZero ? "0" : "2 3"} />
                <text x={PAD_L - 10} y={y + 4} fontSize="10"
                      fontFamily="var(--font-jetbrains-mono), monospace"
                      fill="rgb(var(--ink-3))" textAnchor="end">
                  {tick > 0 ? `+${tick}` : tick}
                </text>
              </g>
            );
          })}

          {/* Vertical Y-axis labels */}
          <text x={14} y={PAD_T + 56} fontSize="9"
                fontFamily="var(--font-jetbrains-mono), monospace"
                fill="rgb(var(--coop-1))" textAnchor="middle"
                transform={`rotate(-90 14 ${PAD_T + 56})`}>
            COOPERATION
          </text>
          <text x={14} y={H - PAD_B - 56} fontSize="9"
                fontFamily="var(--font-jetbrains-mono), monospace"
                fill="rgb(var(--conflict-1))" textAnchor="middle"
                transform={`rotate(-90 14 ${H - PAD_B - 56})`}>
            CONFLICT
          </text>

          {/* Trend line segments between daily means */}
          {segments.map((s, i) => (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                  stroke={s.color} strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
          ))}

          {/* Data points (one per day) */}
          {daily.map((d, i) => {
            const isHighlight = highlightedDays.has(d.day);
            const isHovered = hovered === i;
            const cx = toX(d.ts);
            const cy = toY(d.mean);
            const baseR = Math.min(7, 3 + Math.log2(d.count + 1));
            const r = (isHighlight ? baseR + 1 : baseR) * (isHovered ? 1.25 : 1);
            const color = d.mean >= 0 ? "rgb(var(--coop-1))" : "rgb(var(--conflict-1))";
            return (
              <g key={d.day}>
                {/* Wide invisible hover target */}
                <circle cx={cx} cy={cy} r={14} fill="transparent"
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ cursor: "pointer" }} />
                {isHighlight ? (
                  <rect
                    x={cx - r}
                    y={cy - r}
                    width={r * 2}
                    height={r * 2}
                    transform={`rotate(45 ${cx} ${cy})`}
                    fill={color}
                    stroke="rgb(var(--paper-2))"
                    strokeWidth="2"
                    pointerEvents="none"
                  />
                ) : (
                  <circle cx={cx} cy={cy} r={r} fill={color}
                          stroke="rgb(var(--paper-2))" strokeWidth="1.5"
                          pointerEvents="none" />
                )}
              </g>
            );
          })}

          {/* X-axis labels */}
          {xLabels.map((l, i) => (
            <text key={i} x={toX(l.ts)} y={H - 10} fontSize="10"
                  fontFamily="var(--font-jetbrains-mono), monospace"
                  fill="rgb(var(--ink-3))" textAnchor={l.anchor}>
              {fmtDay(l.ts)}
            </text>
          ))}
        </svg>

        {/* HTML tooltip overlay (rendered above SVG via absolute positioning) */}
        {hovered !== null && daily[hovered] && (() => {
          const d = daily[hovered];
          const tipX = (toX(d.ts) / W) * 100;
          const tipY = (toY(d.mean) / H) * 100;
          const isHighlight = highlightedDays.has(d.day);
          return (
            <div
              className="sparkline-tooltip"
              style={{
                left: `${tipX}%`,
                top: `${tipY}%`,
              }}
            >
              <div className="sparkline-tooltip-date">
                {new Date(d.ts).toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric", year: "numeric",
                })}
                {isHighlight && <span className="sparkline-tooltip-flag">FLIP POINT</span>}
              </div>
              <div className="sparkline-tooltip-row">
                <span className="sparkline-tooltip-key">Mean direction</span>
                <span className="sparkline-tooltip-val">
                  {d.mean > 0 ? "+" : ""}{d.mean}
                </span>
              </div>
              {d.count > 1 && (
                <div className="sparkline-tooltip-row">
                  <span className="sparkline-tooltip-key">Range</span>
                  <span className="sparkline-tooltip-val">
                    {d.min > 0 ? "+" : ""}{d.min} to {d.max > 0 ? "+" : ""}{d.max}
                  </span>
                </div>
              )}
              <div className="sparkline-tooltip-row">
                <span className="sparkline-tooltip-key">Claims</span>
                <span className="sparkline-tooltip-val">{d.count}</span>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="sparkline-caption">
        {daily.length} day{daily.length !== 1 ? "s" : ""} with claims ·{" "}
        {totalClaims} total claim{totalClaims !== 1 ? "s" : ""} ·{" "}
        daily mean range {trendMin > 0 ? "+" : ""}{trendMin} to {trendMax > 0 ? "+" : ""}{trendMax} ·{" "}
        diamonds = signal&rsquo;s flip dates
      </div>
      <span style={{ display: "none" }}>{signalId}</span>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Methodology block
   ───────────────────────────────────────────────────────────── */

function MethodologyBlock({ signal }: { signal: SignalRow }) {
  const rows: Array<[string, string, boolean | null]> = [];

  rows.push(["Detection rule", patternLabel(signal.pattern_type), null]);

  if (signal.pattern_type === "TEMPORAL_FLIP") {
    rows.push(["Threshold", "|Δ direction| ≥ 60 within 45 days", null]);
    if (typeof signal.delta === "number") {
      rows.push(["Observed Δ", `${signal.delta > 0 ? "+" : ""}${signal.delta} points`, true]);
    }
    if (typeof signal.window_days === "number") {
      rows.push(["Window", `${signal.window_days} days`, signal.window_days <= 45]);
    }
    rows.push(["Topic similarity", "Jaccard ≥ 0.12 required", true]);
    rows.push(["Same article?", "Different articles required", true]);
  } else if (signal.pattern_type === "SOURCE_DISAGREEMENT") {
    rows.push(["Threshold", "Direction gap ≥ 40 points across distinct sources", null]);
    if (typeof signal.gap === "number") {
      rows.push(["Observed gap", `${signal.gap} points`, true]);
    }
    rows.push(["Sources", `${signal.credibility.sourceCount} distinct sources`, signal.credibility.sourceCount >= 2]);
  } else if (signal.pattern_type === "CROSS_BUCKET_DIVERGENCE") {
    rows.push(["Threshold", "Bucket-pair direction gap ≥ 50 points", null]);
    if (typeof signal.gap === "number") {
      rows.push(["Observed gap", `${signal.gap} points`, true]);
    }
  }

  return (
    <section className="signal-hero-section signal-hero-method-section">
      <details className="signal-method-details">
        <summary className="signal-method-summary">
          <span className="signal-hero-section-label">Methodology</span>
          <span className="signal-method-summary-hint">
            {rows.length} criteria · click to expand
          </span>
        </summary>
        <div className="method-grid">
          {rows.map(([k, v, pass]) => (
            <div key={k} className="method-row">
              <span className="method-key">{k}</span>
              <span className="method-value">{v}</span>
              <span className={pass === true ? "method-pass" : pass === false ? "method-fail" : ""}>
                {pass === true ? "✓ PASS" : pass === false ? "✗ FAIL" : ""}
              </span>
            </div>
          ))}
          <div className="method-note">
            Detection is rule-based and deterministic. Interpretation drafted by language model.
            Refresh cadence: every 12 hours.
          </div>
        </div>
      </details>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Hero signal card
   ───────────────────────────────────────────────────────────── */

function SignalHero({ signal }: { signal: SignalRow }) {
  // Capture `now` via lazy state init — React 19 purity rule allows this
  // pattern (state init is exempt from purity, unlike useMemo bodies).
  // Value stays stable for the lifetime of the mount.
  const [nowMs] = useState(() => Date.now());

  const claimDates: number[] = [];
  for (const c of signal.claims) {
    if (!c.date) continue;
    const t = new Date(c.date).getTime();
    if (Number.isFinite(t)) claimDates.push(t);
  }
  const latestClaimTs = claimDates.length > 0 ? Math.max(...claimDates) : null;
  const latestClaimIso = latestClaimTs !== null
    ? new Date(latestClaimTs).toISOString()
    : null;
  const ageDays = latestClaimTs !== null
    ? Math.floor((nowMs - latestClaimTs) / 86400_000)
    : null;
  let ageLabel = "—";
  if (ageDays !== null) {
    if (ageDays < 1) ageLabel = "today";
    else if (ageDays === 1) ageLabel = "yesterday";
    else if (ageDays < 7) ageLabel = `${ageDays} days ago`;
    else if (ageDays < 30) {
      const w = Math.floor(ageDays / 7);
      ageLabel = `${w} week${w === 1 ? "" : "s"} ago`;
    } else if (ageDays < 365) {
      ageLabel = `${Math.floor(ageDays / 30)} mo ago`;
    } else {
      ageLabel = `${Math.floor(ageDays / 365)} yr ago`;
    }
  }
  const isStale = ageDays !== null && ageDays > 60;

  return (
    <article className="signal-hero" id={`signal-${signal.rank}`}>
      <div className="signal-hero-header">
        <span className="signal-hero-number">#{signal.rank}</span>
        <span className="signal-hero-tags">
          <span>{signal.pair}</span>
          <span>·</span>
          <span>{signal.bucket.toUpperCase()}</span>
          <span>·</span>
          <span className={`pattern-badge ${patternBadgeClass(signal.pattern_type)}`}>
            {patternLabel(signal.pattern_type)}
          </span>
        </span>
        <span className="signal-hero-refresh" title={`Event date: ${latestClaimIso ? formatDateShort(latestClaimIso) : "unknown"} · Detected ${formatRelativeTime(signal.detected_at)}`}>
          {latestClaimIso ? formatDateShort(latestClaimIso) : "—"}
          <span className={isStale ? "signal-age-stale" : "signal-age-fresh"}>
            {" · "}{ageLabel}
          </span>
        </span>
      </div>

      <h2 className="signal-hero-headline">{signal.headline}</h2>

      {/* LEDE — the brief reads first, before the data panels */}
      <section className="signal-hero-section signal-hero-lede">
        <div className="signal-interpretation">
          {(() => {
            // Promote any forward-looking "Watch …" sentence into a styled
            // pull-quote with a salmon left border. Sonnet's output uses
            // several forms — "Watch for …", "Watch as …", "Watch the …",
            // "→ Watch:" — so we match the word "Watch" at any sentence
            // boundary (start of string OR after a sentence-terminator).
            const text = signal.interpretation || "";
            const match = text.match(/(?:^|(?<=[.!?]\s))(→\s*)?Watch\s[^.!?]*[.!?]/);
            if (!match || match.index === undefined) {
              return <p style={{ margin: 0 }}>{text}</p>;
            }
            const before = text.slice(0, match.index).trim();
            const watch = match[0].trim();
            const after = text.slice(match.index + match[0].length).trim();
            return (
              <>
                {before && <p style={{ margin: 0 }}>{before}</p>}
                <div className="watch-line">{watch}</div>
                {after && <p style={{ margin: 0 }}>{after}</p>}
              </>
            );
          })()}
        </div>
      </section>

      {/* EVIDENCE — verbatim quotes are the receipts */}
      <EvidenceBlock signal={signal} />
      {signal.dissenting && signal.dissenting.length > 0 && (
        <DissentingEvidence items={signal.dissenting} signal={signal} />
      )}

      {/* PROOF PANELS — credibility + favorability beneath the story */}
      <div className="signal-hero-meta-grid">
        <CredibilityPanel cred={signal.credibility} />
        <FavorabilityPanel
          fav={signal.favorability}
          baselineSigma={signal.baselineSigma}
          windowDays={signal.window_days}
        />
      </div>

      {/* CONTEXT — sparkline of source's history */}
      {signal.sparkline && signal.sparkline.length >= 2 && (
        <Sparkline
          data={signal.sparkline}
          signalId={signal.id}
          highlightDates={signal.claims
            .filter((c) => c.date)
            .map((c) => ({ date: c.date as string, direction: c.direction, role: "flip" as const }))}
        />
      )}
      <MethodologyBlock signal={signal} />

      <footer className="signal-hero-footer" title={`Signal ID ${signal.id}`}>
        {signal.tags.length > 0 ? (
          <div className="signal-tags">
            {signal.tags.map((t) => <span key={t} className="signal-tag">{t}</span>)}
          </div>
        ) : (
          <div className="signal-tags signal-tags-empty" />
        )}
        <div className="signal-permalink">
          <a
            href={`#signal-${signal.rank}`}
            style={{ color: "rgb(var(--ink-4))", textDecoration: "none" }}
            title="Permalink to this signal"
          >
            #{signal.rank}
          </a>
        </div>
      </footer>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────
   Compact signal card (#4-#10)
   ───────────────────────────────────────────────────────────── */

function SignalCompact({ signal, onExpand }: { signal: SignalRow; onExpand: () => void }) {
  const composite5 = Math.round(signal.credibility.composite * 5);
  const stars = "●".repeat(composite5) + "○".repeat(5 - composite5);
  const delta = signal.favorability.delta;
  const summaryPreview = signal.interpretation.slice(0, 140).trim() + (signal.interpretation.length > 140 ? "…" : "");

  return (
    <div className="signal-compact" onClick={onExpand} role="button" tabIndex={0}
         onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onExpand(); }}>
      <div className="signal-compact-header">
        <span className="signal-compact-number">#{signal.rank}</span>
        <span>{signal.pair} · {signal.bucket.toUpperCase()}</span>
      </div>
      <h3 className="signal-compact-title">{signal.headline}</h3>
      <p className="signal-compact-summary">{summaryPreview}</p>
      <div className="signal-compact-footer">
        <span style={{ color: "rgb(var(--accent-1))", fontSize: 12, letterSpacing: "0.05em" }}>{stars}</span>
        <span style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: 11,
          color: delta > 0 ? "rgb(var(--coop-1))" : delta < 0 ? "rgb(var(--conflict-1))" : "rgb(var(--ink-3))",
        }}>
          {delta !== 0 ? `${delta > 0 ? "+" : ""}${delta}Δ` : `${signal.favorability.toDirection > 0 ? "+" : ""}${signal.favorability.toDirection}`}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Heatmap (6 buckets × 3 pairs)
   ───────────────────────────────────────────────────────────── */

function bucketCellColor(score: number | null): string {
  if (score === null) return "transparent";
  const abs = Math.abs(score);
  // Below |30| → near-white. The card needs to be clearly directional
  // before we paint the whole canvas a colour, otherwise a corpus that
  // mostly trends mildly negative becomes a uniform pink wash.
  if (abs < 30) return "rgb(var(--paper-2))";
  const intensity = Math.min(1, (abs - 30) / 50);
  if (score > 0) {
    return `rgba(26, 127, 55, ${0.08 + intensity * 0.32})`;
  } else if (score < 0) {
    return `rgba(207, 34, 46, ${0.08 + intensity * 0.32})`;
  } else {
    return "rgba(101, 109, 118, 0.06)";
  }
}

function cellTextColor(score: number | null): string {
  if (score === null) return "rgb(var(--ink-4))";
  return score === 0 ? "rgb(var(--ink-3))" : "rgb(var(--ink-1))";
}

function BucketCard({
  cell,
  active,
  onClick,
}: {
  cell: HeatmapCell;
  active: boolean;
  onClick: () => void;
}) {
  const score = cell.score;
  const count = cell.count;
  const hasData = score !== null && count > 0;
  const bg = bucketCellColor(score);
  // Direction-bar fill width
  const barWidth = score === null ? 0 : Math.min(100, Math.abs(score)) / 2;
  const barColor =
    score === null ? "rgb(var(--ink-5))"
    : score > 0 ? "rgb(var(--coop-1))"
    : score < 0 ? "rgb(var(--conflict-1))"
    : "rgb(var(--ink-4))";

  return (
    <div
      className={`bucket-card${active ? " active" : ""}${hasData ? "" : " bucket-card-empty"}`}
      onClick={onClick}
      style={{ background: bg }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <div className="bucket-card-pair">
        {cell.pair}
        {typeof cell.signalCount === "number" && cell.signalCount > 0 && (
          <span className="bucket-card-signal-badge" title={`${cell.signalCount} signal${cell.signalCount === 1 ? "" : "s"} surfaced for this cell — click to filter`}>
            {cell.signalCount}
          </span>
        )}
      </div>
      <div className="bucket-card-score" style={{ color: cellTextColor(score) }}>
        {score === null ? "—" : (score > 0 ? "+" : "") + score}
      </div>
      <div className="bucket-card-bar-wrap">
        {/* Centred direction bar showing magnitude + sign */}
        <span className="bucket-card-bar-zero" />
        <span
          className="bucket-card-bar-fill"
          style={{
            background: barColor,
            width: `${barWidth}%`,
            ...(score !== null && score < 0
              ? { right: "50%", left: "auto" }
              : { left: "50%", right: "auto" }),
          }}
        />
      </div>
      <div className="bucket-card-count">
        {count} claim{count !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function BucketGrid({
  cells,
  activeFilter,
  onCellClick,
}: {
  cells: HeatmapCell[];
  activeFilter: { pair: string; bucket: string } | null;
  onCellClick: (pair: string, bucket: string) => void;
}) {
  return (
    <div className="bucket-grid-wrap">
      <div className="tgfi-container">
        <div className="bucket-grid-head">
          <h2 className="bucket-grid-title">By dimension</h2>
          <p className="bucket-grid-sub">
            Claim-weighted average direction for each bucket × bilateral pair
            across the past 120 days. Cards reflect the corpus, not any single
            signal. Click a card to filter signals to that cell.
          </p>
        </div>

        {BUCKETS.map((bucket) => (
          <section key={bucket} className="bucket-grid-row">
            <header className="bucket-grid-row-head">
              <span className="bucket-grid-row-name">{bucket}</span>
              <span className="bucket-grid-row-rule" />
            </header>
            <div className="bucket-grid-row-cards">
              {PAIRS.map((pair) => {
                const cell = cells.find((c) => c.pair === pair && c.bucket === bucket) || {
                  pair, bucket, score: null, count: 0,
                };
                const active =
                  activeFilter?.pair === pair && activeFilter?.bucket === bucket;
                return (
                  <BucketCard
                    key={`${bucket}-${pair}`}
                    cell={cell}
                    active={active}
                    onClick={() => onCellClick(pair, bucket)}
                  />
                );
              })}
            </div>
          </section>
        ))}

        {activeFilter && (
          <div className="bucket-grid-filter-banner">
            Filtered to <strong>{activeFilter.pair} × {activeFilter.bucket}</strong>.{" "}
            <button
              onClick={() => onCellClick("", "")}
              className="bucket-grid-clear"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Keep the old Heatmap component name as an alias so HomeClient continues
// to mount the new BucketGrid via the existing call site.
const Heatmap = BucketGrid;

/* ─────────────────────────────────────────────────────────────
   Modal for compact-card expansion
   ───────────────────────────────────────────────────────────── */

function SignalModal({ signal, onClose }: { signal: SignalRow; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31, 35, 40, 0.5)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 100,
        overflowY: "auto",
        padding: "32px 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 900, margin: "0 auto" }}
      >
        <button
          onClick={onClose}
          style={{
            background: "rgb(var(--paper-2))",
            border: "1px solid rgb(var(--rule-1))",
            padding: "8px 16px",
            fontSize: 12,
            cursor: "pointer",
            marginBottom: 12,
            fontFamily: "var(--font-jetbrains-mono), monospace",
            letterSpacing: "0.05em",
          }}
        >
          ✕ Close
        </button>
        <SignalHero signal={signal} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   HomeClient — the master interactive component
   ───────────────────────────────────────────────────────────── */

export function HomeClient({
  signals,
  heatmap,
  stats,
}: {
  signals: SignalRow[];
  heatmap: HeatmapCell[];
  stats: StatsBlock;
}) {
  const [filter, setFilter] = useState<{ pair: string; bucket: string } | null>(null);
  const [modalSignal, setModalSignal] = useState<SignalRow | null>(null);

  const filteredSignals = useMemo(() => {
    if (!filter || (!filter.pair && !filter.bucket)) return signals;
    return signals.filter((s) => {
      const inPair = !filter.pair || s.pair === filter.pair;
      const inBucket = !filter.bucket || s.bucket === filter.bucket;
      return inPair && inBucket;
    });
  }, [signals, filter]);

  const top3 = filteredSignals.slice(0, 3);
  // Trim compact grid to a multiple of 3 so the last row is never an orphan
  // alone in a 3-column layout. With 10 total signals (3+7) the 7th compact
  // card would sit by itself at the bottom; drop to 6 (3+6=9 = two clean
  // rows of three).
  const restCandidates = filteredSignals.slice(3, 12);
  const rest = restCandidates.slice(0, Math.floor(restCandidates.length / 3) * 3);

  function handleCellClick(pair: string, bucket: string) {
    if (!pair && !bucket) {
      setFilter(null);
      // Return user to the top of the page when filter cleared so they see
      // the full hero set again.
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (filter?.pair === pair && filter?.bucket === bucket) {
      // Toggle off: same as clearing
      setFilter(null);
      return;
    }
    setFilter({ pair, bucket });
    // Smooth-scroll to the heroes container so the user sees signals
    // recompose after applying a filter. Use rAF + small delay so the
    // React state update commits first.
    requestAnimationFrame(() => {
      setTimeout(() => {
        const heroContainer = document.querySelector(".tgfi-container");
        if (heroContainer) {
          heroContainer.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    });
  }

  return (
    <>
      <Masthead stats={stats} />

      <div className="tgfi-container">
        {top3.length === 0 && (
          <div style={{ padding: "48px 0", color: "rgb(var(--ink-3))", fontSize: 14, textAlign: "center" }}>
            No signals match the current filter. <button
              onClick={() => setFilter(null)}
              style={{ background: "none", border: "none", color: "rgb(var(--accent-1))", cursor: "pointer", textDecoration: "underline" }}
            >Clear filter</button> to see all signals.
          </div>
        )}
        {top3.map((s) => <SignalHero key={s.id} signal={s} />)}
      </div>

      {!filter && <Heatmap cells={heatmap} activeFilter={filter} onCellClick={handleCellClick} />}
      {filter && <Heatmap cells={heatmap} activeFilter={filter} onCellClick={handleCellClick} />}

      {rest.length > 0 && (
        <div className="tgfi-container">
          <div className="tgfi-section-rule">
            <h2>Additional signals</h2>
            <span className="sec-meta">#{top3.length + 1}–#{top3.length + rest.length} of {filteredSignals.length}</span>
          </div>
          <div className="compact-grid">
            {rest.map((s) => (
              <SignalCompact key={s.id} signal={s} onExpand={() => setModalSignal(s)} />
            ))}
          </div>
        </div>
      )}

      <footer className="tgfi-footer">
        <div className="tgfi-container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16 }}>
            <span>TGFI · Trilateral Geoeconomic Fragmentation Index · Private research preview</span>
            <span>
              <a href="/methodology">Methodology</a>
              <span style={{ margin: "0 12px", color: "rgb(var(--ink-5))" }}>·</span>
              <a href="/sources">Sources</a>
              <span style={{ margin: "0 12px", color: "rgb(var(--ink-5))" }}>·</span>
              <a href="/api/auth" onClick={(e) => {
                e.preventDefault();
                fetch("/api/auth", { method: "GET" }).then(() => window.location.href = "/login");
              }}>Sign out</a>
            </span>
          </div>
          <div style={{ marginTop: 12, color: "rgb(var(--ink-5))", fontSize: 11 }}>
            {stats.articles.toLocaleString()} articles · {stats.claims.toLocaleString()} claims · {stats.sources} sources · {stats.signals} active signals
          </div>
        </div>
      </footer>

      {modalSignal && <SignalModal signal={modalSignal} onClose={() => setModalSignal(null)} />}
    </>
  );
}
