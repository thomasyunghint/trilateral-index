import {
  BookOpen,
  FileText,
  Database,
  Layers,
  Scale,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

const BUCKETS_DATA = [
  {
    name: "Trade",
    text: 30,
    hard: 70,
    papers: [
      { authors: "Anderson & van Wincoop", year: 2003, title: "Gravity with Gravitas", journal: "AER" },
      { authors: "Aiyar, Malacrino & Presbitero", year: 2024, title: "Investing in Friends", journal: "European J. Political Economy" },
    ],
    hardSources: "OECD Monthly International Merchandise Trade (SDMX API)",
    rationale: "Trade is the most data-rich bucket. OECD bilateral trade statistics are available monthly. Gravity model literature demonstrates flows are well-explained by structural economic variables.",
  },
  {
    name: "Investment",
    text: 40,
    hard: 60,
    papers: [
      { authors: "Kalinova, Palerm & Thomsen", year: 2010, title: "OECD FDI Restrictiveness Index", journal: "OECD Working Paper" },
      { authors: "Mistura & Roulet", year: 2019, title: "The Determinants of FDI", journal: "OECD Working Paper" },
    ],
    hardSources: "OECD FDI Statistics by partner, OECD FDI Regulatory Restrictiveness Index",
    rationale: "Investment data is quarterly (not monthly), creating more lag. CFIUS/EU screening decisions appear in text before statistics.",
  },
  {
    name: "Technology",
    text: 60,
    hard: 40,
    papers: [
      { authors: "Jinji & Ozawa", year: 2024, title: "Economic Consequences of US-China Decoupling", journal: "CEPR/RIETI" },
      { authors: "Gentzkow, Kelly & Taddy", year: 2019, title: "Text as Data", journal: "J. Economic Literature" },
    ],
    hardSources: "WIPO patent filings, OECD MSTI, US BIS Entity List",
    rationale: "Export controls are policy signals first. Patent data lags 18+ months. Technology cooperation/conflict is narrative-driven.",
  },
  {
    name: "Finance",
    text: 25,
    hard: 75,
    papers: [
      { authors: "Chinn & Ito", year: 2006, title: "KAOPEN Financial Openness Index", journal: "J. Development Economics" },
      { authors: "Cipriani, Goldberg & La Spada", year: 2023, title: "Financial Sanctions, SWIFT, and the International Payment System", journal: "J. Economic Perspectives" },
    ],
    hardSources: "IMF COFER, BIS Triennial Survey, SWIFT RMB Tracker",
    rationale: "Finance is the most data-rich bucket after Trade. Exchange rates, reserves, and capital flows are available at daily-to-monthly frequency.",
  },
  {
    name: "Leverage",
    text: 80,
    hard: 20,
    papers: [
      { authors: "Farrell & Newman", year: 2019, title: "Weaponized Interdependence", journal: "International Security" },
      { authors: "Clayton, Maggiori & Schoar", year: 2024, title: "A Theory of Economic Coercion and Fragmentation", journal: "BIS Working Paper" },
    ],
    hardSources: "USGS Mineral Summaries, IEA Energy Security, Eurostat CRM",
    rationale: "No bilateral leverage index exists. Weaponization is inherently about threats and actions, which are text events. Hard data measures vulnerability, not weaponization itself.",
  },
  {
    name: "Policy",
    text: 50,
    hard: 50,
    papers: [
      { authors: "Baker, Bloom & Davis", year: 2016, title: "Measuring Economic Policy Uncertainty", journal: "QJE" },
      { authors: "Caldara & Iacoviello", year: 2022, title: "Measuring Geopolitical Risk", journal: "AER" },
    ],
    hardSources: "GDELT 2.0 Events, UN Ideal Point Distance, Treaty databases",
    rationale: "Policy is dual-natured: announcements are text, but GDELT event counts and UN voting alignment provide structured hard data.",
  },
];

const LAYERS = [
  {
    number: 1,
    name: "Data Collection",
    description: "Gather, clean, classify raw inputs from text and structured sources",
    academic: "DIKW Pyramid (Rowley 2007), Gentzkow/Kelly/Taddy (JEL 2019) Text as Data, CAMEO/GDELT event coding",
    operations: ["Article ingestion from Tier 1-3 sources", "LLM-as-Classifier with forced citation", "2-round fact-check verification", "Hard data API ingestion (OECD SDMX, GDELT)"],
  },
  {
    number: 2,
    name: "Unearth the Numbers",
    description: "Quantitative analysis, scoring, normalization, and composite blending",
    academic: "OECD Handbook on Composite Indicators (2008), Chinn-Ito KAOPEN PCA methodology, BACE (Sala-i-Martin et al. AER 2004)",
    operations: ["Text score aggregation (Tier x Confidence x Recency weights)", "Hard data normalization (min-max to [-100, +100])", "Composite blending (bucket-specific text/hard weights)", "Cross-method convergence measurement"],
  },
  {
    number: 3,
    name: "Synthesis",
    description: "Macro interpretation, cross-bucket patterns, narrative generation",
    academic: "Heuer & Pherson (2010) Structured Analytic Techniques, CIA Tradecraft Primer (2009), GEOII multi-dimensional synthesis",
    operations: ["Cross-bucket convergence detection", "Cross-pair triangulation analysis", "Event-driven narrative linking", "Anomaly flagging (convergence < 0.3)"],
  },
];

export default function MethodologyPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
            <BookOpen size={12} />
            <span>Academic Foundations</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-text-primary">
            Methodology
          </h1>
          <p className="mt-4 text-base text-text-secondary max-w-2xl leading-relaxed">
            Every weight, formula, and analytical choice in TGFI is grounded in
            peer-reviewed literature. 30 papers across 6 dimensions, following the OECD
            Handbook on Constructing Composite Indicators (2008) framework.
          </p>
        </div>
      </section>

      {/* 3-Layer Framework */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Layers size={16} className="text-accent" />
          <h2 className="text-lg font-medium text-text-primary">3-Layer Analytical Framework</h2>
        </div>

        <div className="space-y-3">
          {LAYERS.map((layer) => (
            <div key={layer.number} className="data-card overflow-hidden">
              <div className="flex items-start gap-4 p-4">
                {/* Layer number */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent/10 border border-accent/20">
                  <span className="text-sm font-mono font-bold text-accent">
                    {layer.number}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-text-primary">{layer.name}</h3>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">{layer.description}</p>

                  {/* Academic basis */}
                  <div className="mt-2 text-[11px] text-text-muted">
                    <span className="text-accent/70 font-mono text-[10px] uppercase tracking-wider">
                      Academic basis:
                    </span>{" "}
                    {layer.academic}
                  </div>

                  {/* Operations */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {layer.operations.map((op) => (
                      <span
                        key={op}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-bg-surface text-text-muted border border-border/50"
                      >
                        <ChevronRight size={8} />
                        {op}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Per-Bucket Methodology */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-8 border-t border-border">
        <div className="flex items-center gap-2 mb-6">
          <Scale size={16} className="text-accent" />
          <h2 className="text-lg font-medium text-text-primary">Per-Dimension Weight Justification</h2>
        </div>

        <div className="space-y-3">
          {BUCKETS_DATA.map((bucket) => (
            <details key={bucket.name} className="data-card group">
              <summary className="flex items-center gap-4 p-4 cursor-pointer hover:bg-bg-hover/30 transition-colors">
                <div className="w-28 shrink-0">
                  <div className="text-sm font-medium text-text-primary">{bucket.name}</div>
                </div>

                {/* Weight bar */}
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex h-2 flex-1 rounded-full overflow-hidden bg-bg-surface">
                    <div
                      className="bg-accent/40 rounded-l-full"
                      style={{ width: `${bucket.text}%` }}
                    />
                    <div
                      className="bg-accent rounded-r-full"
                      style={{ width: `${bucket.hard}%` }}
                    />
                  </div>
                  <div className="w-24 text-right shrink-0">
                    <span className="font-mono text-xs text-text-muted">
                      {bucket.text}/{bucket.hard}
                    </span>
                  </div>
                </div>

                <ChevronRight
                  size={14}
                  className="text-text-muted transition-transform duration-200 group-open:rotate-90"
                />
              </summary>

              <div className="border-t border-border p-4 bg-bg-primary/50 space-y-3">
                {/* Rationale */}
                <p className="text-xs text-text-secondary leading-relaxed">
                  {bucket.rationale}
                </p>

                {/* Weight details */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-[10px] text-text-muted uppercase tracking-wider">
                      <FileText size={10} />
                      Text Weight: {bucket.text}%
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-[10px] text-text-muted uppercase tracking-wider">
                      <Database size={10} />
                      Hard Data: {bucket.hard}%
                    </div>
                    <div className="text-[11px] text-text-muted">{bucket.hardSources}</div>
                  </div>
                </div>

                {/* Papers */}
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">
                    Key References
                  </div>
                  {bucket.papers.map((paper, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <ExternalLink size={10} className="text-accent/50 mt-0.5 shrink-0" />
                      <span className="text-text-secondary">
                        {paper.authors} ({paper.year}). &ldquo;{paper.title}.&rdquo;{" "}
                        <em className="text-text-muted">{paper.journal}</em>.
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Scoring Spectrum */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-8 border-t border-border">
        <h2 className="text-lg font-medium text-text-primary mb-4">Cooperation-Conflict Spectrum</h2>
        <div className="data-card p-4 space-y-3">
          <p className="text-xs text-text-secondary leading-relaxed">
            All scores range from -100 (strong conflict) to +100 (strong cooperation).
            This bilateral spectrum derives from the CAMEO/Goldstein tradition of event
            coding (Goldstein, JCR 1992) and extends it to article-level analysis via LLM classification.
          </p>
          <div className="flex items-center gap-3 py-2">
            <span className="font-mono text-sm text-conflict font-bold">-100</span>
            <div className="h-3 flex-1 rounded-full bg-gradient-to-r from-conflict via-neutral to-cooperation" />
            <span className="font-mono text-sm text-cooperation font-bold">+100</span>
          </div>
          <div className="flex justify-between text-[10px] text-text-muted uppercase tracking-wider">
            <span>Strong Conflict</span>
            <span>Neutral</span>
            <span>Strong Cooperation</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-xs text-text-muted">
          Full bibliography: 30 papers. See docs/methodology.md for complete citations.
        </div>
      </footer>
    </div>
  );
}
