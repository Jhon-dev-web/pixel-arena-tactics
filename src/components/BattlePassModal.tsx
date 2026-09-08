import { t } from '../locales';
import { battlePassXpForLevel, isBattlePassActive, MAX_BATTLE_PASS_LEVEL, SaveData } from '../game/engine';
import { BATTLE_PASS_TRACK, BattlePassReward } from '../game/battlepass';
import { MATERIALS } from '../game/materials';
import { getConsumable } from '../game/consumables';
import { getGem } from '../game/gems';

function rewardIcon(reward: BattlePassReward): string {
  switch (reward.kind) {
    case 'gold':
      return '🪙';
    case 'material':
      return MATERIALS.find((m) => m.id === reward.id)?.icon ?? '📦';
    case 'consumable':
      return getConsumable(reward.id ?? '')?.icon ?? '🧪';
    case 'gem':
      return getGem(reward.id ?? '')?.icon ?? '💎';
    case 'oneToken':
      return '🔶';
    case 'cosmetic':
      return '🎖️';
    default:
      return '❔';
  }
}

function rewardLabel(reward: BattlePassReward): string {
  switch (reward.kind) {
    case 'gold':
      return `+${reward.amount}`;
    case 'material': {
      const def = MATERIALS.find((m) => m.id === reward.id);
      return `${def ? t(`materials.${def.nameKey}`) : reward.id} x${reward.amount}`;
    }
    case 'consumable': {
      const def = getConsumable(reward.id ?? '');
      return `${def ? t(`consumables.${def.nameKey}`) : reward.id} x${reward.amount}`;
    }
    case 'gem': {
      const def = getGem(reward.id ?? '');
      return `${def ? t(`gems.${def.nameKey}`) : reward.id} x${reward.amount}`;
    }
    case 'oneToken':
      return `ONE +${reward.amount}`;
    case 'cosmetic':
      return t('battlePass.cosmeticReward');
    default:
      return '';
  }
}

function formatRemaining(ms: number): string {
  const totalHours = Math.max(0, Math.ceil(ms / (3600 * 1000)));
  if (totalHours >= 24) return t('battlePass.days', { n: Math.ceil(totalHours / 24) });
  return t('battlePass.hours', { n: totalHours });
}

function RewardTile({
  reward,
  reached,
  claimed,
  locked,
  onClaim,
}: {
  reward: BattlePassReward;
  reached: boolean;
  claimed: boolean;
  locked: boolean;
  onClaim: () => void;
}) {
  const canClaim = reached && !claimed && !locked;
  return (
    <button
      className={`bp-reward${claimed ? ' claimed' : ''}${locked ? ' locked' : ''}${canClaim ? ' ready' : ''}`}
      onClick={canClaim ? onClaim : undefined}
      disabled={!canClaim}
      data-ui
    >
      <span className="bp-reward-icon">{rewardIcon(reward)}</span>
      <span className="bp-reward-label">{rewardLabel(reward)}</span>
      {claimed && <span className="bp-reward-tag">✓</span>}
      {locked && <span className="bp-reward-tag">🔒</span>}
    </button>
  );
}

export default function BattlePassModal({
  save,
  onActivate,
  onClaim,
  onClaimAll,
  onClose,
}: {
  save: SaveData;
  onActivate: () => void;
  onClaim: (level: number, track: 'free' | 'premium') => void;
  onClaimAll: () => void;
  onClose: () => void;
}) {
  const now = Date.now();
  const active = isBattlePassActive(save, now);
  const xpNeed = battlePassXpForLevel(save.battlePassLevel);
  const pct = save.battlePassLevel >= MAX_BATTLE_PASS_LEVEL ? 100 : Math.min(100, (save.battlePassXp / xpNeed) * 100);

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal bp-modal">
        <h2 className="modal-title">{t('battlePass.title')}</h2>

        <div className="bp-status-card">
          <span className={`bp-status-label${active ? ' active' : ''}`}>
            {active ? t('battlePass.statusActive') : t('battlePass.statusFree')}
          </span>
          {active && save.battlePassExpiresAt && (
            <span className="bp-expires">{t('battlePass.expiresIn', { n: formatRemaining(save.battlePassExpiresAt - now) })}</span>
          )}
          <div className="bp-perks">
            <span className="bp-perk">{t('battlePass.perkStorage')}</span>
            <span className="bp-perk">{t('battlePass.perkLuck')}</span>
          </div>
          <div className="bp-level-header">
            <span>{t('battlePass.levelLabel', { n: save.battlePassLevel, m: MAX_BATTLE_PASS_LEVEL })}</span>
            {save.battlePassLevel < MAX_BATTLE_PASS_LEVEL && (
              <span className="bp-xp-text">{t('battlePass.xpProgress', { cur: save.battlePassXp, need: xpNeed })}</span>
            )}
          </div>
          {save.battlePassLevel < MAX_BATTLE_PASS_LEVEL && (
            <div className="bp-xp-bar">
              <div className="bp-xp-fill" style={{ width: `${pct}%` }} />
            </div>
          )}
          {!active && (
            <button className="battle-btn bp-activate-btn" onClick={onActivate} data-ui>
              {t('battlePass.activate')}
            </button>
          )}
          <button className="quest-btn claim bp-claimall-btn" onClick={onClaimAll} data-ui>
            {t('battlePass.claimAll')}
          </button>
        </div>

        <div className="dungeon-body bp-track">
          {BATTLE_PASS_TRACK.map((lvl) => {
            const reached = save.battlePassLevel >= lvl.level;
            const freeClaimed = save.claimedPassRewards.free.includes(lvl.level);
            const premiumClaimed = save.claimedPassRewards.premium.includes(lvl.level);
            return (
              <div className="bp-level-row" key={lvl.level}>
                <span className="bp-level-num">{lvl.level}</span>
                <RewardTile reward={lvl.free} reached={reached} claimed={freeClaimed} locked={false} onClaim={() => onClaim(lvl.level, 'free')} />
                <RewardTile
                  reward={lvl.premium}
                  reached={reached}
                  claimed={premiumClaimed}
                  locked={!active}
                  onClaim={() => onClaim(lvl.level, 'premium')}
                />
              </div>
            );
          })}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
