/**
 * Trade Bucket Classification Rubric
 *
 * This file defines the EXACT criteria by which articles are scored on the
 * trade fragmentation–cooperation spectrum [-100, +100].
 *
 * Used by:
 *  1. LLM classifier (Claude Opus) — as the system prompt
 *  2. Human labelers — as the reference standard for gold labels
 *
 * Academic basis:
 *  - Gentzkow, Kelly & Taddy (2019) "Text as Data" — 3-step pipeline
 *  - Anderson & van Wincoop (2003) — gravity model baseline
 *  - Egami et al. (2023) — design-based supervised learning with ~100 labels
 *
 * IMPORTANT: Any change to this rubric requires re-running both LLM
 * classification AND human validation on the gold-standard set.
 */

import type { RubricCriterion, ClassificationInput, ClassificationOutput } from "./types";

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 1: SCORE ANCHORS
 *
 * These 9 anchor points define what each score range MEANS.
 * Both the LLM and human labeler use these as reference.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const SCORE_ANCHORS = [
  {
    range: [-100, -80],
    label: "Severe Fragmentation",
    description:
      "Complete trade breakdown or near-total decoupling in a major sector. " +
      "Examples: full embargo, blanket import ban, total export prohibition on critical goods.",
    humanInstruction:
      "Use this range ONLY if the article documents a near-complete severance " +
      "of bilateral trade in a significant category (>50% decline or total ban).",
  },
  {
    range: [-80, -60],
    label: "Major Fragmentation",
    description:
      "Large-scale trade barriers or severe bilateral trade decline. " +
      "Examples: broad tariff escalation (>25%), major export control packages, " +
      "large quantified trade diversion (>$50B or >30% decline).",
    humanInstruction:
      "The article must contain quantified evidence of large trade decline or " +
      "document a major new trade barrier with measurable bilateral impact.",
  },
  {
    range: [-60, -40],
    label: "Significant Fragmentation",
    description:
      "Substantial trade barriers or documented bilateral trade contraction. " +
      "Examples: sector-specific tariffs (15-25%), targeted export controls, " +
      "quantified trade decline (15-30%), supply chain diversification away from partner.",
    humanInstruction:
      "Look for specific numbers: tariff rates, percentage trade declines, " +
      "dollar values of affected trade. The impact should be clearly bilateral.",
  },
  {
    range: [-40, -20],
    label: "Moderate Fragmentation",
    description:
      "Meaningful but limited trade friction. " +
      "Examples: anti-dumping investigations, new non-tariff barriers (SPS, TBT), " +
      "partial compliance with trade agreements, moderate trade diversion.",
    humanInstruction:
      "The article describes real trade friction, but it is either limited in scope " +
      "(one sector, one product category) or partially offset by mitigating factors.",
  },
  {
    range: [-20, -1],
    label: "Mild Fragmentation",
    description:
      "Minor trade irritants or early-stage policy moves that could escalate. " +
      "Examples: investigation announcements, rhetorical escalation, " +
      "small compliance gaps, minor regulatory divergence.",
    humanInstruction:
      "The signal is negative but weak. The article describes friction without " +
      "large quantified impact, or the negative effect is speculative/forward-looking.",
  },
  {
    range: [0, 0],
    label: "Neutral",
    description:
      "No clear signal in either direction, or perfectly offsetting signals. " +
      "Examples: routine trade statistics with no notable change, " +
      "procedural WTO filings, purely descriptive analysis.",
    humanInstruction:
      "Use 0 when the article is about bilateral trade but contains no directional signal. " +
      "Also use 0 when positive and negative signals are exactly balanced.",
  },
  {
    range: [1, 20],
    label: "Mild Cooperation",
    description:
      "Minor positive trade developments. " +
      "Examples: trade talks announced, small tariff reductions, " +
      "partial agreement compliance, positive rhetoric about trade relations.",
    humanInstruction:
      "The signal is positive but weak. No large quantified impact. " +
      "Announcements of intent without concrete implementation.",
  },
  {
    range: [20, 60],
    label: "Significant Cooperation",
    description:
      "Meaningful trade liberalization or bilateral trade expansion. " +
      "Examples: tariff reductions (>10%), mutual recognition agreements, " +
      "new trade agreements, quantified bilateral trade growth (>15%).",
    humanInstruction:
      "The article must document concrete trade facilitation with measurable impact. " +
      "Look for signed agreements, implemented tariff cuts, or quantified trade growth.",
  },
  {
    range: [60, 100],
    label: "Major Cooperation",
    description:
      "Transformative trade integration or resolution of major disputes. " +
      "Examples: comprehensive FTA signing/implementation, removal of major trade barriers " +
      "(>$5B impact), resolution of long-standing trade disputes.",
    humanInstruction:
      "Reserve for landmark events: FTA ratification, permanent removal of major tariffs, " +
      "or resolution of decade-long trade disputes with quantified bilateral benefit.",
  },
] as const;

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 2: RUBRIC CRITERIA
 *
 * Each criterion is a specific, observable signal that the classifier
 * (human or LLM) should look for. Criteria have IDs so we can track
 * which ones were triggered for each classification.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const TRADE_CRITERIA: RubricCriterion[] = [
  // ── Fragmentation signals ──
  {
    id: "T-FRAG-01",
    label: "Tariff Imposition/Escalation",
    description:
      "New tariffs imposed or existing tariffs increased on bilateral trade. " +
      "Score magnitude depends on tariff rate and breadth of affected goods.",
    scoreRange: { min: -100, max: -20 },
    example:
      "\"The US imposed 25% tariffs on $200B of Chinese imports\" → score around -65",
  },
  {
    id: "T-FRAG-02",
    label: "Export Controls/Restrictions",
    description:
      "One country restricts exports of specific goods to the other. " +
      "Score depends on economic significance of controlled goods.",
    scoreRange: { min: -90, max: -30 },
    example:
      "\"China restricted gallium and germanium exports, reducing US supply by 35%\" → score around -68",
  },
  {
    id: "T-FRAG-03",
    label: "Quantified Trade Decline",
    description:
      "Empirical evidence (regression, gravity model, descriptive stats) of " +
      "bilateral trade volume falling below expected levels.",
    scoreRange: { min: -90, max: -15 },
    example:
      "\"US-China bilateral trade fell $180B below gravity-predicted levels\" → score around -65",
  },
  {
    id: "T-FRAG-04",
    label: "Trade Diversion",
    description:
      "Evidence that trade is being rerouted to third countries, indicating " +
      "bilateral relationship weakening.",
    scoreRange: { min: -70, max: -20 },
    example:
      "\"34% of US importers diversified away from Chinese suppliers to Vietnam\" → score around -52",
  },
  {
    id: "T-FRAG-05",
    label: "Non-Tariff Barriers",
    description:
      "New SPS, TBT, or regulatory barriers that specifically affect bilateral trade. " +
      "Includes anti-subsidy/anti-dumping investigations and countervailing duties.",
    scoreRange: { min: -70, max: -10 },
    example:
      "\"EU imposed 17-38% countervailing duties on Chinese EVs\" → score around -48",
  },
  {
    id: "T-FRAG-06",
    label: "Supply Chain Decoupling",
    description:
      "Deliberate government or firm-level policies to reduce bilateral " +
      "supply chain dependence (de-risking, reshoring, friend-shoring).",
    scoreRange: { min: -60, max: -15 },
    example:
      "\"EU reduced critical raw material import concentration from China from 62% to 54%\" → score around -32",
  },
  {
    id: "T-FRAG-07",
    label: "Sanctions/Embargo",
    description:
      "Broad trade sanctions or embargo on bilateral trade. " +
      "Highest severity fragmentation signal.",
    scoreRange: { min: -100, max: -60 },
    example:
      "\"Full US embargo on all technology exports to Country X\" → score around -90",
  },

  // ── Cooperation signals ──
  {
    id: "T-COOP-01",
    label: "Tariff Reduction/Elimination",
    description:
      "Bilateral tariff cuts, preferential tariff treatment, or tariff exemptions. " +
      "Score depends on magnitude and breadth of reductions.",
    scoreRange: { min: 10, max: 80 },
    example:
      "\"Retaliatory tariffs worth $11.5B permanently removed\" → score around +72",
  },
  {
    id: "T-COOP-02",
    label: "Trade Agreement Progress",
    description:
      "New bilateral/plurilateral trade agreements signed, ratified, or implemented. " +
      "Includes FTAs, mutual recognition agreements, and trade frameworks.",
    scoreRange: { min: 15, max: 100 },
    example:
      "\"TTC achieved mutual recognition in 3 additional sectors, saving $2.8B\" → score around +62",
  },
  {
    id: "T-COOP-03",
    label: "Quantified Trade Expansion",
    description:
      "Empirical evidence of bilateral trade growth above expected levels.",
    scoreRange: { min: 10, max: 70 },
    example:
      "\"US-EU critical minerals trade increased 35% after partnership agreement\" → score around +55",
  },
  {
    id: "T-COOP-04",
    label: "Dispute Resolution",
    description:
      "Resolution or de-escalation of bilateral trade disputes (WTO, bilateral negotiations). " +
      "Score depends on the significance of the resolved dispute.",
    scoreRange: { min: 15, max: 90 },
    example:
      "\"17-year Boeing-Airbus dispute formally resolved, tariffs permanently removed\" → score around +72",
  },
  {
    id: "T-COOP-05",
    label: "Trade Facilitation",
    description:
      "Measures that reduce trade costs without changing tariffs: " +
      "customs streamlining, regulatory harmonization, mutual recognition.",
    scoreRange: { min: 5, max: 50 },
    example:
      "\"Tariff-rate quota replaced blanket 25% tariffs; EU steel exports recovered to 85%\" → score around +28",
  },
  {
    id: "T-COOP-06",
    label: "Joint Trade Initiative",
    description:
      "Bilateral joint statements, frameworks, or commitments to expand trade. " +
      "Score lower if only rhetoric (no concrete measures).",
    scoreRange: { min: 5, max: 40 },
    example:
      "\"Both sides committed to a bilateral clean energy trade framework\" → score around +20",
  },

  // ── Catch-all ──
  {
    id: "T-OTHER",
    label: "Other Trade Signal",
    description:
      "A bilateral trade signal that does not fit any of the above criteria. " +
      "Use this when the article clearly affects bilateral trade flows or trade policy " +
      "but the mechanism is novel or doesn't match existing categories. " +
      "Score based on magnitude and direction using the same scale.",
    scoreRange: { min: -100, max: 100 },
    example:
      "\"New digital trade border tax on cross-border data flows\" → score depends on magnitude and bilateral impact",
  },

  // ── Quality / relevance filters ──
  {
    id: "T-QUAL-01",
    label: "Off-Topic: Wrong Bucket",
    description:
      "Article is about the bilateral pair but belongs to a different TGFI bucket " +
      "(e.g., investment, technology, policy). Should be reclassified, not scored here.",
    scoreRange: { min: 0, max: 0 },
    example:
      "\"US-China climate cooperation at COP31\" → not trade bucket, reclassify to policy",
  },
  {
    id: "T-QUAL-02",
    label: "Off-Topic: Wrong Pair",
    description:
      "Article is not primarily about any of the three bilateral pairs (CN-US, CN-EU, US-EU).",
    scoreRange: { min: 0, max: 0 },
    example:
      "\"India-Japan semiconductor trade agreement\" → wrong pair, exclude",
  },
  {
    id: "T-QUAL-03",
    label: "Insufficient Evidence",
    description:
      "Article discusses trade in general terms without bilateral-specific data or events. " +
      "No quantified impact, no specific policy action.",
    scoreRange: { min: -10, max: 10 },
    example:
      "\"Global trade uncertainty remains elevated\" → score near 0 (no bilateral signal)",
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 3: LLM PROMPT TEMPLATE
 *
 * This is the exact system prompt sent to Claude Opus for classification.
 * The prompt encodes the rubric so the LLM's decisions are auditable.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Build the system prompt for LLM classification.
 *
 * Design principles:
 * 1. All scoring criteria are explicitly stated (no implicit reasoning)
 * 2. Score anchors with concrete examples prevent drift
 * 3. Structured output format ensures parseable results
 * 4. Confidence signal enables human-in-the-loop triage
 */
export function buildClassificationPrompt(): string {
  const criteriaBlock = TRADE_CRITERIA.map(
    (c) =>
      `- **${c.id} ${c.label}** [${c.scoreRange.min} to ${c.scoreRange.max}]: ${c.description}\n  Example: ${c.example}`,
  ).join("\n");

  const anchorsBlock = SCORE_ANCHORS.map(
    (a) =>
      `- **[${a.range[0]}, ${a.range[1]}] ${a.label}**: ${a.description}`,
  ).join("\n");

  return `You are a trade fragmentation classifier for the Trilateral Geopolitical Fragmentation Index (TGFI).

Your task: Read an academic article or research report about bilateral trade between two countries (CN-US, CN-EU, or US-EU) and assign a score on the scale [-100, +100].

## Score Scale

${anchorsBlock}

## Scoring Criteria

Identify which of the following criteria are present in the article. An article may trigger multiple criteria — combine their signals to arrive at a single score.

${criteriaBlock}

## Scoring Rules

1. **Quantified evidence gets priority.** An article with "tariffs reduced bilateral trade by 23%" gets a stronger score than one saying "tariffs may reduce trade."
2. **Bilateral specificity matters.** "Global trade declined" scores near 0. "US imports from China declined 23%" scores strongly negative.
3. **Net the signals.** If an article contains both fragmentation AND cooperation signals, net them. Example: "Tariffs imposed BUT consultation mechanism established" → net negative but less extreme.
4. **Magnitude scales the score.** $180B trade impact → extreme score. $500M impact → moderate score.
5. **Forward-looking vs realized.** Announced policies score ~70% of implemented policies. "Plans to impose tariffs" < "Tariffs imposed and trade declined by X%".
6. **Confidence reflects certainty.** Set confidence high (>0.85) when clear quantified evidence matches a specific criterion. Set confidence low (<0.65) when signals are mixed, the article is tangential, or it could belong to a different bucket.

## Off-Topic Detection

If the article is NOT primarily about bilateral TRADE (goods, tariffs, trade volumes, trade agreements, customs, trade barriers), flag it:
- If it's about investment, technology, finance, leverage, or policy → set confidence < 0.50 and note "RECLASSIFY: [correct bucket]"
- If it's about the wrong country pair → set confidence < 0.50 and note "WRONG PAIR"

## Output Format

Respond with ONLY a JSON object (no markdown fencing, no explanation outside the JSON):

{
  "score": <integer from -100 to 100>,
  "rationale": "<2-4 sentences explaining the score>",
  "keyPhrases": ["<phrase1>", "<phrase2>", ...],
  "confidence": <float from 0.0 to 1.0>,
  "triggeredCriteria": ["<criterion_id_1>", "<criterion_id_2>", ...]
}`;
}

/**
 * Build the user prompt for a specific article.
 */
export function buildArticlePrompt(input: ClassificationInput): string {
  return `Classify this article for the TGFI Trade bucket.

**Pair:** ${input.pair}
**Source:** ${input.source.citation} (${input.source.tier})
**Date:** ${input.date}
**Title:** ${input.title}

---

${input.text}`;
}

/**
 * Parse LLM response into structured output.
 * Returns null if parsing fails (malformed response).
 */
export function parseClassificationResponse(
  raw: string,
): ClassificationOutput | null {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (
      typeof parsed.score !== "number" ||
      typeof parsed.rationale !== "string" ||
      !Array.isArray(parsed.keyPhrases) ||
      typeof parsed.confidence !== "number" ||
      !Array.isArray(parsed.triggeredCriteria)
    ) {
      return null;
    }

    // Clamp score to valid range
    const score = Math.max(-100, Math.min(100, Math.round(parsed.score)));
    const confidence = Math.max(0, Math.min(1, parsed.confidence));

    return {
      score,
      rationale: parsed.rationale,
      keyPhrases: parsed.keyPhrases.filter((p: unknown) => typeof p === "string"),
      confidence,
      triggeredCriteria: parsed.triggeredCriteria.filter(
        (c: unknown) => typeof c === "string",
      ),
    };
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 4: VALIDATION HELPERS
 *
 * Compare LLM output against gold-standard human labels.
 * Per Egami et al. (2023): ~100 labels needed for reliable validation.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Acceptable error threshold: |LLM - human| <= 15 points */
export const ACCEPTABLE_ERROR_THRESHOLD = 15;

/** Minimum gold-standard labels needed per pair (Egami et al.) */
export const MIN_GOLD_LABELS_PER_PAIR = 30;

/** Total minimum gold labels across all 3 pairs */
export const MIN_GOLD_LABELS_TOTAL = 100;

/**
 * Compute inter-annotator agreement statistics.
 *
 * Returns:
 * - meanAbsoluteError: average |LLM - human| across all articles
 * - directionAccuracy: % of articles where LLM and human agree on sign
 * - withinThreshold: % of articles where |error| <= ACCEPTABLE_ERROR_THRESHOLD
 * - pearsonR: correlation between LLM and human scores
 */
export function computeAgreement(
  pairs: Array<{ llm: number; human: number }>,
): {
  meanAbsoluteError: number;
  directionAccuracy: number;
  withinThreshold: number;
  pearsonR: number;
  n: number;
} {
  const n = pairs.length;
  if (n === 0) {
    return { meanAbsoluteError: 0, directionAccuracy: 0, withinThreshold: 0, pearsonR: 0, n: 0 };
  }

  const errors = pairs.map((p) => Math.abs(p.llm - p.human));
  const meanAbsoluteError = errors.reduce((a, b) => a + b, 0) / n;

  const directionMatches = pairs.filter(
    (p) => Math.sign(p.llm) === Math.sign(p.human) || (p.llm === 0 && p.human === 0),
  ).length;
  const directionAccuracy = directionMatches / n;

  const withinThreshold =
    errors.filter((e) => e <= ACCEPTABLE_ERROR_THRESHOLD).length / n;

  // Pearson r
  const llmMean = pairs.reduce((s, p) => s + p.llm, 0) / n;
  const humanMean = pairs.reduce((s, p) => s + p.human, 0) / n;
  let num = 0;
  let denLLM = 0;
  let denHuman = 0;
  for (const p of pairs) {
    const dL = p.llm - llmMean;
    const dH = p.human - humanMean;
    num += dL * dH;
    denLLM += dL * dL;
    denHuman += dH * dH;
  }
  const denom = Math.sqrt(denLLM * denHuman);
  const pearsonR = denom > 0 ? num / denom : 0;

  return {
    meanAbsoluteError: Math.round(meanAbsoluteError * 10) / 10,
    directionAccuracy: Math.round(directionAccuracy * 1000) / 1000,
    withinThreshold: Math.round(withinThreshold * 1000) / 1000,
    pearsonR: Math.round(pearsonR * 1000) / 1000,
    n,
  };
}
