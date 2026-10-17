import { t } from '../locales';
import { useOpsState, useOpsStatusPolling } from '../lib/opsStatus';
import '../ui/ops.css';

// The maintenance banner: a thin bar at the top of the whole game (login screen included) while the owner (or the watchdog) has switched maintenance_mode on, while /status.json says so, or when the server
// has not answered for a few minutes while the game's own host did. It never blocks the game and says plainly that the saved progress is safe. Mounted once, in main.tsx.
export default function OpsBanner() {
  useOpsStatusPolling();
  const s = useOpsState();
  if (!s.maintenance) return null;
  const reason = s.maintenanceReason;
  return (
    <div className="ops-banner" role="status" aria-live="polite" data-testid="ops-banner" data-reason={reason ?? ''}>
      <strong>{t(reason === 'unreachable' ? 'ops.unreachableTitle' : 'ops.maintenanceTitle')}</strong>
      <span>{s.staticMessage ?? t(reason === 'unreachable' ? 'ops.unreachableText' : 'ops.maintenanceText')}</span>
    </div>
  );
}
