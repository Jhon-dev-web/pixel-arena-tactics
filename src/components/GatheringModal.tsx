import { useEffect, useState } from 'react';
import { fmtDec, fmtNum, t } from '../locales';
import { buffRemainingMs, isBuffActive } from '../game/buffs';
import { computeMiningStatus, computeWoodcuttingStatus, SaveData } from '../game/engine';
import { MaterialId, materialIconUrl } from '../game/materials';
import { addWithOverflow } from '../game/inventory';
import { ORE_TIERS } from '../game/ores';
import { BASE_GATHER_POWER, gatherPower, skillLevel, skillXpForNextLevel, skillXpToReachLevel } from '../game/skills';
import { ownsAdventurerPass } from '../game/entitlements';
import T from '../game/tunables';
import { WOOD_TIERS } from '../game/woodcutting';
import SkillLevelBadge from './SkillLevelBadge';
import UnlockList from './UnlockList';

// Mining and Woodcutting are the same screen over two data sets (ores / woods, mining / woodcutting skill and session fields): a profession header with
// the level, XP and the rate per hour, the running session (time since start, what has piled up, the primary "collect" action) and every tier with its
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
  const ratePerHour = gatherPower(BASE_GATHER_POWER, xp) * (mining ? T.mining.oreRatePerPower : T.woodcutting.woodRatePerPower) * (passActive ? T.battlePass.dropRateMultiplier : 1);
  const xpPerHour = ratePerHour * T.skills.xpPerUnit;
  const hoursToNext = xpPerHour > 0 ? (skillXpForNextLevel(level, kind) - (xp - skillXpToReachLevel(level, kind))) / xpPerHour : Infinity;
  const progress = status.capMs <= 0 ? 0 : Math.max(0, Math.min(1, status.pendingMs / status.capMs));
  const hunting = !!save.activeHuntingZone;
  const otherBusy = mining ? !!save.activeWoodId : !!save.activeOreId;
  const blocked = hunting || otherBusy;
  const blockedMsg = hunting ? t('hunting.busyOther') : t(mining ? 'woodcutting.busyOther' : 'mining.busyOther');
  // what the inventory would have no room for if the session were collected now (gathering leaves the excess behind)
  const leftNow = activeId ? (addWithOverflow(save, { materials: { [activeId]: units } }).leftover.materials[activeId as MaterialId] ?? 0) : 0;
  const brew = isBuffActive(save, 'gatherer', now);
  const capHours = status.capMs / MS_H;

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal gather-modal" data-tutorial-target={`${ns}-modal`}>
        <h2 className="modal-title">
          {t(`${ns}.title`)}
        </h2>

        <SkillLevelBadge xp={xp} labelKey={`${ns}.skillLabel`} skillId={kind}>
          <span className="skill-level-meta">{t('gathering.rate', { n: fmtNum(Math.round(ratePerHour * 10) / 10), xp: fmtNum(Math.round(xpPerHour * 10) / 10) })}</span>
          {Number.isFinite(hoursToNext) && level < T.skills.maxLevel && <span className="skill-level-meta">{t('gathering.nextLevelIn', { t: formatDuration(hoursToNext * MS_H) })}</span>}
          <span className="skill-level-meta">{t('gathering.storage', { n: fmtHours(capHours) })}{passActive ? ` · ${t('gathering.passBonus', { n: Math.round((T.battlePass.dropRateMultiplier - 1) * 100) })}` : ''}</span>
          {activeId && passNow && !status.passCoversSession && <span className="skill-level-meta">{t('gathering.passNextSession')}</span>}
          {brew && <span className="skill-level-meta gather-brew">{t('gathering.brew', { t: formatDuration(buffRemainingMs(save, now, 'gatherer')) })}</span>}
        </SkillLevelBadge>

        <div className="dungeon-body gather-tiers">
          {activeId && (
            <div className="gather-session">
              <div className="gather-session-head">
                <span>{t('gathering.running')}</span>
                <span>{t('gathering.since', { t: formatDuration(Math.max(0, now - startedAt)) })}</span>
              </div>
              <div className="camp-mine-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t(`${ns}.title`)}>
                <div className={`camp-mine-fill${status.full ? ' full' : ''}`} style={{ width: `${progress * 100}%` }} />
              </div>
              <span className="camp-mine-time">
                {status.full ? t(`${ns}.full`) : t('gathering.storageFill', { cur: fmtHours(status.pendingMs / MS_H), cap: fmtHours(capHours) })}
              </span>
              <span className="gather-session-ready">
                <img className="inline-icon" src={materialIconUrl(activeId as MaterialId)} alt="" /> +{fmtNum(units)} · +{fmtNum(units * T.skills.xpPerUnit)} XP
              </span>
              {leftNow > 0 && <span className="craft-bag-full">{t('inventory.leftBehindPreview', { n: fmtNum(leftNow) })}</span>}
              <button className={`camp-mine-claim${units > 0 ? ' blink' : ''}`} onClick={onClaim} disabled={units <= 0} data-ui>
                {t(`${ns}.collect`)}
              </button>
              <button className={`camp-expedition-cancel${confirmCancel ? ' armed' : ''}`} onClick={() => (confirmCancel ? (setConfirmCancel(false), onCancel()) : setConfirmCancel(true))} data-ui>
                {confirmCancel ? t('gathering.cancelConfirm') : t('expedition.cancel')}
              </button>
            </div>
          )}

          {tiers.map((tier) => {
            const unlocked = level >= tier.requiredLevel;
            const isActive = activeId === tier.id;
            const name = t(mining ? `ore.${tier.nameKey}` : `wood.${tier.nameKey}`);
            return (
              <div className={`floor-card${unlocked ? '' : ' locked'}${isActive ? ' equipped' : ''}`} key={tier.id}>
                <div className="floor-header">
                  <span className="floor-name">
                    <span className="mat-icon">
                      <img src={materialIconUrl(tier.id)} alt="" />
                    </span>{' '}
                    {name}
                  </span>
                  <span className="floor-cp">{t(`${ns}.levelReq`, { n: tier.requiredLevel })}</span>
                </div>
                {unlocked ? (
                  isActive ? (
                    <span className="gather-tier-state">{t('gathering.activeTier')}</span>
                  ) : (
                    <>
                      <button className="battle-btn" onClick={() => onStart(tier.id)} disabled={blocked} title={blocked ? blockedMsg : undefined} data-ui>
                        {activeId ? t('gathering.switch') : t(`${ns}.available`)}
                      </button>
                      {blocked && <span className="floor-locked">{blockedMsg}</span>}
                    </>
                  )
                ) : (
                  <span className="floor-locked">
                    {t(`${ns}.locked`, { n: tier.requiredLevel })} · {t('gathering.levelsToGo', { n: tier.requiredLevel - level })}
                  </span>
                )}
              </div>
            );
          })}
          {activeId && <span className="gather-switch-hint">{t('gathering.switchHint')}</span>}
          <UnlockList skill={kind} level={level} />
        </div>

        <button className="modal-x" onClick={onClose} aria-label={t('ui.close')} data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
