/**
 * Layout for /insights routes.
 *
 * Wraps children in a scoped dark-theme container that does not pollute
 * the global <body> styles (was previously using `body { ... !important }`
 * which leaked into portals and caused theme flash on route transitions).
 */
export default function InsightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="insights-theme"
      style={{
        minHeight: "100vh",
        background: "#09090b",
        color: "#fafafa",
      }}
    >
      <style>{`
        .insights-theme .insights-card { background: #18181b; border-color: #27272a; }
        .insights-theme .insights-stat { background: rgba(24,24,27,0.5); border-color: #27272a; }
        .insights-theme .insights-header { border-color: rgba(39,39,42,0.5); }
        .insights-theme .insights-evidence { background: #0a0a0a; }
        .insights-theme .insights-footer { border-color: rgba(39,39,42,0.5); }
        .insights-theme .insights-source { background: #18181b; border-color: #27272a; }
      `}</style>
      {children}
    </div>
  );
}
