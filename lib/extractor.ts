import Anthropic from "@anthropic-ai/sdk";

// Memoize client to avoid recreating per call (connection pool reuse)
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

const EXTRACTION_PROMPT = `You are a precise claim extractor for a geopolitical economics monitoring system focused on China-US-EU trilateral relations.

Given an article, extract ALL substantive claims. For each claim, provide structured metadata.

RULES:
- Extract only claims the AUTHOR makes or endorses (not background/literature review)
- Each claim must be a single, falsifiable statement
- Include a verbatim quote from the article that supports each claim
- Hedged statements ("might", "could") get lower direction magnitude
- If the article is not about CN-US, CN-EU, or US-EU economic/political relations, return empty claims array

OUTPUT FORMAT (JSON):
{
  "bucket_weights": {
    "trade": <0-100>,
    "investment": <0-100>,
    "technology": <0-100>,
    "finance": <0-100>,
    "leverage": <0-100>,
    "policy": <0-100>
  },
  "pairs": ["CN-US" | "CN-EU" | "US-EU"],
  "claims": [
    {
      "text": "<one-sentence claim>",
      "type": "QUANTITATIVE | CAUSAL | INTERPRETIVE | PREDICTIVE",
      "direction": <-100 to +100, negative=fragmentation/conflict, positive=integration/cooperation>,
      "quote": "<verbatim quote from article, max 40 words>"
    }
  ]
}

BUCKET DEFINITIONS:
- trade: goods/services flows, tariffs, trade balances, trade agreements, supply chains
- investment: FDI, portfolio flows, M&A, investment screening, capital controls
- technology: semiconductors, AI, patents, tech transfer, R&D, export controls on tech
- finance: currencies, SWIFT, payment systems, reserves, central bank policy, CBDC
- leverage: critical minerals, rare earth, energy, food security, economic coercion tools
- policy: sanctions, regulations, diplomatic actions, institutional frameworks, alliances

DIRECTION GUIDE:
- Negative (-100 to -1): fragmentation, conflict, decoupling, restriction, tension
- Zero (0): neutral or purely descriptive
- Positive (+1 to +100): integration, cooperation, engagement, liberalization

CLAIM TYPES:
- QUANTITATIVE: contains specific numbers, percentages, measurements
- CAUSAL: explains WHY something happened (X caused Y)
- INTERPRETIVE: frames meaning of events, characterizes situations
- PREDICTIVE: forecasts future outcomes

If the article has <100 words or is clearly irrelevant (e.g., job postings, event invitations), return:
{"bucket_weights": {"trade":0,"investment":0,"technology":0,"finance":0,"leverage":0,"policy":0}, "pairs": [], "claims": []}`;

export type ExtractionResult = {
  bucket_weights: {
    trade: number;
    investment: number;
    technology: number;
    finance: number;
    leverage: number;
    policy: number;
  };
  pairs: string[];
  claims: Array<{
    text: string;
    type: "QUANTITATIVE" | "CAUSAL" | "INTERPRETIVE" | "PREDICTIVE";
    direction: number;
    quote: string;
  }>;
};

export async function extractClaims(
  articleText: string,
  title: string,
  source: string,
): Promise<ExtractionResult> {
  const client = getClient();

  const truncated =
    articleText.length > 12000
      ? articleText.slice(0, 12000) + "\n[TRUNCATED]"
      : articleText;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Source: ${source}\nTitle: ${title}\n\nArticle text:\n${truncated}`,
      },
    ],
    system: EXTRACTION_PROMPT,
  });

  if (!response.content || response.content.length === 0) {
    return {
      bucket_weights: { trade: 0, investment: 0, technology: 0, finance: 0, leverage: 0, policy: 0 },
      pairs: [],
      claims: [],
    };
  }

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      bucket_weights: { trade: 0, investment: 0, technology: 0, finance: 0, leverage: 0, policy: 0 },
      pairs: [],
      claims: [],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // Validate essential structure
    return {
      bucket_weights: parsed.bucket_weights || { trade: 0, investment: 0, technology: 0, finance: 0, leverage: 0, policy: 0 },
      pairs: Array.isArray(parsed.pairs) ? parsed.pairs : [],
      claims: Array.isArray(parsed.claims) ? parsed.claims : [],
    };
  } catch {
    return {
      bucket_weights: { trade: 0, investment: 0, technology: 0, finance: 0, leverage: 0, policy: 0 },
      pairs: [],
      claims: [],
    };
  }
}
