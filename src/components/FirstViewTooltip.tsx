// Small one-time "what is this button" bubble — shown next to a side-rail icon the first time the
// player ever sees it, then never again (see App.tsx's seenTooltips queue + SaveData.seenTooltips).
export default function FirstViewTooltip({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <div className="first-tooltip" role="status">
      {label}
      <span className="first-tooltip-arrow" />
    </div>
  );
}
