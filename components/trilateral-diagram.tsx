"use client";

import { Play, Pause } from "lucide-react";
import {
  MOCK_SUMMARY,
  QUARTERLY_PAIR_SCORES,
  MONTHLY_PAIR_SCORES,
} from "@/lib/mock-data";
import type { BilateralPair } from "@/lib/types";

export type Granularity = "Q" | "M";

export function getTimelineData(granularity: Granularity) {
  return granularity === "Q" ? QUARTERLY_PAIR_SCORES : MONTHLY_PAIR_SCORES;
}

interface TrilateralDiagramProps {
  className?: string;
  selectedPair?: BilateralPair | null;
  onSelectPair?: (pair: BilateralPair) => void;
  // Timeline state — controlled from parent
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;
  timelineIdx: number;
  setTimelineIdx: (idx: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

const W = 440;
const H = 420;

const NODES: Record<string, { x: number; y: number; name: string }> = {
  CN: { x: 220, y: 60, name: "China" },
  US: { x: 50, y: 330, name: "United States" },
  EU: { x: 390, y: 330, name: "European Union" },
};

const EDGES: {
  pair: BilateralPair;
  from: string;
  to: string;
}[] = [
  { pair: "CN-US", from: "CN", to: "US" },
  { pair: "CN-EU", from: "CN", to: "EU" },
  { pair: "US-EU", from: "US", to: "EU" },
];

function edgeColor(score: number): string {
  if (score >= 10) return "rgb(var(--cooperation))";
  if (score <= -10) return "rgb(var(--conflict))";
  return "rgb(var(--neutral))";
}

function edgeWidth(score: number): number {
  return 1.5 + (Math.abs(score) / 100) * 2.5;
}

/** Format period label for tick marks */
function tickLabel(period: string, granularity: Granularity): string {
  if (granularity === "Q") return period.replace("20", "'");
  const [y, m] = period.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} '${y.slice(2)}`;
}

export function TrilateralDiagram({
  className = "",
  selectedPair,
  onSelectPair,
  granularity,
  setGranularity,
  timelineIdx,
  setTimelineIdx,
  isPlaying,
  setIsPlaying,
}: TrilateralDiagramProps) {
  const data = getTimelineData(granularity);
  const safeIdx = Math.min(timelineIdx, data.length - 1);
  const current = data[safeIdx];
  const isLive = safeIdx === data.length - 1;

  const getScore = (pair: BilateralPair): number => {
    if (isLive) return MOCK_SUMMARY.pairs[pair].overallScore;
    return current.scores[pair];
  };

  const handlePlay = () => {
    if (safeIdx >= data.length - 1) setTimelineIdx(0);
    setIsPlaying(true);
  };

  const showTick = (i: number) => {
    if (granularity === "Q") return true;
    return i === 0 || i === data.length - 1 || (i + 1) % 3 === 0;
  };

  return (
    <div className={`${className} space-y-3`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-[460px] mx-auto"
        role="img"
        aria-label={`Trilateral relationship diagram for ${current.period}`}
      >
        {/* Edges */}
        {EDGES.map(({ pair, from, to }) => {
          const score = getScore(pair);
          const color = edgeColor(score);
          const width = edgeWidth(score);
          const isSelected = selectedPair === pair;
          const isDimmed = selectedPair !== null && !isSelected;
          const f = NODES[from];
          const t = NODES[to];
          const mx = (f.x + t.x) / 2;
          const my = (f.y + t.y) / 2;

          return (
            <g
              key={pair}
              onClick={() => onSelectPair?.(pair)}
              className="cursor-pointer"
              style={{ opacity: isDimmed ? 0.15 : 1, transition: "opacity 0.3s ease" }}
            >
              <line x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                stroke={color} strokeWidth={width + 8} strokeLinecap="round"
                opacity={isSelected ? 0.12 : 0.05}
                style={{ transition: "stroke 0.5s ease" }} />
              <line x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                stroke={color} strokeWidth={isSelected ? width + 0.5 : width}
                strokeLinecap="round"
                style={{ transition: "stroke 0.5s ease, stroke-width 0.3s ease" }} />
              <line x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                stroke="transparent" strokeWidth="24" />
              <rect x={mx - 26} y={my - 18} width="52" height="36" rx="5"
                fill="rgb(var(--bg-secondary))" stroke={color} strokeWidth="0.75"
                style={{ transition: "stroke 0.5s ease" }} />
              <text x={mx} y={my - 5} textAnchor="middle"
                fill="rgb(var(--text-muted))" fontSize="9"
                fontFamily="var(--font-inter), sans-serif"
                fontWeight="500" letterSpacing="0.03em">{pair}</text>
              <text x={mx} y={my + 10} textAnchor="middle"
                fill={color} fontSize="13"
                fontFamily="var(--font-jetbrains-mono), monospace"
                fontWeight="600" style={{ transition: "fill 0.5s ease" }}>
                {score > 0 ? "+" : ""}{Math.round(score)}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {Object.entries(NODES).map(([key, node]) => (
          <g key={key}>
            <circle cx={node.x} cy={node.y} r="28" fill="rgb(var(--bg-tertiary))" />
            <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="central"
              fill="rgb(var(--text-primary))" fontSize="18" fontWeight="600"
              fontFamily="var(--font-inter), sans-serif" letterSpacing="0.05em">{key}</text>
            <text x={node.x} y={node.y + 46} textAnchor="middle"
              fill="rgb(var(--text-muted))" fontSize="11"
              fontFamily="var(--font-inter), sans-serif">{node.name}</text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="max-w-[300px] mx-auto space-y-1">
        <div className="h-2 rounded-full bg-gradient-to-r from-conflict via-neutral to-cooperation" />
        <div className="flex justify-between text-[10px] text-text-muted font-mono">
          <span>-100 Conflict</span><span>0</span><span>+100 Cooperation</span>
        </div>
      </div>

      {/* Timeline controls */}
      <div className="max-w-[460px] mx-auto pt-2 space-y-2">
        <div className="flex items-center gap-3">
          <button
            onClick={isPlaying ? () => setIsPlaying(false) : handlePlay}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border hover:bg-bg-hover transition-colors"
            aria-label={isPlaying ? "Pause" : "Play timeline"}
          >
            {isPlaying ? (
              <Pause size={14} className="text-text-secondary" />
            ) : (
              <Play size={14} className="text-text-secondary ml-0.5" />
            )}
          </button>

          <div className="flex-1 relative">
            <input type="range" min={0} max={data.length - 1} value={safeIdx}
              onChange={(e) => { setIsPlaying(false); setTimelineIdx(Number(e.target.value)); }}
              className="timeline-slider w-full" />
            <div className="flex justify-between mt-1 px-0.5">
              {data.map((q, i) =>
                showTick(i) ? (
                  <button key={q.period}
                    onClick={() => { setIsPlaying(false); setTimelineIdx(i); }}
                    className={`text-[9px] font-mono transition-colors whitespace-nowrap ${
                      i === safeIdx ? "text-accent font-semibold" : "text-text-muted hover:text-text-secondary"
                    }`}>{tickLabel(q.period, granularity)}</button>
                ) : <span key={q.period} />
              )}
            </div>
          </div>

          <div className="flex h-8 shrink-0 rounded-md border border-border overflow-hidden">
            {(["Q", "M"] as Granularity[]).map((g) => (
              <button key={g} onClick={() => setGranularity(g)}
                className={`px-2.5 text-xs font-mono font-medium transition-colors ${
                  granularity === g
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                }`}>{g}</button>
            ))}
          </div>
        </div>

        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-text-secondary">
            {isLive && <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />}
            {current.period}
            {isLive && <span className="text-accent text-[10px]">LIVE</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
