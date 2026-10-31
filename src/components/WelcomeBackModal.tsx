import { useEffect } from 'react';
import { fmtNum, t } from '../locales';
import { playSfx } from '../game/audio';
import { awaySubtitle, welcomeRowText, WelcomeBackAction } from './welcomeBackText';
import { WelcomeBackSummary } from '../game/welcomeBack';
import { getMaterial } from '../game/materials';
import { UI_ICON } from './uiIcons';
import MaterialIcon from './MaterialIcon';
import WholesaleLink from './WholesaleLink';
import { Button, Dialog, ItemFrame } from './ui';

// What finished while the player was away, one card per activity: its icon and name, one short line (where, time counted, wins), the materials as icons with their amount (the rarest first; the
// ones past the limit are counted as "+N"), the gold and XP when the activity already worked them out, short badges ("Armazém cheio", a unique piece), and ONE full-width button: it opens the screen
// of that activity (the Hunt, whose reward is claimed there) or collects it where a free collect action already exists (mining, woodcutting, garden, delivery). "Depois" is a quiet button below;
// the Pass-only "Resgatar tudo" shows up for owners only.

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
      subtitle={awaySubtitle(summary.awayMs)}
      footer={
        <>
          {canClaimAll && (
            <Button variant="primary" block onClick={onClaimAll}>
              {t('claimAll.button')}
            </Button>
          )}
          <Button size="sm" className="wb-later" block onClick={onClose}>
            {t('welcomeBack.close')}
          </Button>
        </>
      }
    >
      <ul className="dlg-list">
        {summary.rows.map((row) => {
          const text = welcomeRowText(row);
          const hasStats = text.mats.length > 0 || text.gold > 0 || text.xp > 0;
          return (
            <li className={`wb-card${text.rare ? ' wb-rare' : ''}${text.glow ? ` reveal rv-${text.glow}` : ''}`} key={row.kind}>
              <div className="wb-head">
                <img className="wb-icon pixel-icon" src={UI_ICON[text.icon]} alt="" draggable={false} />
                <div className="wb-head-text">
                  <span className="wb-name">{text.title}</span>
                  <span className="wb-detail">{text.detail}</span>
                </div>
                {text.badges.length > 0 && (
                  <span className="wb-badges">
                    {text.badges.map((b) => (
                      <span className={`ui-tag ${b.tone}`} key={b.text}>
                        {b.text}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              {hasStats && (
                <div className="wb-stats">
                  {text.mats.map((m) => {
                    const def = getMaterial(m.id);
                    return (
                      <span className="wb-mat" key={m.id} title={m.name} role="img" aria-label={`${m.name} x${fmtNum(m.n)}`}>
                        <ItemFrame size="sm" rarity={m.tier} qty={fmtNum(m.n)}>
                          {def && <MaterialIcon item={def} />}
                        </ItemFrame>
                      </span>
                    );
                  })}
                  {text.more > 0 && <span className="wb-more">+{text.more}</span>}
                  {text.gold > 0 && (
                    <span className="wb-gain gold">
                      <img className="pixel-icon" src={UI_ICON.shop} alt="" draggable={false} />
                      {fmtNum(text.gold)}
                    </span>
                  )}
                  {text.xp > 0 && <span className="wb-gain xp">{t('welcomeBack.xp', { n: fmtNum(text.xp) })}</span>}
                </div>
              )}
              <Button variant="primary" block onClick={() => onAction(text.action)}>
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
