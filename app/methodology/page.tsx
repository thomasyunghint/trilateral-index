/**
 * Methodology — How TGFI works.
 * Single scrollable rubric covering detection rules, credibility scoring,
 * source tiers, and the analytical pipeline.
 */
import Link from "next/link";

export const metadata = {
  title: "Methodology — TGFI",
};

const SOURCE_COUNT = 9;
const MAX_CLAIMS_PER_ARTICLE = 30;

export default function MethodologyPage() {
  return (
    <div>
      <header className="tgfi-masthead">
        <div className="tgfi-container">
          <h1 className="tgfi-masthead-title">Methodology</h1>
          <div className="tgfi-masthead-meta">
            <span>TGFI detection engine</span>
            <span>Version 1.0</span>
            <span>Last revised May 2026</span>
          </div>
        </div>
      </header>

      <div className="tgfi-container-narrow" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <section style={{ marginBottom: 56 }}>
          <p style={{
            fontSize: 18, lineHeight: 1.65, color: "rgb(var(--ink-1))",
            fontFamily: "var(--font-playfair-display), Georgia, serif",
            fontStyle: "italic",
            margin: "0 0 24px 0",
          }}>
            TGFI is an insight engine — not an index. Rather than aggregate sentiment into one
            scalar, it surfaces specific patterns across statements made by leading think tanks
            and policy institutes on China-US-EU economic and political relations.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgb(var(--ink-2))" }}>
            Every signal you see on the home page is the output of a deterministic detection rule
            applied to a corpus of structured claims extracted from primary sources. The pipeline
            runs continuously: new articles are ingested every 30 minutes, claims are extracted
            within 5 minutes of arrival, and patterns are re-detected every 12 hours.
          </p>
        </section>

        <Section number="01" title="Pipeline">
          <p>Four stages, each independently verifiable.</p>
          <ol className="method-list">
            <li>
              <strong>Ingest.</strong> A cron worker polls RSS feeds and HTML archives from {SOURCE_COUNT}{" "}
              primary sources every 30 minutes. New articles are stored with full text where the
              source permits programmatic access. URL-based deduplication.
            </li>
            <li>
              <strong>Extract.</strong> A claim extractor (Claude Haiku 4.5) processes pending articles
              one at a time, producing structured records: claim text, verbatim quote,
              direction in [&minus;100, +100], bucket weights, pairs. At most {MAX_CLAIMS_PER_ARTICLE}{" "}
              claims per article. Articles with no in-scope claims are marked as skipped, not failed.
            </li>
            <li>
              <strong>Detect.</strong> Three deterministic rules run over the extracted claim corpus
              every 12 hours: Temporal Flip, Source Disagreement, Cross-Bucket Divergence. Each
              rule emits zero or more signals that pass a numeric threshold.
            </li>
            <li>
              <strong>Interpret.</strong> The top five signals per cycle receive a 3&ndash;4 sentence
              analysis brief drafted by Claude Sonnet 4. The brief is summary text; the underlying
              pattern detection is rule-based and reproducible.
            </li>
          </ol>
        </Section>

        <Section number="02" title="Detection rules">
          <Rule
            name="Temporal Flip"
            spec="|Δ direction| ≥ 60 within 45 days, same source × same pair, different articles, topic similarity passes (keyword Jaccard ≥ 0.20, OR bucket cosine ≥ 0.85 with keyword floor 0.08)"
            describes="A source materially changes its position on a bilateral relationship within a short window."
          />
          <Rule
            name="Source Disagreement"
            spec="Direction gap ≥ 40 points across two distinct sources, same pair × same dominant bucket, topic similarity satisfies the same dual threshold as above"
            describes="Two credible analysts reach opposite conclusions on the same trajectory."
          />
          <Rule
            name="Cross-Bucket Divergence"
            spec="Bucket-pair direction gap ≥ 50 points within the same bilateral pair, at least 2 claims per bucket"
            describes="Cooperation in one dimension (e.g. Trade) while restriction in another (e.g. Technology) for the same country pair."
          />
          <p style={{ fontSize: 13, color: "rgb(var(--ink-3))", marginTop: 16 }}>
            Post-detection editorial dedup collapses multiple flip candidates
            between the same source × pair × dominant bucket into a single
            representative signal (highest absolute Δ wins). Topic-similarity
            thresholds were tightened in May 2026 after observing false-positive
            flips between superficially related claims.
          </p>
          <p style={{ fontSize: 13, color: "rgb(var(--ink-3))", marginTop: 16 }}>
            Source code:{" "}
            <a href="https://github.com/thomasyunghint/trilateral-index/blob/main/lib/detector.ts"
               style={{ color: "rgb(var(--accent-1))" }} target="_blank" rel="noopener noreferrer">
              lib/detector.ts
            </a>
          </p>
        </Section>

        <Section number="03" title="Credibility scoring">
          <p>
            Each signal carries a composite credibility score on a 0–5 scale, computed from
            five orthogonal factors. The score is shown as both a 5-bar breakdown and a
            star-equivalent rating.
          </p>
          <div className="method-grid" style={{ marginTop: 16 }}>
            <CredFactor name="Source tier" weight="0.20" rule="T1-Academic (NBER, BIS) = 1.0; T1-Advisory (Bruegel, MERICS, PIIE, Rhodium) = 1.0; T2-Policy (ECFR, CF40) = 0.65" />
            <CredFactor name="Source diversity" weight="0.20" rule="Distinct sources contributing claims to the signal, capped at 3. 1 source = 0.33; 2 sources = 0.67; 3+ = 1.0" />
            <CredFactor name="Sample size" weight="0.20" rule="Number of claims contributing to the signal, capped at 4. N=2 = 0.5; N=4+ = 1.0" />
            <CredFactor name="Detection margin" weight="0.20" rule="How far above the rule's threshold the signal is. Δ=60 (threshold) → 0.5; Δ=80 → 1.0" />
            <CredFactor name="Reproducibility" weight="0.20" rule="Always 1.0: detection is deterministic on a fixed corpus. Same inputs → same signals." />
          </div>
          <p style={{ fontSize: 13, color: "rgb(var(--ink-3))", marginTop: 20 }}>
            Note: credibility measures the <em>signal&rsquo;s</em> rigor, not the truthfulness of the
            underlying claims. A high credibility score means the pattern is solid — not that the
            source is right.
          </p>
        </Section>

        <Section number="04" title="Favorability">
          <p>Each claim carries a direction score in [&minus;100, +100]:</p>
          <ul className="method-list">
            <li><strong>+50 to +100:</strong> Strong cooperation. Author argues for deepening ties, joint policy, mutual benefit.</li>
            <li><strong>+10 to +49:</strong> Weak cooperation. Cautious optimism, alignment of interests, modest progress.</li>
            <li><strong>&minus;9 to +9:</strong> Neutral / observational. Descriptive, no clear direction.</li>
            <li><strong>&minus;10 to &minus;49:</strong> Weak conflict. Decoupling, friction, competing interests.</li>
            <li><strong>&minus;50 to &minus;100:</strong> Strong conflict. Sanctions, hostile rhetoric, fundamental incompatibility.</li>
          </ul>
          <p style={{ marginTop: 16 }}>
            Direction is assigned by the claim extractor based on the verbatim wording and stance
            of the source author. Hedged language attenuates magnitude.
          </p>
          <p>
            Each signal displays the Δ direction with a 95% confidence interval, estimated at
            approximately ±8% of the absolute shift (or ±5 points, whichever is larger).
          </p>
        </Section>

        <Section number="05" title="Baseline volatility">
          <p>
            For each Temporal Flip signal, TGFI computes how anomalous the shift is relative
            to the source&rsquo;s normal volatility on this pair × bucket. We pull all claims from
            the source over the past 365 days that share the same dominant bucket and the same
            bilateral pair, compute the sample standard deviation σ of their direction scores,
            and report the signal&rsquo;s Δ as a multiple of σ.
          </p>
          <p>
            A signal flagged &ldquo;4.7σ above normal&rdquo; means the observed shift is 4.7
            times the source&rsquo;s typical direction volatility. If fewer than 5 historical
            claims exist, the baseline is omitted (insufficient sample).
          </p>
        </Section>

        <Section number="06" title="Dissenting evidence">
          <p>
            For each surfaced signal, TGFI also queries the corpus for{" "}
            <strong>counter-claims</strong>: statements from other sources, in the same time
            window, on the same pair × bucket, with direction opposite to the signal&rsquo;s
            trajectory (gap ≥ 40 points). Up to two are displayed.
          </p>
          <p>
            This is not a falsification test. It is a transparency mechanism: the reader can see
            whether the signal represents broad consensus or a unilateral repositioning by one
            source. Absence of counter-claims is itself informative.
          </p>
        </Section>

        <Section number="07" title="Source selection">
          <p>
            TGFI sources are restricted to T1 academic publishers and T1/T2 think tanks and
            policy institutes. Newspaper opinion pieces, blog posts, and individual analyst
            tweets are explicitly excluded.
          </p>
          <p>
            See <Link href="/sources" style={{ color: "rgb(var(--accent-1))" }}>Sources</Link>{" "}
            for the live ingest feed by source, including tier classifications and access status.
          </p>
        </Section>

        <Section number="08" title="Known limitations">
          <ul className="method-list">
            <li>
              <strong>Source distribution.</strong> Roughly two-thirds of current claims come from
              ECFR, with Bruegel a distant second. The detection engine does not yet compensate
              for source frequency. We are working on rebalancing.
            </li>
            <li>
              <strong>PIIE / RAND access.</strong> Both block programmatic fetches with HTTP 403.
              For these sources, only RSS descriptions (~50&ndash;100 words) are available.
            </li>
            <li>
              <strong>Interpretation is generative.</strong> The Sonnet-drafted briefs summarize
              the detected pattern in natural language. The summary should not be treated as a
              causal explanation; it is descriptive scaffolding on top of the rule-based detection.
            </li>
            <li>
              <strong>EU-internal claims.</strong> Some sources comment on EU policy without
              reference to a trilateral pair. These may produce noisy heatmap cells.
            </li>
          </ul>
        </Section>

        <p style={{ marginTop: 64, fontSize: 12, color: "rgb(var(--ink-4))", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
          Project repository:{" "}
          <a href="https://github.com/thomasyunghint/trilateral-index"
             style={{ color: "rgb(var(--ink-3))" }} target="_blank" rel="noopener noreferrer">
            github.com/thomasyunghint/trilateral-index
          </a>
        </p>
      </div>

      <footer className="tgfi-footer">
        <div className="tgfi-container">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>TGFI Methodology</span>
            <span>
              <Link href="/">← Back to signals</Link>
              <span style={{ margin: "0 12px", color: "rgb(var(--ink-5))" }}>·</span>
              <Link href="/sources">Sources</Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 16,
        paddingBottom: 8, borderBottom: "1px solid rgb(var(--rule-3))",
        marginBottom: 20,
      }}>
        <span style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: 11, color: "rgb(var(--ink-4))",
          letterSpacing: "0.1em",
        }}>{number}</span>
        <h2 style={{
          fontFamily: "var(--font-playfair-display), Georgia, serif",
          fontSize: 26, fontWeight: 700, letterSpacing: "-0.015em",
          margin: 0, color: "rgb(var(--ink-1))",
        }}>{title}</h2>
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: "rgb(var(--ink-2))" }}>
        {children}
      </div>
    </section>
  );
}

function Rule({ name, spec, describes }: { name: string; spec: string; describes: string }) {
  return (
    <div style={{
      padding: 16,
      background: "rgb(var(--paper-3))",
      borderLeft: "3px solid rgb(var(--accent-1))",
      marginBottom: 12,
    }}>
      <div style={{
        fontFamily: "var(--font-playfair-display), Georgia, serif",
        fontSize: 18, fontWeight: 700, color: "rgb(var(--ink-1))",
        marginBottom: 6,
      }}>{name}</div>
      <div style={{
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: 12, color: "rgb(var(--ink-2))", marginBottom: 8,
      }}>{spec}</div>
      <div style={{ fontSize: 14, color: "rgb(var(--ink-2))" }}>{describes}</div>
    </div>
  );
}

function CredFactor({ name, weight, rule }: { name: string; weight: string; rule: string }) {
  return (
    <div className="cred-factor">
      <span className="cred-factor-name">{name}</span>
      <span className="cred-factor-weight">w = {weight}</span>
      <span className="cred-factor-rule">{rule}</span>
    </div>
  );
}
