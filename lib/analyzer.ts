/**
 * Phase 3.5: Insight Analyzer
 * Takes a detected signal and writes a full analysis paragraph using Opus.
 * This is the "so what" layer — explains implications like a Eurasia Group brief.
 */
import Anthropic from "@anthropic-ai/sdk";
import { Signal } from "./detector";

// Memoize client to avoid recreating per call (and reuse HTTP connection pool)
let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

function buildAnalysisPrompt(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const nextQuarter = ((Math.floor(now.getUTCMonth() / 3) + 1) % 4) + 1;
  const nextQuarterYear = nextQuarter === 1 ? year + 1 : year;

  return `You are a senior geopolitical economics analyst writing for institutional investors.
Today is ${month}, ${year}. The detected pattern below describes events that have already happened in the corpus.
Write a concise analysis brief looking FORWARD from today's perspective.

OUTPUT REQUIREMENTS:
- Title: sharp, descriptive (max 12 words)
- Analysis: exactly 3-4 sentences. Sentence 1: state the divergence/pattern clearly. Sentence 2: explain WHY this matters (implication). Sentence 3: what to WATCH NEXT. Sentence 4 (optional): who benefits/loses.
- Confidence: your assessment 1-10 of how significant this is
- Tags: 1-3 relevant keywords

CRITICAL: Any dates you mention must be from ${year} or later. The "watch next" sentence should reference real upcoming events (e.g. "Q${nextQuarter} ${nextQuarterYear}", "next ECB meeting", "upcoming G7 summit") — never reference past quarters or years. Do not invent specific dates beyond what's plausible given today.

Write in the style of Eurasia Group or Bridgewater Daily Observations. Be specific. No hedging language like "it remains to be seen." Every sentence must add new information.

OUTPUT FORMAT (JSON):
{
  "title": "...",
  "analysis": "...",
  "confidence": 8,
  "tags": ["EU bifurcation", "tech containment"]
}`;
}

export type AnalyzedSignal = Signal & {
  analysis?: {
    title: string;
    analysis: string;
    confidence: number;
    tags: string[];
  };
};

async function callOnce(
  client: Anthropic,
  signal: Signal,
  evidenceText: string,
  attempt: number,
): Promise<{ title: string; analysis: string; confidence?: number; tags?: string[] } | null> {
  // Reinforce JSON structure on retry — Sonnet occasionally prose-wraps the
  // first response. The second attempt asks for valid JSON only.
  const userBase = `DETECTED PATTERN: ${signal.pattern_type}\n\nSUMMARY: ${signal.summary}\n\nSUPPORTING EVIDENCE:\n${evidenceText}\n\nPAIRS: ${signal.pairs.join(", ")}\nSCORE: ${signal.score}/100`;
  const userMsg = attempt === 0
    ? `${userBase}\n\nWrite the analysis brief.`
    : `${userBase}\n\nReturn ONLY a valid JSON object matching the schema. No prose, no markdown fences. JSON only.`;

  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_ANALYSIS_MODEL || "claude-sonnet-4-5",
      max_tokens: 500,
      messages: [{ role: "user", content: userMsg }],
      system: buildAnalysisPrompt(),
    });
    if (!response.content || response.content.length === 0) return null;
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.title === "string" && typeof parsed.analysis === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function analyzeSignal(signal: Signal): Promise<AnalyzedSignal> {
  const client = getClient();
  if (!client) return signal;

  const evidenceText = signal.evidence.claims
    .map(c => `- [${c.source}] (${c.date ? String(c.date).slice(0, 10) : "unknown date"}): "${c.text}" [direction: ${c.direction}, bucket: ${c.bucket}]`)
    .join("\n");

  // Try once; if parse/validation fails retry with stricter JSON-only ask.
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callOnce(client, signal, evidenceText, attempt);
    if (raw) {
      return {
        ...signal,
        analysis: {
          title: raw.title,
          analysis: raw.analysis,
          confidence: typeof raw.confidence === "number" ? raw.confidence : 5,
          tags: Array.isArray(raw.tags) ? raw.tags : [],
        },
      };
    }
    if (attempt === 0) {
      console.error(`Sonnet analysis attempt 1 failed for signal "${signal.title.slice(0, 40)}", retrying…`);
    }
  }
  console.error(`Sonnet analysis failed twice for signal "${signal.title.slice(0, 40)}", falling back to raw summary`);
  return signal;
}

/**
 * Analyze top N signals with Opus/Sonnet.
 * Only processes the highest-scoring signals to save budget.
 */
export async function analyzeTopSignals(signals: Signal[], topN: number = 5): Promise<AnalyzedSignal[]> {
  const top = signals.slice(0, topN);
  const analyzed: AnalyzedSignal[] = [];

  for (const signal of top) {
    const result = await analyzeSignal(signal);
    analyzed.push(result);
  }

  // Append remaining signals without analysis
  for (const signal of signals.slice(topN)) {
    analyzed.push(signal);
  }

  return analyzed;
}
