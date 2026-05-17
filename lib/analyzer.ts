/**
 * Phase 3.5: Insight Analyzer
 * Takes a detected signal and writes a full analysis paragraph using Opus.
 * This is the "so what" layer — explains implications like a Eurasia Group brief.
 */
import Anthropic from "@anthropic-ai/sdk";
import { Signal } from "./detector";

const ANALYSIS_PROMPT = `You are a senior geopolitical economics analyst writing for institutional investors.
Given a detected PATTERN in trilateral (China-US-EU) relations, write a concise analysis brief.

OUTPUT REQUIREMENTS:
- Title: sharp, descriptive (max 12 words)
- Analysis: exactly 3-4 sentences. Sentence 1: state the divergence/pattern clearly. Sentence 2: explain WHY this matters (implication). Sentence 3: what to WATCH NEXT. Sentence 4 (optional): who benefits/loses.
- Confidence: your assessment 1-10 of how significant this is
- Tags: 1-3 relevant keywords

Write in the style of Eurasia Group or Bridgewater Daily Observations. Be specific. No hedging language like "it remains to be seen." Every sentence must add new information.

OUTPUT FORMAT (JSON):
{
  "title": "...",
  "analysis": "...",
  "confidence": 8,
  "tags": ["EU bifurcation", "tech containment"]
}`;

export type AnalyzedSignal = Signal & {
  analysis?: {
    title: string;
    analysis: string;
    confidence: number;
    tags: string[];
  };
};

export async function analyzeSignal(signal: Signal): Promise<AnalyzedSignal> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return signal;

  const client = new Anthropic({ apiKey });

  const evidenceText = signal.evidence.claims
    .map(c => `- [${c.source}] (${c.date ? String(c.date).slice(0, 10) : "unknown date"}): "${c.text}" [direction: ${c.direction}, bucket: ${c.bucket}]`)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514", // TODO: migrate to newer model before June 15 EOL
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `DETECTED PATTERN: ${signal.pattern_type}\n\nSUMMARY: ${signal.summary}\n\nSUPPORTING EVIDENCE:\n${evidenceText}\n\nPAIRS: ${signal.pairs.join(", ")}\nSCORE: ${signal.score}/100\n\nWrite the analysis brief.`,
        },
      ],
      system: ANALYSIS_PROMPT,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      return { ...signal, analysis };
    }
  } catch (err) {
    console.error(`Analysis failed for signal: ${(err as Error).message?.slice(0, 50)}`);
  }

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
