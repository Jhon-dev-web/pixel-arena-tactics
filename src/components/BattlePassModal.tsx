import { ReactNode } from 'react';
import { t } from '../locales';
import Assets from '../assets.json';
import { battlePassXpForLevel, MAX_BATTLE_PASS_LEVEL, SaveData } from '../game/engine';
import { ADVENTURER_PASS_TESTABLE, ownsAdventurerPass } from '../game/entitlements';
import { BATTLE_PASS_TRACK, BattlePassReward } from '../game/battlepass';
import { MATERIALS } from '../game/materials';
import { getConsumable } from '../game/consumables';
import { getGem } from '../game/gems';
import { getTitleDef } from '../game/titles';
import { getGear } from '../game/gear';
import { getFrameDef } from '../game/seasonItems';
import T from '../game/tunables';
import MaterialIcon from './MaterialIcon';
import ConsumableIcon from './ConsumableIcon';
import GemIcon from './GemIcon';
import TitleIcon from './TitleIcon';

function rewardIcon(reward: BattlePassReward): ReactNode {
  switch (reward.kind) {
    case 'gold':
      return <img className="inline-icon" src={Assets.icons.gold.url} alt="" />;
    case 'shards':
      return <img className="inline-icon" src="/assets/icons/shards.png" alt="" />;
    case 'material': {
      const def = MATERIALS.find((m) => m.id === reward.id);
      return def ? <MaterialIcon item={def} className="inline-icon" /> : '📦';
    }
    case 'consumable': {
      const def = getConsumable(reward.id ?? '');
      return def ? <ConsumableIcon item={def} className="inline-icon" /> : '🧪';
    }
    case 'gem': {
      const def = getGem(reward.id ?? '');
      return def ? <GemIcon item={def} className="inline-icon" /> : '💎';
    }
    case 'cosmetic': {
      const title = reward.id ? getTitleDef(reward.id) : undefined;
      return title ? <TitleIcon src={title.iconUrl} fallback="🎖️" className="inline-icon" /> : '🎖️';
    }
    case 'relic': {
      const gear = getGear(reward.id ?? '');
      return gear?.icon ? <img className="inline-icon" src={gear.icon} alt="" /> : '❔';
    }
    default:
      return '❔';
  }
}

function rewardLabel(reward: BattlePassReward): string {
  switch (reward.kind) {
    case 'gold':
      return `+${reward.amount}`;
    case 'shards':
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
    case 'cosmetic': {
      const title = reward.id ? getTitleDef(reward.id) : undefined;
      const frame = reward.id ? getFrameDef(reward.id) : undefined;
      return title ? t(`titles.${title.nameKey}`) : frame ? t(`titles.${frame.nameKey}`) : t('battlePass.cosmeticReward');
    }
    case 'relic':
      return t(`gear.${getGear(reward.id ?? '')?.nameKey ?? ''}`);
    default:
      return '';
  }
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
  onDismissSummary,
  onClaim,
  onClaimAll,
  onClose,
}: {
  save: SaveData;
  onActivate: () => void;
  onDismissSummary: () => void;
  onClaim: (level: number, track: 'free' | 'premium') => void;
  onClaimAll: () => void;
  onClose: () => void;
}) {
  const active = ownsAdventurerPass(save);
  const xpNeed = battlePassXpForLevel(save.battlePassLevel);
  const pct = save.battlePassLevel >= MAX_BATTLE_PASS_LEVEL ? 100 : Math.min(100, (save.battlePassXp / xpNeed) * 100);

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal bp-modal">
        <h2 className="modal-title">
          <img className="inline-icon" src="/assets/icons/nav_battlepass.png" alt="" /> {t('battlePass.title')}
        </h2>

        {save.pendingSeasonSummary && (
          <div className="bp-status-card" role="status">
            <span className="bp-status-label active">{t('battlePass.seasonDelivered', { n: save.pendingSeasonSummary.season })}</span>
            <span className="bp-xp-text">{t('battlePass.seasonDeliveredHint')}</span>
            <button className="quest-btn claim" onClick={onDismissSummary} data-ui>
              {t('battlePass.seasonOk')}
            </button>
          </div>
        )}

        <div className="bp-status-card">
          <span className={`bp-status-label${active ? ' active' : ''}`}>
            {active ? t('battlePass.statusActive') : t('battlePass.statusFree')}
          </span>
          <div className="bp-perks">
            <span className="bp-perk">{t('battlePass.perkStorage', { n: T.battlePass.capHours })}</span>
            <span className="bp-perk">{t('battlePass.perkLuck', { n: Math.round((T.battlePass.dropRateMultiplier - 1) * 100) })}</span>
            <span className="bp-perk">{t('battlePass.perkDeliveries', { n: Math.round(T.deliveries.passXpBonus * 100) })}</span>
            <span className="bp-perk">{t('battlePass.perkBag', { n: T.battlePass.bagBonusSlots })}</span>
            <span className="bp-perk">{t('battlePass.perkRepair', { n: Math.round(T.battlePass.repairDiscount * 100) })}</span>
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
            <button className="battle-btn bp-activate-btn" onClick={onActivate} disabled={!ADVENTURER_PASS_TESTABLE} data-ui>
              {ADVENTURER_PASS_TESTABLE ? t('battlePass.activateTest') : t('battlePass.comingSoon')}
            </button>
          )}
          <button className="quest-btn claim bp-claimall-btn" onClick={onClaimAll} data-ui>
            {t('battlePass.claimAll')}
          </button>
        </div>

        <div className="bp-columns" aria-hidden="true">
          <span />
          <span>{t('battlePass.colFree')}</span>
          <span>{t('battlePass.colPremium')}</span>
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
