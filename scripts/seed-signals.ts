/**
 * Seed signals table: run detection + analysis and store results.
 *
 * Key choice: the analysis budget (Sonnet) is spent on the signals the
 * page will actually surface first. The home page ranks signals by
 * recency (latest claim date), so we sort the candidate pool the same
 * way before slicing the top 5 for analysis. Otherwise we end up with
 * rich Sonnet titles on older / lower-rank signals while the hero
 * cards show bland auto-summaries — the misalignment Thomas caught.
 *
 * Run: DATABASE_URL="..." ANTHROPIC_API_KEY="..." npx tsx scripts/seed-signals.ts
 */
import { neon } from "@neondatabase/serverless";
import { runDetection, type Signal } from "../lib/detector";
import { analyzeTopSignals } from "../lib/analyzer";
import { requireEnv } from "./utils";

requireEnv("DATABASE_URL", "ANTHROPIC_API_KEY");

function latestClaimMs(s: Signal): number {
  const claims = s.evidence?.claims || [];
  let max = 0;
  for (const c of claims) {
    if (!c.date) continue;
    const t = new Date(c.date).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Running detection...");
  const detected = await runDetection(sql);
  console.log(`Detected: ${detected.length} signals\n`);

  if (detected.length === 0) {
    console.log("No signals found.");
    return;
  }

  // Sort by event recency (latest claim date) so analysis budget targets
  // the signals the page will actually surface first. Tie-break on score.
  const byRecency = [...detected].sort((a, b) => {
    const ra = latestClaimMs(a);
    const rb = latestClaimMs(b);
    if (rb !== ra) return rb - ra;
    return b.score - a.score;
  });

  console.log("Analyzing recency-top 5 with Sonnet...");
  const analyzed = await analyzeTopSignals(byRecency.slice(0, 5), 5);

  console.log("Replacing signals in DB...");
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
    console.log(`  Stored (analysed): "${title.slice(0, 70)}"`);
  }

  // Store the next 7 most recent unanalyzed candidates so the compact
  // grid has content. We have headroom for 9 compact cards total (the
  // grid trims to a multiple of 3) but 7 is plenty in practice.
  const remaining = byRecency.slice(5, 12);
  for (const signal of remaining) {
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
    console.log(`  Stored (raw):      "${signal.title.slice(0, 70)}"`);
  }

  const [count] = await sql`SELECT COUNT(*) as n FROM signals`;
  console.log(`\nTotal signals in DB: ${count.n}`);
}

main().catch(console.error);
