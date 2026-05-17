export default function InsightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        body { background: #09090b !important; color: #fafafa !important; }
        .insights-card { background: #18181b !important; border-color: #27272a !important; }
        .insights-stat { background: rgba(24,24,27,0.5) !important; border-color: #27272a !important; }
        .insights-header { border-color: rgba(39,39,42,0.5) !important; }
        .insights-evidence { background: #0a0a0a !important; }
        .insights-footer { border-color: rgba(39,39,42,0.5) !important; }
        .insights-source { background: #18181b !important; border-color: #27272a !important; }
      `}</style>
      {children}
    </>
  );
}
