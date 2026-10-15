import { useLeagueResetAt } from '../game/leagueReset';
import { t } from '../locales';

// The warning while the pre-season runs (the League has not opened: the server's reset moment is null): it is an open test and every online hero starts again from zero when the League
// begins. Hidden once the League opened, while the server has not answered, and in the offline / desktop build (no backend, nothing is ever reset there).
export default function PreseasonResetNotice({ className }: { className?: string }) {
  const resetAt = useLeagueResetAt();
  if (resetAt !== null) return null;
  return (
    <p className={className ?? 'league-preseason-notice'} role="note" data-testid="preseason-reset-notice">
      {t('leagueReset.preseasonWarning')}
    </p>
  );
}
