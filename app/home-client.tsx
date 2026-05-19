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
  count: number;
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
  const compositeLabel =
    cred.composite >= 0.8 ? "High"
    : cred.composite >= 0.6 ? "Moderate-High"
    : cred.composite >= 0.4 ? "Moderate"
    : "Low";

  const rows: Array<[string, number, string]> = [
    ["Source tier", cred.sourceTier, cred.tierLabel || "—"],
    ["Source diversity", cred.sourceDiversity, `${cred.sourceCount} source${cred.sourceCount !== 1 ? "s" : ""}`],
    ["Sample size", cred.sampleSize, `N=${cred.claimCount} claim${cred.claimCount !== 1 ? "s" : ""}`],
    ["Detection margin", cred.detectionMargin, `${Math.round(cred.detectionMargin * 100)}%`],
    ["Reproducibility", cred.reproducibility, "rule-based"],
  ];

  return (
    <div className="cred-panel">
      <div className="signal-hero-section-label">Credibility</div>
      {rows.map(([label, value, hint]) => (
        <div key={label} className="cred-row">
          <span className="cred-label">{label} <span style={{ color: "rgb(var(--ink-4))", marginLeft: 4 }}>({hint})</span></span>
          <span className="cred-bar">
            <span className="cred-bar-fill" style={{ width: `${clamp(value, 0, 1) * 100}%` }} />
          </span>
        </div>
      ))}
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

  return (
    <div className="fav-panel">
      <div className="signal-hero-section-label">Favorability</div>
      <div className="fav-headline">
        {isFlip ? (
          <>Δ direction {windowDays ? `over ${windowDays} days` : ""}: {fav.fromDirection > 0 ? "+" : ""}{fav.fromDirection} → {fav.toDirection > 0 ? "+" : ""}{fav.toDirection}</>
        ) : (
          <>Current direction: {fav.toDirection > 0 ? "+" : ""}{fav.toDirection}</>
        )}
      </div>
      <div className="fav-bar-track" aria-label="direction from conflict to cooperation">
        <span className="fav-bar-zero" />
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
          Net shift: {fav.delta > 0 ? "+" : ""}{fav.delta} ± {fav.ci} points (95% CI)
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
    return (
      <div className={`evidence-quote ${cls}`}>
        <div className="evidence-quote-label">{label}</div>
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
          {c.paper_url && (
            <>{" · "}<a href={c.paper_url} target="_blank" rel="noopener noreferrer">view ↗</a></>
          )}
        </div>
      </div>
    );
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
        {items.map((c) => (
          <div key={c.id} className="dissenting-item">
            <div className="dissenting-source">
              {c.source} · {formatDateShort(c.date)} · direction {c.direction > 0 ? "+" : ""}{c.direction}
            </div>
            &ldquo;{c.text}&rdquo;
          </div>
        ))}
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

function Sparkline({ data }: { data: Array<{ date: string; direction: number }> }) {
  if (!data || data.length < 2) return null;
  const W = 600;
  const H = 80;
  const PAD = 10;

  const xs = data.map((d) => new Date(d.date).getTime());
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xRange = Math.max(xMax - xMin, 1);
  const yRange = 200; // -100 to +100

  const toX = (x: number) => PAD + ((x - xMin) / xRange) * (W - PAD * 2);
  const toY = (y: number) => PAD + ((100 - y) / yRange) * (H - PAD * 2);

  const path = data.map((d, i) => {
    const x = toX(new Date(d.date).getTime());
    const y = toY(d.direction);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const zeroY = toY(0);

  return (
    <section className="signal-hero-section">
      <div className="signal-hero-section-label">Direction Over Time · 90 Days</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="sparkline-svg" preserveAspectRatio="none">
        <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="rgb(var(--rule-2))" strokeWidth="1" strokeDasharray="2 3" />
        <path d={path} stroke="rgb(var(--ink-1))" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle
            key={i}
            cx={toX(new Date(d.date).getTime())}
            cy={toY(d.direction)}
            r="2"
            fill="rgb(var(--ink-1))"
          />
        ))}
      </svg>
      <div className="sparkline-caption">
        Each point = one claim&rsquo;s direction · &minus;100 conflict / +100 cooperation
      </div>
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
    <section className="signal-hero-section">
      <div className="signal-hero-section-label">Methodology</div>
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
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Hero signal card
   ───────────────────────────────────────────────────────────── */

function SignalHero({ signal }: { signal: SignalRow }) {
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
        <span className="signal-hero-refresh">↻ {formatRelativeTime(signal.detected_at)}</span>
      </div>

      <h2 className="signal-hero-headline">{signal.headline}</h2>

      <div className="signal-hero-meta-grid">
        <CredibilityPanel cred={signal.credibility} />
        <FavorabilityPanel
          fav={signal.favorability}
          baselineSigma={signal.baselineSigma}
          windowDays={signal.window_days}
        />
      </div>

      <section className="signal-hero-section">
        <div className="signal-hero-section-label">Interpretation</div>
        <div className="signal-interpretation">
          {signal.interpretation.split(/(?=→ Watch:|Watch:)/).map((part, i) =>
            part.startsWith("→") || part.startsWith("Watch:") ? (
              <div key={i} className="watch-line">{part}</div>
            ) : (
              <p key={i} style={{ margin: 0 }}>{part}</p>
            )
          )}
        </div>
      </section>

      <EvidenceBlock signal={signal} />
      {signal.dissenting && signal.dissenting.length > 0 && (
        <DissentingEvidence items={signal.dissenting} signal={signal} />
      )}
      {signal.sparkline && signal.sparkline.length >= 2 && (
        <Sparkline data={signal.sparkline} />
      )}
      <MethodologyBlock signal={signal} />

      <footer className="signal-hero-footer">
        <div className="signal-tags">
          {signal.tags.length > 0 ? (
            signal.tags.map((t) => <span key={t} className="signal-tag">{t}</span>)
          ) : (
            <span className="signal-tag">{signal.pair}</span>
          )}
        </div>
        <div className="signal-tag" style={{ color: "rgb(var(--ink-4))" }}>
          Signal ID {signal.id.slice(0, 8)}
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
  const intensity = Math.min(1, Math.abs(score) / 80);
  if (score > 0) {
    return `rgba(26, 127, 55, ${0.1 + intensity * 0.4})`;
  } else if (score < 0) {
    return `rgba(207, 34, 46, ${0.1 + intensity * 0.4})`;
  } else {
    return "rgba(101, 109, 118, 0.08)";
  }
}

function cellTextColor(score: number | null): string {
  if (score === null) return "rgb(var(--ink-4))";
  return score === 0 ? "rgb(var(--ink-3))" : "rgb(var(--ink-1))";
}

function Heatmap({
  cells,
  activeFilter,
  onCellClick,
}: {
  cells: HeatmapCell[];
  activeFilter: { pair: string; bucket: string } | null;
  onCellClick: (pair: string, bucket: string) => void;
}) {
  return (
    <div className="heatmap-wrap">
      <div className="tgfi-container">
        <h2 className="heatmap-label">The pulse</h2>
        <p className="heatmap-sub">
          Average claim direction by pair × bucket over the past 120 days.
          Click any cell to filter signals below.
        </p>
        <table className="heatmap-table">
          <thead>
            <tr>
              <th></th>
              {BUCKETS.map((b) => <th key={b}>{b}</th>)}
            </tr>
          </thead>
          <tbody>
            {PAIRS.map((p) => (
              <tr key={p}>
                <th>{p}</th>
                {BUCKETS.map((b) => {
                  const cell = cells.find((c) => c.pair === p && c.bucket === b);
                  const score = cell?.score ?? null;
                  const count = cell?.count ?? 0;
                  const active = activeFilter?.pair === p && activeFilter?.bucket === b;
                  return (
                    <td
                      key={`${p}-${b}`}
                      className={active ? "active" : ""}
                      style={{
                        background: bucketCellColor(score),
                        color: cellTextColor(score),
                      }}
                      onClick={() => onCellClick(p, b)}
                    >
                      <span className="heatmap-cell-score">
                        {score === null ? "—" : (score > 0 ? "+" : "") + score}
                      </span>
                      <span className="heatmap-cell-count">{count} claim{count !== 1 ? "s" : ""}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {activeFilter && (
          <div style={{ marginTop: 16, fontSize: 12, color: "rgb(var(--ink-3))" }}>
            Filtered to {activeFilter.pair} × {activeFilter.bucket}.{" "}
            <button
              onClick={() => onCellClick("", "")}
              style={{
                background: "none",
                border: "none",
                color: "rgb(var(--accent-1))",
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
                fontSize: 12,
              }}
            >Clear filter</button>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const rest = filteredSignals.slice(3, 10);

  function handleCellClick(pair: string, bucket: string) {
    if (!pair && !bucket) {
      setFilter(null);
      return;
    }
    if (filter?.pair === pair && filter?.bucket === bucket) {
      setFilter(null);
    } else {
      setFilter({ pair, bucket });
    }
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
