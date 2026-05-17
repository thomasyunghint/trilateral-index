/**
 * System Health Audit
 * Run anytime to check data quality, pipeline health, and flag issues.
 *
 * Run: DATABASE_URL="..." npx tsx scripts/audit.ts
 *
 * PASS/FAIL criteria:
 * - FAIL: any source with 0 extracted articles
 * - FAIL: >50% articles empty
 * - FAIL: <100 total claims
 * - FAIL: 0 signals
 * - WARN: any source with <5 claims
 * - WARN: >30% articles empty
 * - WARN: single source >60% of claims
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const issues: Array<{ level: "FAIL" | "WARN" | "INFO"; msg: string }> = [];

  console.log("=== TGFI SYSTEM AUDIT ===");
  console.log(`Time: ${new Date().toISOString()}\n`);

  // 1. Source health
  const sources = await sql`
    SELECT source_name,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE word_count > 100) as has_content,
      COUNT(*) FILTER (WHERE status = 'extracted') as extracted,
      COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      ROUND(AVG(CASE WHEN word_count > 10 THEN word_count END)) as avg_words
    FROM articles GROUP BY source_name ORDER BY total DESC
  `;

  console.log("1. SOURCE HEALTH");
  console.log("─".repeat(100));
  console.log(
    "Source".padEnd(22) + "Total".padEnd(7) + "Content".padEnd(9) +
    "Extracted".padEnd(11) + "Skipped".padEnd(9) + "Pending".padEnd(9) +
    "Failed".padEnd(8) + "AvgWords".padEnd(10) + "Status"
  );

  // Sources known to block programmatic content fetch (403) — RSS descriptions only
  const RSS_ONLY_SOURCES = new Set(["PIIE", "RAND"]);

  for (const r of sources) {
    const contentPct = r.total > 0 ? Math.round((r.has_content as number) / (r.total as number) * 100) : 0;
    let status = "OK";
    if (RSS_ONLY_SOURCES.has(r.source_name as string)) {
      status = "RSS-only (403 blocked)";
      issues.push({ level: "INFO", msg: `${r.source_name}: RSS-only source (site blocks fetch)` });
    } else if (r.has_content === 0 || r.has_content === "0") {
      status = "FAIL: no content";
      issues.push({ level: "FAIL", msg: `${r.source_name}: 0 articles with content` });
    } else if (contentPct < 30) {
      status = "WARN: low content";
      issues.push({ level: "WARN", msg: `${r.source_name}: only ${contentPct}% have content` });
    }
    if (r.extracted === 0 || r.extracted === "0") {
      if (r.has_content > 0) {
        status += " | needs extraction";
        issues.push({ level: "WARN", msg: `${r.source_name}: has content but 0 extracted` });
      }
    }

    console.log(
      String(r.source_name).padEnd(22) + String(r.total).padEnd(7) +
      String(r.has_content).padEnd(9) + String(r.extracted).padEnd(11) +
      String(r.skipped).padEnd(9) + String(r.pending).padEnd(9) +
      String(r.failed).padEnd(8) + String(r.avg_words || "N/A").padEnd(10) + status
    );
  }

  // 2. Overall stats
  console.log("\n2. PIPELINE STATS");
  console.log("─".repeat(60));

  const [totals] = await sql`
    SELECT
      COUNT(*) as articles,
      COUNT(*) FILTER (WHERE word_count > 100) as with_content,
      COUNT(*) FILTER (WHERE status = 'extracted') as extracted,
      COUNT(*) FILTER (WHERE full_text IS NULL OR word_count < 10) as empty
    FROM articles
  `;
  const [claimCount] = await sql`SELECT COUNT(*) as n FROM claims`;
  const [signalCount] = await sql`SELECT COUNT(*) as n FROM signals`;

  const emptyPct = Math.round((totals.empty as number) / (totals.articles as number) * 100);
  console.log(`Articles: ${totals.articles} (${totals.with_content} with content, ${totals.empty} empty = ${emptyPct}%)`);
  console.log(`Extracted: ${totals.extracted}`);
  console.log(`Claims: ${claimCount.n}`);
  console.log(`Signals: ${signalCount.n}`);

  if (emptyPct > 50) issues.push({ level: "FAIL", msg: `${emptyPct}% articles are empty` });
  else if (emptyPct > 30) issues.push({ level: "WARN", msg: `${emptyPct}% articles are empty` });
  if (Number(claimCount.n) < 100) issues.push({ level: "FAIL", msg: `Only ${claimCount.n} claims (need >100)` });
  if (Number(signalCount.n) === 0) issues.push({ level: "FAIL", msg: "0 signals detected" });

  // 3. Claim distribution bias
  console.log("\n3. CLAIM DISTRIBUTION");
  console.log("─".repeat(60));

  const claimsBySource = await sql`
    SELECT a.source_name, COUNT(*) as n
    FROM claims c JOIN articles a ON c.article_id = a.id
    GROUP BY a.source_name ORDER BY n DESC
  `;

  const totalClaims = claimsBySource.reduce((sum, r) => sum + Number(r.n), 0);
  for (const r of claimsBySource) {
    const pct = Math.round((Number(r.n) / totalClaims) * 100);
    const bar = "█".repeat(Math.round(pct / 2));
    console.log(`  ${String(r.source_name).padEnd(20)} ${String(r.n).padEnd(6)} ${pct}% ${bar}`);
    if (pct > 60) issues.push({ level: "WARN", msg: `${r.source_name} is ${pct}% of all claims (source bias)` });
  }

  // 4. Pair coverage
  console.log("\n4. PAIR COVERAGE");
  console.log("─".repeat(60));

  const pairs = await sql`
    SELECT unnest(pairs) as p, COUNT(*) as n, ROUND(AVG(direction)) as avg_dir
    FROM claims GROUP BY unnest(pairs) ORDER BY n DESC
  `;
  for (const r of pairs) {
    console.log(`  ${String(r.p).padEnd(10)} ${String(r.n).padEnd(6)} claims, avg direction: ${r.avg_dir}`);
  }

  // 5. Cron health
  console.log("\n5. CRON HEALTH");
  console.log("─".repeat(60));

  const logs = await sql`
    SELECT run_at, articles_new, errors
    FROM ingest_log ORDER BY run_at DESC LIMIT 5
  `;
  if (logs.length === 0) {
    issues.push({ level: "WARN", msg: "No ingest logs found — cron may not be running" });
    console.log("  No ingest logs found!");
  } else {
    for (const l of logs) {
      const errors = typeof l.errors === "string" ? JSON.parse(l.errors) : l.errors;
      console.log(`  ${String(l.run_at).slice(0, 19)} | +${l.articles_new} new | ${Array.isArray(errors) ? errors.length : 0} errors`);
    }
  }

  // 6. Verdict
  console.log("\n" + "═".repeat(60));
  const fails = issues.filter(i => i.level === "FAIL");
  const warns = issues.filter(i => i.level === "WARN");

  if (fails.length === 0 && warns.length === 0) {
    console.log("VERDICT: ✅ ALL PASS");
  } else {
    if (fails.length > 0) {
      console.log(`VERDICT: ❌ ${fails.length} FAILURES, ${warns.length} WARNINGS\n`);
      for (const f of fails) console.log(`  FAIL: ${f.msg}`);
    } else {
      console.log(`VERDICT: ⚠️  ${warns.length} WARNINGS\n`);
    }
    for (const w of warns) console.log(`  WARN: ${w.msg}`);
  }

  console.log("\n" + "═".repeat(60));
}

main().catch(console.error);
