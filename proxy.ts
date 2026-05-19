/**
 * Auth gate for the TGFI demo site.
 * Requires `tgfi_auth` cookie matching SITE_PASSWORD; otherwise redirects to /login.
 *
 * Public paths (no auth): /login, /api/auth, /api/ingest, /api/extract, /api/detect
 * (the API routes have their own CRON_SECRET auth — proxy only protects pages.)
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

const COOKIE_NAME = "tgfi_auth";

// Pages that don't require login
const PUBLIC_PATHS = ["/login", "/api/auth"];

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function verifyCookie(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const expected = process.env.SITE_PASSWORD || "thomas";
  // Timing-safe compare (pad to same length to avoid leaking length)
  const a = Buffer.from(cookieValue.padEnd(64, "\0"));
  const b = Buffer.from(expected.padEnd(64, "\0"));
  try {
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // API routes are handled by their own auth (CRON_SECRET) — skip cookie check
  if (isApiRoute(pathname)) {
    return NextResponse.next();
  }

  // For all other paths, require the auth cookie
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (verifyCookie(cookie)) {
    return NextResponse.next();
  }

  // Redirect to /login with a return path
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.png$|.*\\.svg$|.*\\.ico$).*)",
  ],
};
