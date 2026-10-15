import { t } from '../locales';

// Shown once, on the first load after the first League reset every online hero (leagueReset.ts; SaveData.league.noticeSeen). It says what happened, that everyone started at the same
// moment, what stayed (account, name, Pass) and, for the testers, the thank-you title.
export default function LeagueResetModal({ pioneer, onClose }: { pioneer: boolean; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal claim-modal league-reset-modal" role="dialog" aria-modal="true" aria-labelledby="league-reset-title">
        <h2 className="modal-title" id="league-reset-title">
          {t('leagueReset.title')}
        </h2>
        <p className="claim-name">{t('leagueReset.what')}</p>
        <p className="claim-name">{t('leagueReset.kept')}</p>
        {pioneer && <p className="claim-name league-reset-pioneer">{t('leagueReset.pioneer')}</p>}
        <button className="result-btn" onClick={onClose} data-ui>
          {t('leagueReset.cta')}
        </button>
      </div>
    </div>
  );
}
