/**
 * POST /api/auth — login endpoint
 * Receives { password }, validates against SITE_PASSWORD, sets cookie on success.
 *
 * GET /api/auth — logout (clears cookie)
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const COOKIE_NAME = "tgfi_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a.padEnd(64, "\0"));
  const bBuf = Buffer.from(b.padEnd(64, "\0"));
  try {
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const expected = process.env.SITE_PASSWORD || "thomas";
  if (!constantTimeEqual(password, expected)) {
    // Small delay to slow brute-force attempts
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: expected,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}

export async function GET() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
  return response;
}
