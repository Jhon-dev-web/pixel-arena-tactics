import { fmtNum, t } from '../locales';
import { PIONEER_KIT } from '../game/pioneerKit';
import { Button, Dialog } from './ui';

// Shown once, on the first load after the first League reset every online hero (leagueReset.ts; SaveData.league.noticeSeen). It says what happened, that everyone started at the same
// moment, what stayed (account, name, Pass) and, for the testers, the Pioneer kit (title, frame and starter chest).
export default function LeagueResetModal({ pioneer, onClose }: { pioneer: boolean; onClose: () => void }) {
  return (
    <Dialog
      className="league-reset-modal"
      title={t('leagueReset.title')}
      footer={
        <Button variant="primary" block onClick={onClose}>
          {t('leagueReset.cta')}
        </Button>
      }
    >
      <p>{t('leagueReset.what')}</p>
      <p>{t('leagueReset.kept')}</p>
      {pioneer && <p className="ui-alert good">{t('leagueReset.pioneer', { gold: fmtNum(PIONEER_KIT.gold), potions: fmtNum(PIONEER_KIT.potionAmount), xp: fmtNum(PIONEER_KIT.xpAmount) })}</p>}
    </Dialog>
  );
}
