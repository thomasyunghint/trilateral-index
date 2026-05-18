interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg" | "xl";
  showSign?: boolean;
  className?: string;
}

export function getScoreColor(score: number): string {
  if (!Number.isFinite(score)) return "text-text-muted";
  if (score >= 30) return "text-cooperation";
  if (score >= 10) return "text-cooperation-weak";
  if (score > -10) return "text-neutral";
  if (score > -30) return "text-conflict-weak";
  return "text-conflict";
}

function getScoreBgStyle(score: number): string {
  if (!Number.isFinite(score)) return "bg-bg-surface/30";
  if (score >= 10) return "bg-cooperation/10";
  if (score > -10) return "bg-neutral/8";
  return "bg-conflict/10";
}

const SIZES = {
  sm: "text-sm px-1.5 py-0.5",
  md: "text-base px-2 py-1",
  lg: "text-xl px-3 py-1.5",
  xl: "text-3xl px-4 py-2",
};

export function ScoreBadge({ score, size = "md", showSign = true, className = "" }: ScoreBadgeProps) {
  const color = getScoreColor(score);
  const bg = getScoreBgStyle(score);
  const sizeClass = SIZES[size];

  // Guard against NaN/Infinity → display em-dash placeholder
  if (!Number.isFinite(score)) {
    return (
      <span className={`score-value inline-flex items-center rounded ${sizeClass} ${color} ${bg} ${className}`}>
        &mdash;
      </span>
    );
  }

  // Treat tiny scores as 0 to avoid "-0.0" display
  const displayScore = Math.abs(score) < 0.05 ? 0 : score;
  const sign = showSign && displayScore > 0 ? "+" : "";

  return (
    <span className={`score-value inline-flex items-center rounded ${sizeClass} ${color} ${bg} ${className}`}>
      {sign}{displayScore.toFixed(1)}
    </span>
  );
}

export function DirectionLabel({ score }: { score: number }) {
  const color = getScoreColor(score);
  if (!Number.isFinite(score)) {
    return <span className={`text-xs uppercase tracking-wider font-mono ${color}`}>No data</span>;
  }
  let label: string;
  if (score >= 50) label = "Strong Cooperation";
  else if (score >= 15) label = "Cooperation";
  else if (score > -15) label = "Neutral";
  else if (score > -50) label = "Conflict";
  else label = "Strong Conflict";

  return <span className={`text-xs uppercase tracking-wider font-mono ${color}`}>{label}</span>;
}
