/**
 * API Route: POST /api/classify/batch
 *
 * Classifies multiple articles in parallel against TGFI bucket rubrics.
 *
 * Request body:
 *   { articles: ClassificationInput[] }
 *
 * Response:
 *   { results: (ClassificationOutput & { articleId: string })[] }
 *
 * Each result includes the articleId for correlation. If an individual
 * article fails, its entry contains { articleId, error } instead.
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
const MODEL = process.env.ANTHROPIC_CLASSIFY_MODEL || "claude-sonnet-4-5";
const MAX_TOKENS = 1024;

/** Maximum articles per batch request to prevent abuse. */
const MAX_BATCH_SIZE = 50;

/** Concurrency limit to avoid rate-limiting from the Anthropic API. */
const CONCURRENCY_LIMIT = 5;

type BatchResult =
  | (ClassificationOutput & { articleId: string })
  | { articleId: string; error: string };

/**
 * Call the Anthropic Messages API for a single article.
 */
async function classifyOne(
  input: ClassificationInput,
  apiKey: string,
  systemPrompt: string,
): Promise<BatchResult> {
  try {
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
      return {
        articleId: input.articleId,
        error: `Anthropic API returned ${response.status}: ${errorBody}`,
      };
    }

    const data = await response.json();

    const textBlock = data.content?.find(
      (block: { type: string }) => block.type === "text",
    );
    if (!textBlock?.text) {
      return {
        articleId: input.articleId,
        error: "No text content in Anthropic API response",
      };
    }

    const parsed = parseClassificationResponse(textBlock.text);
    if (!parsed) {
      return {
        articleId: input.articleId,
        error: "Failed to parse classification response",
      };
    }

    return { ...parsed, articleId: input.articleId };
  } catch (error) {
    return {
      articleId: input.articleId,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Process an array of items with bounded concurrency.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function POST(request: Request) {
  // Auth: require CRON_SECRET (batch classification costs significant money)
  const authHeader = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const articles: ClassificationInput[] | undefined = body.articles;

    if (!Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json(
        { error: "Request body must contain a non-empty 'articles' array" },
        { status: 400 },
      );
    }

    if (articles.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size ${articles.length} exceeds maximum of ${MAX_BATCH_SIZE}` },
        { status: 400 },
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY environment variable is not set" },
        { status: 500 },
      );
    }

    // Build system prompt once (same for all articles)
    const systemPrompt = buildClassificationPrompt();

    const results = await mapWithConcurrency(
      articles,
      CONCURRENCY_LIMIT,
      (article) => classifyOne(article, apiKey, systemPrompt),
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[/api/classify/batch] Batch classification failed:", error);
    return NextResponse.json(
      {
        error: "Batch classification failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
