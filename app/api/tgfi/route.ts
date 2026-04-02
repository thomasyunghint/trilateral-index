import { NextResponse } from "next/server";
import { MOCK_SUMMARY } from "@/lib/mock-data";

/**
 * GET /api/tgfi
 *
 * Returns the latest TGFI summary.
 * When Python pipeline is running, reads from outputs/tgfi_latest.json.
 * Falls back to mock data.
 */
export async function GET() {
  // TODO: Read from actual pipeline output (e.g., outputs/tgfi_latest.json)
  // For now, return computed mock summary
  return NextResponse.json({
    ...MOCK_SUMMARY,
    _source: "mock",
  });
}
