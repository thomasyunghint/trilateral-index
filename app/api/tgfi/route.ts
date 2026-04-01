import { NextResponse } from "next/server";

/**
 * GET /api/tgfi
 *
 * Returns the latest TGFI summary.
 * Currently returns mock data — will connect to Python backend via
 * SQLite or JSON file output when the pipeline is running.
 */
export async function GET() {
  // TODO: Read from actual pipeline output (e.g., outputs/tgfi_latest.json)
  // For now, return a marker so the frontend knows the API works
  return NextResponse.json({
    status: "ok",
    message: "TGFI API endpoint. Connect to Python pipeline output.",
    mock: true,
  });
}
