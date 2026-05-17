/**
 * Test detection engine locally.
 * Run: DATABASE_URL="..." npx tsx scripts/test-detection.ts
 * Add --analyze for Opus analysis: DATABASE_URL="..." ANTHROPIC_API_KEY="..." npx tsx scripts/test-detection.ts --analyze
 */
import { neon } from "@neondatabase/serverless";
import { runDetection } from "../lib/detector";
import { analyzeTopSignals } from "../lib/analyzer";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const doAnalyze = process.argv.includes("--analyze");

  console.log("=== DETECTION ENGINE TEST ===\n");

  // Check data availability
  const [claimCount] = await sql`SELECT COUNT(*) as n FROM claims`;
  const [articleCount] = await sql`SELECT COUNT(DISTINCT article_id) as n FROM claims`;
  console.log(`Data: ${claimCount.n} claims from ${articleCount.n} articles\n`);

  // Run detection
  const signals = await runDetection(sql);

  console.log(`Detected ${signals.length} signals (threshold > 60):\n`);

  if (signals.length === 0) {
    console.log("No signals found. Need more diverse claims across buckets/pairs.");

    // Debug: show bucket/pair distribution
    const dist = await sql`
      SELECT unnest(pairs) as pair, COUNT(*) as n,
        ROUND(AVG(direction)::numeric, 1) as avg_dir
      FROM claims
      GROUP BY unnest(pairs)
      ORDER BY n DESC
    `;
    console.log("\nClaim distribution by pair:");
    for (const row of dist) {
      console.log(`  ${row.pair}: ${row.n} claims, avg direction: ${row.avg_dir}`);
    }
    return;
  }

  for (const signal of signals) {
    console.log(`[${signal.pattern_type}] Score: ${signal.score}`);
    console.log(`  Title: ${signal.title}`);
    console.log(`  Summary: ${signal.summary}`);
    console.log(`  Claims: ${signal.claim_ids.length}`);
    console.log(`  Evidence:`);
    for (const e of signal.evidence.claims.slice(0, 3)) {
      console.log(`    - [${e.source}] "${e.text.slice(0, 70)}..." (dir: ${e.direction})`);
    }
    console.log("");
  }

  if (doAnalyze && signals.length > 0) {
    console.log("\n=== OPUS ANALYSIS (top 3) ===\n");
    const analyzed = await analyzeTopSignals(signals, 3);
    for (const signal of analyzed) {
      if ('analysis' in signal && signal.analysis) {
        console.log(`📊 ${signal.analysis.title}`);
        console.log(`   ${signal.analysis.analysis}`);
        console.log(`   Confidence: ${signal.analysis.confidence}/10 | Tags: ${signal.analysis.tags.join(", ")}`);
        console.log("");
      }
    }
  }
}

main().catch(console.error);
