import { useEffect } from 'react';
import { t } from '../locales';
import { playSfx } from '../game/audio';
import { welcomeRowText, WelcomeBackAction } from './welcomeBackText';
import { WelcomeBackSummary } from '../game/welcomeBack';
import WholesaleLink from './WholesaleLink';
import { Button, Dialog } from './ui';

// One quiet card listing what finished while the player was away. Every row has ONE button: it opens the screen of that activity, or collects it where a free
// collect action already exists (mining, woodcutting, garden, delivery). The Pass-only "Resgatar tudo" shows up for owners only.

export default function WelcomeBackModal({
  summary,
  canClaimAll,
  onAction,
  onClaimAll,
  onClose,
}: {
  summary: WelcomeBackSummary;
  canClaimAll: boolean;
  onAction: (action: WelcomeBackAction) => void;
  onClaimAll: () => void;
  onClose: () => void;
}) {
  // The same short sounds as the hunt reward: a unique piece, or else a rare material, among what the hunt found while the player was away.
  useEffect(() => {
    const glows = summary.rows.map((r) => welcomeRowText(r).glow);
    if (glows.includes('unique')) playSfx('drop_unique');
    else if (glows.includes('rare')) playSfx('drop_rare');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog
      className="wb-modal"
      tone="win"
      title={t('welcomeBack.title')}
      subtitle={t('welcomeBack.hint')}
      footer={
        <>
          {canClaimAll && (
            <Button variant="primary" block onClick={onClaimAll}>
              {t('claimAll.button')}
            </Button>
          )}
          <Button block onClick={onClose}>
            {t('welcomeBack.close')}
          </Button>
        </>
      }
    >
      <ul className="dlg-list">
        {summary.rows.map((row) => {
          const text = welcomeRowText(row);
          return (
            <li className={`dlg-row wb-row${text.rare ? ' wb-rare' : ''}${text.glow ? ` reveal rv-${text.glow}` : ''}`} key={row.kind}>
              <div className="dlg-row-text">
                <span className="dlg-row-name">{text.title}</span>
                <span className="dlg-row-detail">{text.detail}</span>
                {text.note && <span className="dlg-row-note">{text.note}</span>}
              </div>
              <Button size="sm" onClick={() => onAction(text.action)}>
                {text.button}
              </Button>
            </li>
          );
        })}
      </ul>
      <WholesaleLink hint show={summary.rows.some((r) => 'capHit' in r && r.capHit) ? 'always' : 'ifFull'} />
    </Dialog>
  );
}
