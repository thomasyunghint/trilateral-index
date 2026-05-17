/**
 * Seed signals table: run detection + analysis and store results.
 * Run: DATABASE_URL="..." ANTHROPIC_API_KEY="..." npx tsx scripts/seed-signals.ts
 */
import { neon } from "@neondatabase/serverless";
import { runDetection } from "../lib/detector";
import { analyzeTopSignals } from "../lib/analyzer";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Running detection...");
  const signals = await runDetection(sql);
  console.log(`Detected: ${signals.length} signals\n`);

  if (signals.length === 0) {
    console.log("No signals found.");
    return;
  }

  console.log("Analyzing top 5 with Sonnet...");
  const analyzed = await analyzeTopSignals(signals.slice(0, 5), 5);

  // Clear old signals
  await sql`DELETE FROM signals`;

  for (const signal of analyzed) {
    const hasAnalysis = "analysis" in signal && signal.analysis;
    const title = hasAnalysis ? signal.analysis!.title : signal.title;
    const summary = hasAnalysis ? signal.analysis!.analysis : signal.summary;
    const evidence = {
      ...signal.evidence,
      analysis: hasAnalysis ? signal.analysis : null,
      pattern_summary: signal.summary,
    };

    await sql`
      INSERT INTO signals (pattern_type, claim_ids, score, title, summary, evidence, status)
      VALUES (
        ${signal.pattern_type},
        ${signal.claim_ids},
        ${signal.score},
        ${title},
        ${summary},
        ${JSON.stringify(evidence)},
        'SIGNAL'
      )
    `;
    console.log(`  Stored: "${title.slice(0, 60)}"`);
  }

  // Also store remaining signals without analysis
  for (const signal of signals.slice(5, 12)) {
    await sql`
      INSERT INTO signals (pattern_type, claim_ids, score, title, summary, evidence, status)
      VALUES (
        ${signal.pattern_type},
        ${signal.claim_ids},
        ${signal.score},
        ${signal.title},
        ${signal.summary},
        ${JSON.stringify(signal.evidence)},
        'SIGNAL'
      )
    `;
  }

  const [count] = await sql`SELECT COUNT(*) as n FROM signals`;
  console.log(`\nTotal signals in DB: ${count.n}`);
}

main().catch(console.error);
