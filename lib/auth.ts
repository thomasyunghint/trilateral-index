/**
 * Shared authentication utilities for API routes.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Verify CRON_SECRET bearer token.
 * Uses timing-safe comparison to prevent timing attacks.
 * Returns null if auth passes, or a 401 Response if it fails.
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET environment variable is not set");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;

  // Timing-safe comparison (pad to same length)
  const a = Buffer.from(authHeader.padEnd(256, "\0"));
  const b = Buffer.from(expected.padEnd(256, "\0"));

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null; // Auth passed
}

/**
 * Simple rate limiting for non-cron endpoints.
 * Uses in-memory counter (resets on cold start, which is fine for serverless).
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30; // 30 requests per minute per IP

export function checkRateLimit(request: Request): NextResponse | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in 1 minute." },
      { status: 429 },
    );
  }

  return null;
}
