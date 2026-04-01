"use client";

import { useState, useRef } from "react";
import { getMockTimeSeries, getMockMonthlyTimeSeries } from "@/lib/mock-data";
import type { Bucket, BilateralPair } from "@/lib/types";
import type { Granularity } from "./trilateral-diagram";

interface SparklineProps {
  pair: BilateralPair;
  bucket: Bucket;
  className?: string;
  granularity?: Granularity;
}

export function Sparkline({ pair, bucket, className = "", granularity = "Q" }: SparklineProps) {
  const data = granularity === "M"
    ? getMockMonthlyTimeSeries(pair, bucket)
    : getMockTimeSeries(pair, bucket);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 200;
  const H = 48;
  const PAD = 4;

  const scores = data.map((d) => d.score);

  /* Fixed ±100 scale so sparklines are visually comparable */
  const minS = -100;
  const maxS = 100;
  const range = maxS - minS;

  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const points = scores.map((s, i) => ({
    x: PAD + (i / (scores.length - 1)) * innerW,
    y: PAD + ((maxS - s) / range) * innerH,
  }));

  const zeroY = PAD + (maxS / range) * innerH;
  const first = points[0];
  const last = points[points.length - 1];
  const lastScore = scores[scores.length - 1];

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`,
    )
    .join(" ");

  const areaPath = `${linePath} L${last.x.toFixed(1)},${zeroY.toFixed(1)} L${first.x.toFixed(1)},${zeroY.toFixed(1)} Z`;

  const color =
    lastScore >= 10
      ? "rgb(var(--cooperation))"
      : lastScore <= -10
        ? "rgb(var(--conflict))"
        : "rgb(var(--neutral))";

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(xRatio * (scores.length - 1));
    setHoverIdx(Math.max(0, Math.min(scores.length - 1, idx)));
  };

  const hoveredPoint = hoverIdx !== null ? points[hoverIdx] : null;
  const hoveredData = hoverIdx !== null ? data[hoverIdx] : null;
  const hoveredScore = hoverIdx !== null ? scores[hoverIdx] : null;
  const hoverColor =
    hoveredScore !== null
      ? hoveredScore >= 10
        ? "rgb(var(--cooperation))"
        : hoveredScore <= -10
          ? "rgb(var(--conflict))"
          : "rgb(var(--neutral))"
      : color;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full h-full ${className}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Zero line */}
        <line
          x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY}
          stroke="rgb(var(--border))" strokeWidth="0.5" opacity="0.4"
        />
        {/* Area fill */}
        <path d={areaPath} fill={color} opacity="0.1" />
        {/* Line */}
        <path
          d={linePath} fill="none" stroke={color}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        />
        {/* Current-value dot */}
        <circle cx={last.x} cy={last.y} r="2.5" fill={color} />

        {/* Hover crosshair + dot */}
        {hoveredPoint && (
          <>
            <line
              x1={hoveredPoint.x} y1={PAD} x2={hoveredPoint.x} y2={H - PAD}
              stroke="rgb(var(--text-muted))" strokeWidth="0.5" opacity="0.5"
              strokeDasharray="2,2"
            />
            <circle
              cx={hoveredPoint.x} cy={hoveredPoint.y} r="3.5"
              fill="rgb(var(--bg-primary))" stroke={hoverColor} strokeWidth="1.5"
            />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hoveredData && hoveredPoint && (
        <div
          className="absolute -top-8 pointer-events-none z-10"
          style={{
            left: `${(hoveredPoint.x / W) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="bg-[rgb(var(--text-primary))] text-[rgb(var(--bg-primary))] text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap shadow-md">
            {hoveredData.period}: {hoveredScore! > 0 ? "+" : ""}{hoveredScore}
          </div>
        </div>
      )}
    </div>
  );
}
