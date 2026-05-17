/**
 * Local test: fetch one RSS feed → extract claims from first article.
 * Run: npx tsx scripts/test-pipeline.ts
 */
import Parser from "rss-parser";
import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY in .env.local or environment");
  process.exit(1);
}

const TEST_SOURCE = {
  name: "PIIE",
  url: "https://www.piie.com/rss/update.xml",
};

async function main() {
  console.log(`\n=== PHASE 1: Fetching RSS from ${TEST_SOURCE.name} ===\n`);

  const parser = new Parser({
    timeout: 10000,
    headers: { "User-Agent": "TGFI-Test/1.0" },
  });

  const feed = await parser.parseURL(TEST_SOURCE.url);
  console.log(`Found ${feed.items?.length || 0} items in feed`);

  const item = feed.items?.find(
    (i) => i.content && i.content.split(/\s+/).length > 50,
  );

  if (!item) {
    console.log("No article with sufficient content found in RSS. Trying contentSnippet...");
    const fallback = feed.items?.[0];
    if (!fallback) {
      console.log("Feed is empty.");
      return;
    }
    console.log(`\nTitle: ${fallback.title}`);
    console.log(`Link: ${fallback.link}`);
    console.log(`Content length: ${(fallback.content || fallback.contentSnippet || "").length} chars`);
    console.log("\nNote: Many RSS feeds only include snippets. Full text extraction from URLs will be added in Phase 1.5.");
    return;
  }

  console.log(`\nSelected article: "${item.title}"`);
  console.log(`Published: ${item.pubDate}`);
  console.log(`Content words: ${item.content!.split(/\s+/).length}`);

  console.log(`\n=== PHASE 2: Extracting claims via Haiku ===\n`);

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const text =
    item.content!.length > 12000
      ? item.content!.slice(0, 12000) + "\n[TRUNCATED]"
      : item.content!;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: `You are a precise claim extractor for a geopolitical economics monitoring system focused on China-US-EU trilateral relations. Given an article, extract ALL substantive claims. Output JSON with: bucket_weights (trade/investment/technology/finance/leverage/policy, each 0-100), pairs (array of "CN-US"/"CN-EU"/"US-EU"), claims (array of {text, type: QUANTITATIVE|CAUSAL|INTERPRETIVE|PREDICTIVE, direction: -100 to +100, quote}).`,
    messages: [
      {
        role: "user",
        content: `Source: ${TEST_SOURCE.name}\nTitle: ${item.title}\n\nArticle:\n${text}`,
      },
    ],
  });

  const output =
    response.content[0].type === "text" ? response.content[0].text : "";

  console.log("Raw extraction output:");
  console.log(output);

  const jsonMatch = output.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log("\n=== PARSED RESULT ===\n");
    console.log(`Bucket weights:`, parsed.bucket_weights);
    console.log(`Pairs:`, parsed.pairs);
    console.log(`Claims extracted: ${parsed.claims?.length || 0}`);
    if (parsed.claims?.length > 0) {
      console.log("\nFirst claim:");
      console.log(JSON.stringify(parsed.claims[0], null, 2));
    }
  }

  console.log(`\nAPI usage: ${response.usage.input_tokens} input + ${response.usage.output_tokens} output tokens`);
  const cost =
    (response.usage.input_tokens * 0.8 + response.usage.output_tokens * 4) /
    1_000_000;
  console.log(`Estimated cost: $${cost.toFixed(4)}`);
}

main().catch(console.error);
