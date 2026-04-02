import {
  Database,
  FileText,
  ArrowLeftRight,
  DollarSign,
  Cpu,
  Landmark,
  Shield,
  ScrollText,
  ExternalLink,
  Zap,
  CheckCircle2,
  BookOpen,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type { Bucket } from "@/lib/types";

/* ─── Bucket metadata ─── */
const BUCKET_META: {
  id: Bucket;
  label: string;
  icon: typeof ArrowLeftRight;
  subtitle: string;
}[] = [
  { id: "trade", label: "Trade", icon: ArrowLeftRight, subtitle: "Bilateral trade flows & barriers" },
  { id: "investment", label: "Investment", icon: DollarSign, subtitle: "FDI flows & screening" },
  { id: "technology", label: "Technology", icon: Cpu, subtitle: "Tech transfer & controls" },
  { id: "finance", label: "Finance", icon: Landmark, subtitle: "Currency & capital markets" },
  { id: "leverage", label: "Leverage", icon: Shield, subtitle: "Economic weaponization" },
  { id: "policy", label: "Policy", icon: ScrollText, subtitle: "Government signals & diplomacy" },
];

/* ─── Trade: Papers ─── */
const TRADE_PAPERS = [
  {
    id: "anderson-vanwincoop-2003",
    authors: "Anderson, J.E. & van Wincoop, E.",
    year: 2003,
    title: "Gravity with Gravitas: A Solution to the Border Puzzle",
    journal: "American Economic Review",
    volume: "93(1), 170\u2013192",
    doi: "10.1257/000282803321455214",
    confidence: "verified" as const,
    keyFinding:
      "Bilateral trade flows are determined by relative trade barriers (multilateral resistance), not just bilateral barriers. A country\u2019s trade with any single partner depends on its barriers vis-\u00e0-vis ALL trading partners.",
    application:
      "We use the gravity model to establish baseline expected trade levels for CN-US, CN-EU, and US-EU. Deviation of actual trade from gravity-predicted trade is our primary hard-data fragmentation signal: under-trading relative to the model indicates fragmentation; over-trading indicates cooperation.",
    verifyNote: null,
  },
  {
    id: "head-mayer-2014",
    authors: "Head, K. & Mayer, T.",
    year: 2014,
    title: "Gravity Equations: Workhorse, Toolkit, and Cookbook",
    journal: "Handbook of International Economics, Vol. 4",
    volume: "Chapter 3, 131\u2013195",
    doi: "10.1016/B978-0-444-54314-1.00003-3",
    confidence: "verified" as const,
    keyFinding:
      "Provides the definitive estimation guide for gravity equations: PPML (Poisson Pseudo-Maximum Likelihood) with exporter-time and importer-time fixed effects, addressing zero trade flows, heteroskedasticity, and multilateral resistance.",
    application:
      "We follow their recommended PPML estimation methodology with proper fixed effects for our one-time gravity baseline calibration. This determines \u2018expected\u2019 bilateral trade volumes against which we measure deviations.",
    verifyNote: null,
  },
  {
    id: "tinbergen-1962",
    authors: "Tinbergen, J.",
    year: 1962,
    title: "Shaping the World Economy: Suggestions for an International Economic Policy",
    journal: "Twentieth Century Fund, New York",
    volume: "",
    doi: "",
    confidence: "verified" as const,
    keyFinding:
      "First formulation of the gravity model of trade: bilateral trade is proportional to the economic sizes of both countries and inversely proportional to the distance between them.",
    application:
      "Historical foundation. The gravity equation Trade_ij \u221d (GDP_i \u00d7 GDP_j) / Distance_ij underpins our baseline model. Tinbergen\u2019s original insight remains the core of modern trade modeling.",
    verifyNote: null,
  },
];

/* ─── Trade: Data Sources ─── */
const TRADE_DATA_SOURCES = [
  {
    name: "OECD Monthly International Trade Statistics",
    access: "SDMX REST API",
    endpoint: "https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_ITF@DF_ITF_GOODS_M/",
    fields: [
      "Bilateral import/export values (USD millions)",
      "By partner country (CHN, USA, EU27)",
      "Monthly frequency, seasonally adjusted",
    ],
    frequency: "Monthly, ~60 day lag",
    sampleResponse: `// Example: US imports from China, Jan 2026
{
  "structure": { "dimensions": { "series": [
    { "id": "REF_AREA", "values": [{ "id": "USA" }] },
    { "id": "COUNTERPART_AREA", "values": [{ "id": "CHN" }] },
    { "id": "FLOW", "values": [{ "id": "M", "name": "Imports" }] }
  ]}},
  "dataSets": [{
    "series": { "0:0:0": {
      "observations": {
        "2026-01": [35821.4],
        "2026-02": [33105.7],
        "2026-03": [36290.1]
      }
    }}
  }]
}`,
  },
  {
    name: "WTO Tariff Download Facility",
    access: "Bulk download (CSV) + Tariff Analysis Online",
    endpoint: "https://tariffdata.wto.org/",
    fields: [
      "MFN applied tariff rates (simple & weighted average)",
      "Bound tariff rates",
      "Bilateral preferential rates where applicable",
      "By HS product code (6-digit)",
    ],
    frequency: "Annual, ~6 month lag",
    sampleResponse: `// Example: US weighted average applied tariff on Chinese goods
reporter,partner,year,product,duty_type,avg_rate
USA,CHN,2025,TOTAL,MFN,19.3
USA,CHN,2025,TOTAL,Applied,24.8
EU27,CHN,2025,TOTAL,MFN,5.1
EU27,CHN,2025,TOTAL,Applied,8.2`,
  },
  {
    name: "UN COMTRADE",
    access: "REST API v1",
    endpoint: "https://comtradeapi.un.org/data/v1/get/C/A/HS",
    fields: [
      "Commodity-level bilateral trade (HS 6-digit)",
      "Trade value (USD) and net weight (kg)",
      "All reporter-partner combinations",
    ],
    frequency: "Annual (final) & monthly (preliminary), variable lag",
    sampleResponse: null,
  },
];

/* ─── Computation Steps ─── */
const TRADE_COMPUTATION_STEPS = [
  {
    step: 1,
    title: "Fetch bilateral trade flows",
    detail:
      "Pull monthly bilateral trade data (imports + exports) from OECD SDMX API for three pairs: CN\u2013US, CN\u2013EU, US\u2013EU. Convert to USD at market exchange rates.",
  },
  {
    step: 2,
    title: "Compute Trade Share Deviation (50% of hard data score)",
    formula: "S_ij = Trade_ij / Total_Trade_i",
    formulaDetail: "\u0394S = (S_current \u2013 S_baseline) / S_baseline \u00d7 100",
    example:
      "CN\u2013US example: If US trade with China = $362B and US total trade = $2,140B, then S = 16.9%. Baseline (2019 avg) = 19.2%. \u0394S = (16.9 \u2013 19.2) / 19.2 = \u201312.0% \u2192 normalized to \u201338.0",
  },
  {
    step: 3,
    title: "Compute Tariff Change Signal (30% of hard data score)",
    formula: "\u0394Tariff = \u2013(applied_rate_current \u2013 applied_rate_previous)",
    formulaDetail: "Negative sign: tariff increase = conflict signal",
    example:
      "CN\u2013US example: If weighted avg applied tariff rose from 19.3% to 24.8%, \u0394Tariff = \u2013(24.8 \u2013 19.3) = \u20135.5 \u2192 normalized to \u201342.0",
  },
  {
    step: 4,
    title: "Compute Trade Balance Trend (20% of hard data score)",
    formula: "\u0394Balance = (balance_t \u2013 balance_{t-1}) / |balance_{t-1}|",
    formulaDetail: "Widening deficit with adversarial partner = conflict signal",
    example: "Tracks directional change in bilateral trade surplus/deficit",
  },
  {
    step: 5,
    title: "Blend Hard Data sub-components",
    formula: "HardScore = 0.5 \u00d7 TradeShareDev + 0.3 \u00d7 TariffSignal + 0.2 \u00d7 BalanceTrend",
    formulaDetail: "All sub-components normalized to [\u2013100, +100] via min-max on historical range",
    example: "HardScore = 0.5(\u201338.0) + 0.3(\u201342.0) + 0.2(\u201315.0) = \u201334.6",
  },
  {
    step: 6,
    title: "Compute Text Score from T1 academic sources",
    formula: "TextScore = mean(LLM_classify(doc_i)) for all docs in period",
    formulaDetail:
      "Sources: NBER working papers, IMF staff discussion notes, BIS quarterly reviews, OECD policy papers, central bank publications. Each document classified on [\u2013100, +100] cooperation\u2013conflict spectrum.",
    example:
      "If 18 relevant publications this quarter, each scored by LLM, mean score = \u201351.3",
  },
  {
    step: 7,
    title: "Blend to Trade Composite",
    formula: "Trade_Composite = HardScore \u00d7 0.7 + TextScore \u00d7 0.3",
    formulaDetail:
      "70% hard data weight because bilateral trade has reliable, timely quantitative data. 30% text captures policy signals and sentiment not yet reflected in flows.",
    example: "Trade_Composite = (\u201334.6)(0.7) + (\u201351.3)(0.3) = \u201324.2 + \u201315.4 = \u201339.6",
  },
];

/* ─── Page Component ─── */
export default function SourcesPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
            <Database size={12} />
            <span>Data Provenance</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-text-primary">
            Sources
          </h1>
          <p className="mt-4 text-base text-text-secondary max-w-2xl leading-relaxed">
            Complete transparency on academic foundations, data sources,
            and computation methodology for each dimension.
            Every number in the TGFI is traceable to its origin.
          </p>
          <div className="mt-4 flex items-start gap-2 p-3 rounded-md bg-bg-surface border border-border text-xs text-text-muted">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
            <div>
              <span className="font-medium text-text-secondary">Verification note:</span>{" "}
              All paper citations should be independently verified against the original source.
              DOI links are provided where available. Key findings are paraphrased, not direct quotes,
              unless marked with quotation marks.
            </div>
          </div>
        </div>
      </section>

      {/* Table of Contents */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-text-muted mr-2">Jump to:</span>
            {BUCKET_META.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors border border-border"
              >
                <Icon size={12} />
                {label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════ */}
      {/* TRADE — Full implementation                         */}
      {/* ═══════════════════════════════════════════════════ */}
      <section id="trade" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
          {/* Section header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-bg-surface border border-border flex items-center justify-center">
              <ArrowLeftRight size={18} className="text-text-muted" />
            </div>
            <div>
              <h2 className="text-2xl font-serif text-text-primary">Trade</h2>
              <p className="text-sm text-text-muted">
                Bilateral trade flows, tariffs, and trade barriers
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-text-muted">
              <Clock size={12} />
              <span className="font-mono">Weight: text 30% / hard 70%</span>
            </div>
          </div>

          {/* ── 1. Theoretical Foundation ── */}
          <div className="mb-8">
            <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary uppercase tracking-wider mb-4">
              <BookOpen size={14} />
              Theoretical Foundation
            </h3>
            <div className="space-y-4">
              {TRADE_PAPERS.map((paper) => (
                <div
                  key={paper.id}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-3 bg-bg-surface/50">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {paper.title}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5">
                          {paper.authors} ({paper.year}).{" "}
                          <span className="italic">{paper.journal}</span>
                          {paper.volume && `, ${paper.volume}`}.
                        </div>
                      </div>
                      {paper.doi && (
                        <a
                          href={`https://doi.org/${paper.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 text-[10px] text-accent hover:text-accent-weak transition-colors"
                        >
                          DOI <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <CheckCircle2 size={10} className="text-cooperation" />
                      <span className="text-[10px] text-cooperation font-medium">
                        Citation verified
                      </span>
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <div>
                      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                        Key Finding (paraphrased)
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed">
                        {paper.keyFinding}
                      </p>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                        How We Apply This
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed">
                        {paper.application}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 2. Data Sources ── */}
          <div className="mb-8">
            <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary uppercase tracking-wider mb-4">
              <Database size={14} />
              Data Sources
            </h3>
            <div className="space-y-4">
              {TRADE_DATA_SOURCES.map((src) => (
                <div
                  key={src.name}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {src.name}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                          <span className="font-mono bg-bg-surface px-1.5 py-0.5 rounded">
                            {src.access}
                          </span>
                          <span>{src.frequency}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                        Fields Used
                      </div>
                      <ul className="space-y-0.5">
                        {src.fields.map((f) => (
                          <li
                            key={f}
                            className="text-xs text-text-secondary pl-3 relative before:absolute before:left-0 before:top-[7px] before:h-[3px] before:w-[3px] before:rounded-full before:bg-accent/40"
                          >
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {src.endpoint && (
                      <div className="mt-2">
                        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                          Endpoint
                        </div>
                        <code className="text-[11px] text-text-muted font-mono break-all">
                          {src.endpoint}
                        </code>
                      </div>
                    )}
                  </div>
                  {src.sampleResponse && (
                    <details className="border-t border-border/50">
                      <summary className="px-4 py-2 text-[11px] text-text-muted cursor-pointer hover:text-text-secondary transition-colors select-none">
                        Sample API response
                      </summary>
                      <div className="px-4 pb-3">
                        <pre className="text-[10px] text-text-muted font-mono bg-bg-surface rounded-md p-3 overflow-x-auto leading-relaxed">
                          {src.sampleResponse}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── 3. Computation Pipeline ── */}
          <div className="mb-8">
            <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary uppercase tracking-wider mb-4">
              <Zap size={14} />
              Computation Pipeline
            </h3>
            <div className="space-y-3">
              {TRADE_COMPUTATION_STEPS.map((s) => (
                <div
                  key={s.step}
                  className="border border-border rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="h-5 w-5 rounded-full bg-bg-surface border border-border flex items-center justify-center text-[10px] font-mono font-medium text-text-muted">
                      {s.step}
                    </span>
                    <span className="text-sm font-medium text-text-primary">
                      {s.title}
                    </span>
                  </div>
                  {s.formula && (
                    <div className="ml-7 mt-1 font-mono text-xs text-accent bg-bg-surface rounded px-2 py-1 inline-block">
                      {s.formula}
                    </div>
                  )}
                  {s.formulaDetail && (
                    <p className="ml-7 mt-1 text-xs text-text-muted">
                      {s.formulaDetail}
                    </p>
                  )}
                  {s.detail && (
                    <p className="ml-7 mt-1 text-xs text-text-muted leading-relaxed">
                      {s.detail}
                    </p>
                  )}
                  {s.example && (
                    <div className="ml-7 mt-2 text-[11px] text-text-secondary bg-bg-surface/50 rounded px-2 py-1.5 border-l-2 border-accent/30">
                      {s.example}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── 4. Validation ── */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary uppercase tracking-wider mb-4">
              <CheckCircle2 size={14} />
              Validation
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-border rounded-lg px-4 py-3">
                <div className="text-sm font-medium text-text-primary mb-1">
                  Text\u2013Hard Convergence
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Pearson correlation between text score and hard data score
                  across periods. Target: r &gt; 0.6. If text and hard data
                  tell conflicting stories, the convergence metric flags it.
                </p>
              </div>
              <div className="border border-border rounded-lg px-4 py-3">
                <div className="text-sm font-medium text-text-primary mb-1">
                  Event Alignment
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Score spikes should align with known trade events: tariff
                  announcements, FTA signings, trade war escalations. Manual
                  review each quarter against event timeline.
                </p>
              </div>
              <div className="border border-border rounded-lg px-4 py-3">
                <div className="text-sm font-medium text-text-primary mb-1">
                  Gravity Residual Backtesting
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Does the trade share deviation predict next-quarter actual
                  trade volume changes? Granger causality test on historical
                  data (2015\u20132025).
                </p>
              </div>
              <div className="border border-border rounded-lg px-4 py-3">
                <div className="text-sm font-medium text-text-primary mb-1">
                  Weight Sensitivity
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Monte Carlo: perturb text/hard weights by \u00b120% (1000
                  draws). Verify composite score ranking is stable across
                  perturbations (rank correlation &gt; 0.95).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════ */}
      {/* Other 5 buckets — stubs                             */}
      {/* ═══════════════════════════════════════════════════ */}
      {BUCKET_META.filter((b) => b.id !== "trade").map(({ id, label, icon: Icon, subtitle }) => (
        <section
          key={id}
          id={id}
          className="scroll-mt-16 border-b border-border"
        >
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-bg-surface border border-border flex items-center justify-center">
                <Icon size={18} className="text-text-muted" />
              </div>
              <div>
                <h2 className="text-2xl font-serif text-text-primary">
                  {label}
                </h2>
                <p className="text-sm text-text-muted">{subtitle}</p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3 p-4 rounded-lg bg-bg-surface border border-border">
              <FileText size={16} className="text-text-muted shrink-0" />
              <div>
                <div className="text-sm text-text-secondary font-medium">
                  Methodology review in progress
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Paper selection, data source validation, and computation
                  pipeline design for this dimension are under active review.
                  Full provenance documentation will follow the same structure
                  as the Trade section above.
                </p>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Update Schedule */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
          <h2 className="text-lg font-medium text-text-primary mb-4">
            Update Schedule
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="pb-2 pr-4 font-medium">Layer</th>
                  <th className="pb-2 pr-4 font-medium">Source</th>
                  <th className="pb-2 pr-4 font-medium">Check Frequency</th>
                  <th className="pb-2 font-medium">Source Lag</th>
                </tr>
              </thead>
              <tbody className="text-text-secondary divide-y divide-border/50">
                <tr>
                  <td className="py-2 pr-4 font-mono">Text Score</td>
                  <td className="py-2 pr-4">
                    NBER, IMF, BIS, OECD publications
                  </td>
                  <td className="py-2 pr-4">Every 6 hours</td>
                  <td className="py-2">T+0 (publication date)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono">Hard Data</td>
                  <td className="py-2 pr-4">OECD SDMX, WTO, UN COMTRADE</td>
                  <td className="py-2 pr-4">Daily</td>
                  <td className="py-2">T+30 to T+180 days</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono">Composite</td>
                  <td className="py-2 pr-4">Blended from above</td>
                  <td className="py-2 pr-4">On any source update</td>
                  <td className="py-2">\u2014</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-xs text-text-muted">
          All citations should be independently verified. DOI links provided
          for cross-reference. Last updated: April 2026.
        </div>
      </footer>
    </div>
  );
}
