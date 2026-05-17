/**
 * API Route: POST /api/classify
 *
 * Classifies a single article against a TGFI bucket rubric using Claude.
 *
 * Request body: ClassificationInput
 *   { articleId, title, source: { name, tier, citation, url? }, date, pair, bucket, text }
 *
 * Response: ClassificationOutput
 *   { score, rationale, keyPhrases, confidence, triggeredCriteria }
 */

import { NextResponse } from "next/server";
import {
  buildClassificationPrompt,
  buildArticlePrompt,
  parseClassificationResponse,
} from "@/lib/classifier/rubric";
import type {
  ClassificationInput,
  ClassificationOutput,
} from "@/lib/classifier/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;

/**
 * Call the Anthropic Messages API and return the text content.
 */
async function callAnthropic(input: ClassificationInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  const systemPrompt = buildClassificationPrompt();
  const userMessage = buildArticlePrompt(input);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      max_tokens: MAX_TOKENS,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Anthropic API returned ${response.status}: ${errorBody}`,
    );
  }

  const data = await response.json();

  // Extract text from the first content block
  const textBlock = data.content?.find(
    (block: { type: string }) => block.type === "text",
  );
  if (!textBlock?.text) {
    throw new Error("No text content in Anthropic API response");
  }

  return textBlock.text;
}

export async function POST(request: Request) {
  // Auth: require CRON_SECRET for classifier (costs money per call)
  const authHeader = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input = body as ClassificationInput;

    // Basic validation
    if (!input.articleId || !input.title || !input.text || !input.pair || !input.bucket) {
      return NextResponse.json(
        { error: "Missing required fields: articleId, title, text, pair, bucket" },
        { status: 400 },
      );
    }

    // Text length limit (prevent excessive API costs)
    if (typeof input.text === "string" && input.text.length > 50000) {
      return NextResponse.json(
        { error: "Text exceeds maximum length of 50000 characters" },
        { status: 400 },
      );
    }

    if (!input.source?.name || !input.source?.tier || !input.source?.citation) {
      return NextResponse.json(
        { error: "Missing required source fields: name, tier, citation" },
        { status: 400 },
      );
    }

    const rawResponse = await callAnthropic(input);
    const result: ClassificationOutput | null =
      parseClassificationResponse(rawResponse);

    if (!result) {
      return NextResponse.json(
        { error: "Failed to parse classification response" },
        { status: 502 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/classify] Classification failed:", error);
    return NextResponse.json(
      {
        error: "Classification failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
