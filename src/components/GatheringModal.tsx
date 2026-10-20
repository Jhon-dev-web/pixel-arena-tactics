import { useEffect, useState } from 'react';
import { useConfirmKeys } from '../hooks/useConfirmKeys';
import { fmtDec, fmtNum, t } from '../locales';
import WholesaleLink from './WholesaleLink';
import { buffRemainingMs, isBuffActive } from '../game/buffs';
import { computeMiningStatus, computeWoodcuttingStatus, SaveData } from '../game/engine';
import { MaterialId, materialIconUrl } from '../game/materials';
import { addWithOverflow } from '../game/inventory';
import { ORE_TIERS } from '../game/ores';
import { skillLevel } from '../game/skills';
import { ownsAdventurerPass } from '../game/entitlements';
import T from '../game/tunables';
import { WOOD_TIERS } from '../game/woodcutting';
import SkillLevelBadge from './SkillLevelBadge';
import UnlockList from './UnlockList';
import { Button, Chip, ItemCard, ModalShell, Panel, ScreenLayout } from './ui';
import type { CardRarity } from './ui';
import { Meter } from './HuntParts';

// Mining and Woodcutting are the same screen over two data sets (ores / woods, mining / woodcutting skill and session fields): a profession header with
// the level, XP, the running session (time since start, what has piled up, the primary "collect" action) and every tier with its
// unlock level. The per-tier cards keep the game's floor-card look.

export type GatherKind = 'mining' | 'woodcutting';

const MS_H = 3600 * 1000;

function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

const fmtHours = (h: number): string => (h >= 10 ? fmtDec(h, 0) : fmtDec(h, 1, true));

export default function GatheringModal({
  kind,
  save,
  onStart,
  onClaim,
  onCancel,
  onClose,
}: {
  kind: GatherKind;
  save: SaveData;
  onStart: (tierId: string) => void;
  onClaim: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // "Cancel" throws the accrued material away: it needs a second tap, and the arm wears off by itself.
  useEffect(() => {
    if (!confirmCancel) return;
    const id = window.setTimeout(() => setConfirmCancel(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmCancel]);

  useConfirmKeys(
    confirmCancel,
    () => {
      setConfirmCancel(false);
      onCancel();
    },
    () => setConfirmCancel(false),
  );

  const mining = kind === 'mining';
  const ns = mining ? 'mining' : 'woodcutting';
  const tiers = mining ? ORE_TIERS : WOOD_TIERS;
  const xp = save.skillXp[kind];
  const level = skillLevel(xp, kind);
  const activeId = mining ? save.activeOreId : save.activeWoodId;
  const startedAt = mining ? save.lastMiningClaim : save.lastWoodcuttingClaim;
  const status = mining ? computeMiningStatus(save, now) : computeWoodcuttingStatus(save, now);
  const units = mining ? (status as ReturnType<typeof computeMiningStatus>).oreReady : (status as ReturnType<typeof computeWoodcuttingStatus>).woodReady;
  const passNow = ownsAdventurerPass(save);
  // A running session keeps the Pass it started with (cap and yield); the Pass bought mid-session only applies from the next one.
  const passActive = activeId ? status.passCoversSession : passNow;
  const progress = status.capMs <= 0 ? 0 : Math.max(0, Math.min(1, status.pendingMs / status.capMs));
  const hunting = !!save.activeHuntingZone;
  const otherBusy = mining ? !!save.activeWoodId : !!save.activeOreId;
  const blocked = hunting || otherBusy;
  const blockedMsg = hunting ? t('hunting.busyOther') : t(mining ? 'woodcutting.busyOther' : 'mining.busyOther');
  // what the inventory would have no room for if the session were collected now (gathering leaves the excess behind)
  const leftNow = activeId ? (addWithOverflow(save, { materials: { [activeId]: units } }).leftover.materials[activeId as MaterialId] ?? 0) : 0;
  const brew = isBuffActive(save, 'gatherer', now);
  const capHours = status.capMs / MS_H;

  const TIER_RARITY: CardRarity[] = ['common', 'common', 'rare', 'epic', 'legendary'];
  const iconOf = (mid: string) => <img className="pixel-icon" src={materialIconUrl(mid as MaterialId)} alt="" draggable={false} />;

  const summary = (
    <>
      <Panel>
        <SkillLevelBadge xp={xp} labelKey={`${ns}.skillLabel`} skillId={kind}>
          <p className="pf-meta">
            {t('gathering.storage', { n: fmtHours(capHours) })}
            {passActive ? ` · ${t('gathering.passBonus', { n: Math.round((T.battlePass.dropRateMultiplier - 1) * 100) })}` : ''}
          </p>
          {activeId && passNow && !status.passCoversSession && <p className="pf-meta">{t('gathering.passNextSession')}</p>}
          {brew && <p className="pf-meta gold">{t('gathering.brew', { t: formatDuration(buffRemainingMs(save, now, 'gatherer')) })}</p>}
        </SkillLevelBadge>
      </Panel>
      {activeId && (
        <Panel tone="gold" title={t('gathering.running')} icon={iconOf(activeId)} actions={<Chip>{t('gathering.since', { t: formatDuration(Math.max(0, now - startedAt)) })}</Chip>}>
          <Meter pct={progress * 100} tone={status.full ? 'full' : undefined} label={t(`${ns}.title`)} />
          <p className="pf-line">{status.full ? t(`${ns}.full`) : t('gathering.storageFill', { cur: fmtHours(status.pendingMs / MS_H), cap: fmtHours(capHours) })}</p>
          <p className="pf-ready">
            <img className="inline-icon" src={materialIconUrl(activeId as MaterialId)} alt="" /> +{fmtNum(units)} · +{fmtNum(units * T.skills.xpPerUnit)} XP
          </p>
          {leftNow > 0 && (
            <p className="ui-alert bad">
              {t('inventory.leftBehindPreview', { n: fmtNum(leftNow) })} <WholesaleLink />
            </p>
          )}
          <div className="pf-actions">
            <Button variant="primary" className={units > 0 ? 'pf-blink' : ''} onClick={onClaim} disabled={units <= 0}>
              {t(`${ns}.collect`)}
            </Button>
            <Button variant="danger" onClick={() => (confirmCancel ? (setConfirmCancel(false), onCancel()) : setConfirmCancel(true))}>
              {confirmCancel ? t('gathering.cancelConfirm') : t('expedition.cancel')}
            </Button>
          </div>
        </Panel>
      )}

    </>
  );

  const main = (
    <>
      <Panel title={t(`${ns}.title`)}>
        <div className="ui-grid pf-tiers">
          {tiers.map((tier, ti) => {
            const unlocked = level >= tier.requiredLevel;
            const isActive = activeId === tier.id;
            const name = t(mining ? `ore.${tier.nameKey}` : `wood.${tier.nameKey}`);
            return (
              <ItemCard
                key={tier.id}
                className={`pf-tier${unlocked ? '' : ' locked'}`}
                icon={iconOf(tier.id)}
                rarity={TIER_RARITY[Math.min(ti, TIER_RARITY.length - 1)]}
                name={name}
                tag={<Chip tone={isActive ? 'good' : unlocked ? 'gold' : 'plain'}>{isActive ? t('gathering.activeTier') : t(`${ns}.levelReq`, { n: tier.requiredLevel })}</Chip>}
                selected={isActive}
                action={
                  unlocked && !isActive ? (
                    <Button block onClick={() => onStart(tier.id)} disabled={blocked} title={blocked ? blockedMsg : undefined}>
                      {activeId ? t('gathering.switch') : t(`${ns}.available`)}
                    </Button>
                  ) : undefined
                }
              >
                {unlocked ? (
                  !isActive && blocked && <p className="ui-note">{blockedMsg}</p>
                ) : (
                  <p className="ui-note">
                    {t(`${ns}.locked`, { n: tier.requiredLevel })} · {t('gathering.levelsToGo', { n: tier.requiredLevel - level })}
                  </p>
                )}
              </ItemCard>
            );
          })}
        </div>
        {activeId && <p className="ui-note pf-switch">{t('gathering.switchHint')}</p>}
      </Panel>
      <UnlockList skill={kind} level={level} />
    </>
  );

  return (
    <ModalShell
      className="pf-modal"
      tutorialTarget={`${ns}-modal`}
      icon={<img className="pixel-icon" src={mining ? '/assets/icons/nav_mining.png' : '/assets/icons/oak_wood.png'} alt="" />}
      title={t(`${ns}.title`)}
      subtitle={t('skills.level', { n: level })}
      closeLabel={t('ui.close')}
      onClose={onClose}
    >
      <div className="ui-cq">
        <ScreenLayout main={main} side={summary} sideFirst className="pf-layout" />
      </div>
    </ModalShell>
  );
}
