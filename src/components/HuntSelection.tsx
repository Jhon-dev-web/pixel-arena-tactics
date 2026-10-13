import { CSSProperties, useMemo, useState } from 'react';
import { promotionLine } from './promotionLine';
import ActiveBuffs from './ActiveBuffs';
import { FramedSprite, MatIcon, Meter, MonsterPortrait, RarityChip, ZoneUniques } from './HuntParts';
import { fmtNum, t } from '../locales';
import { computeCP, getHuntProgress, huntPromotionRequiredWins, SaveData } from '../game/engine';
import { ownsAdventurerPass } from '../game/entitlements';
import T from '../game/tunables';
import {
  DEFAULT_HUNTING_DEPTH,
  HUNTING_DEPTHS,
  HUNTING_ZONES,
  HuntingDepth,
  HuntingZoneDef,
  huntingEnemyArt,
  huntingEnemyNameKey,
  huntingEnemySpriteUrl,
  huntingZoneBackgroundUrl,
  isDepthUnlocked,
  isZoneUnlocked,
  recommendedCpForDepth,
} from '../game/huntingZones';
import { estimateHuntYield, HuntYieldEstimate } from '../game/huntEstimate';
import { huntInventoryStatus, hoursUntilInventoryFull } from '../game/huntInventory';
import { MaterialId } from '../game/materials';
import WholesaleLink from './WholesaleLink';
import { defaultZone, depthsOpen, fmtRate, fmtSpan, matName, startBlockedReason, zoneState, ZoneState } from '../game/huntView';

const zoneName = (zone: HuntingZoneDef): string => t(`dungeon.${zone.nameKey}`);
const monsterName = (zone: HuntingZoneDef): string => t(`enemies.${huntingEnemyNameKey(zone.enemyId)}`);
const stateLabel = (s: ZoneState): string => t(`hunting.state${s === 'ok' ? 'Ok' : s === 'hard' ? 'Hard' : 'Locked'}`);

function DepthOption({
  zone,
  depthId,
  selected,
  unlocked,
  estimate,
  onPick,
}: {
  zone: HuntingZoneDef;
  depthId: HuntingDepth;
  selected: boolean;
  unlocked: boolean;
  estimate: HuntYieldEstimate | null;
  onPick: () => void;
}) {
  const def = HUNTING_DEPTHS.find((d) => d.id === depthId)!;
  const recommended = recommendedCpForDepth(zone, depthId);
  return (
    <button
      type="button"
      className={`hunt-depth-opt${selected ? ' active' : ''}${unlocked ? '' : ' locked'}`}
      onClick={onPick}
      role="radio"
      aria-checked={selected}
      data-ui
    >
      <span className="hunt-depth-opt-head">
        <span className="hunt-depth-opt-name">{t(`hunting.${def.nameKey}`)}</span>
        <span className="hunt-depth-opt-cp">{t('dungeon.cp', { n: fmtNum(recommended) })}</span>
      </span>
      {!unlocked || !estimate ? (
        <span className="hunt-depth-opt-lock">{t('hunting.depthLocked', { n: fmtNum(recommended) })}</span>
      ) : (
        <>
          <span className="hunt-outlook-row">
            <span className={`hunt-outlook ${estimate.outlook}`}>{t(`hunting.outlook_${estimate.outlook}`)}</span>
            <span className="hunt-outlook-level">{t('hunting.estimateLevel', { n: estimate.subLevel })}</span>
          </span>
          <span className="hunt-depth-stats">
            <span className="hunt-stat-row">
              <span className="hunt-stat-label">{t('hunting.killsPerHour')}</span>
              <span className="hunt-stat-value">{fmtRate(estimate.killsPerHour)}</span>
            </span>
            {zone.drops.map((d, i) => (
              <span className="hunt-stat-row" key={d.material}>
                <span className="hunt-stat-label">
                  <MatIcon id={d.material} />
                  <RarityChip rarity={d.rarity} />
                </span>
                <span className="hunt-stat-value" title={matName(d.material)}>
                  {t('hunting.perHour', { n: fmtRate(estimate.materialsPerHour[i].perHour) })}
                </span>
              </span>
            ))}
            <span className="hunt-stat-row">
              <span className="hunt-stat-label">{t('hunting.xpPerHour')}</span>
              <span className="hunt-stat-value">{fmtRate(estimate.xpPerHour)}</span>
            </span>
            <span className="hunt-stat-row">
              <span className="hunt-stat-label">{t('hunting.goldPerHour')}</span>
              <span className="hunt-stat-value">{fmtRate(estimate.goldPerHour)}</span>
            </span>
          </span>
        </>
      )}
    </button>
  );
}

export default function HuntSelection({
  save,
  onStartHunt,
  onClose,
}: {
  save: SaveData;
  onStartHunt: (zoneId: string, depth: HuntingDepth) => void;
  onClose: () => void;
}) {
  const playerCp = computeCP(save);
  const [zoneId, setZoneId] = useState(() => defaultZone(HUNTING_ZONES, save, playerCp).id);
  const [depthByZone, setDepthByZone] = useState<Record<string, HuntingDepth>>({});
  // Phones show one pane at a time: the zone list first, then the chosen zone's detail.
  const [step, setStep] = useState<'list' | 'detail'>('list');

  const zone = HUNTING_ZONES.find((z) => z.id === zoneId) ?? HUNTING_ZONES[0];
  const depth = depthByZone[zone.id] ?? DEFAULT_HUNTING_DEPTH;
  const state = zoneState(zone, save, playerCp);
  const zoneOpen = isZoneUnlocked(zone, save.highestDungeonFloor);
  // where you are going: the zone's own map strip behind the monster
  const headStyle: CSSProperties & Record<'--bg', string> = { '--bg': `url(${huntingZoneBackgroundUrl(zone.id)})` };
  const enemyArt = huntingEnemyArt(zone.enemyId);

  // Real-engine projection per depth (huntEstimate.ts), memoised there on the hero's stats, the zone and its saved sub-level.
  const estimates = useMemo(() => (zoneOpen ? HUNTING_DEPTHS.map((d) => estimateHuntYield(save, zone.id, d.id)) : []), [save, zone.id, zoneOpen]);

  const progress = getHuntProgress(save, zone.id, depth);
  const required = huntPromotionRequiredWins(progress.ceiling);
  const maxed = progress.ceiling >= T.hunting.subLevels;
  const blocked = startBlockedReason(save, zone, depth, playerCp);
  // The inventory the hunt would meet: its free space now, and whether this hero's estimated yield would overflow it before the storage cap (an estimate).
  const depthEstimate = estimates[HUNTING_DEPTHS.findIndex((d) => d.id === depth)] ?? null;
  const passActive = ownsAdventurerPass(save);
  const passCapHours = Math.max(zone.offlineCapHours, T.battlePass.capHours);
  const capHours = passActive ? passCapHours : zone.offlineCapHours;
  const inv = huntInventoryStatus(save, zone.id, {});
  const perHour: Partial<Record<MaterialId, number>> = {};
  for (const m of depthEstimate?.materialsPerHour ?? []) perHour[m.material] = m.perHour;
  const overflowIn = zoneOpen && depthEstimate && depthEstimate.outlook !== 'cannot' ? hoursUntilInventoryFull(save, zone.id, {}, perHour, capHours) : null;

  return (
    <div className="modal-backdrop">
      <div className={`modal dungeon-modal hunt-modal hunt-screen step-${step}`} data-tutorial-target="hunt-modal">
        <h2 className="modal-title">{t('hunting.title')}</h2>
        <ActiveBuffs save={save} skip={['gatherer']} />

        <div className="hunt-sel">
          <div className="hunt-zonelist">
            <div className="hunt-zonelist-head">
              <h3 className="hunt-section-title">{t('hunting.zonesTitle')}</h3>
              <span className="hunt-yourcp">{t('dungeon.yourCp', { n: fmtNum(playerCp) })}</span>
            </div>
            {HUNTING_ZONES.map((z) => {
              const zs = zoneState(z, save, playerCp);
              return (
                <button
                  type="button"
                  key={z.id}
                  className={`hunt-zone-row state-${zs}${z.id === zone.id ? ' selected' : ''}`}
                  onClick={() => {
                    setZoneId(z.id);
                    setStep('detail');
                  }}
                  aria-pressed={z.id === zone.id}
                  data-ui
                >
                  <MonsterPortrait enemyId={z.enemyId} box="52px" />
                  <span className="hunt-zone-info">
                    <span className="hunt-zone-name">{zoneName(z)}</span>
                    {zs === 'locked' ? (
                      <span className="hunt-zone-sub">{t('dungeon.unlocksAt', { n: z.unlockFloor })}</span>
                    ) : (
                      <>
                        <span className="hunt-zone-sub">{t('dungeon.cp', { n: fmtNum(z.cp) })}</span>
                        <span className="hunt-zone-sub">{t('hunting.depthsOpen', { n: depthsOpen(z, playerCp), m: HUNTING_DEPTHS.length })}</span>
                      </>
                    )}
                    <span className={`hunt-state-chip ${zs}`}>{stateLabel(zs)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hunt-detail">
            <button type="button" className="hunt-back" onClick={() => setStep('list')} data-ui>
              &lt; {t('hunting.back')}
            </button>

            <div className={`hunt-detail-head${zoneOpen ? '' : ' locked'}`} style={headStyle}>
              <div className="hunt-detail-monster">
                <FramedSprite src={huntingEnemySpriteUrl(zone.enemyId)} art={enemyArt} box="120px" height={0.9 * enemyArt.height} row={0} still />
              </div>
              <div className="hunt-detail-title">
                <span className="hunt-monster-name">{monsterName(zone)}</span>
                <span className="hunt-zone-title">{zoneName(zone)}</span>
                <span className="hunt-detail-cp">
                  {zoneOpen ? t('hunting.cpLine', { rec: fmtNum(zone.cp), you: fmtNum(playerCp) }) : t('dungeon.unlocksAt', { n: zone.unlockFloor })}
                  <span className={`hunt-state-chip ${state}`}>{stateLabel(state)}</span>
                </span>
              </div>
            </div>

            <section className="hunt-block">
              <h4 className="hunt-section-title">{t('hunting.materialsTitle')}</h4>
              <div className="hunt-mats">
                {zone.drops.map((d) => (
                  <span className="hunt-mat" key={d.material}>
                    <MatIcon id={d.material} />
                    <span className="hunt-mat-name">{matName(d.material)}</span>
                    <RarityChip rarity={d.rarity} />
                  </span>
                ))}
              </div>
              {zone.uniques && zone.uniques.length > 0 && (
                <>
                  <h4 className="hunt-section-title sub">{t('hunting.uniquesTitle')}</h4>
                  <ZoneUniques itemIds={zone.uniques.map((u) => u.itemId)} />
                </>
              )}
            </section>

            {zoneOpen && (
              <>
                <section className="hunt-block">
                  <h4 className="hunt-section-title">{t('hunting.depthTitle')}</h4>
                  <p className="hunt-hint">{t('hunting.depthExplain')}</p>
                  <div className="hunt-depths" role="radiogroup" aria-label={t('hunting.depthTitle')}>
                    {HUNTING_DEPTHS.map((def, i) => (
                      <DepthOption
                        key={def.id}
                        zone={zone}
                        depthId={def.id}
                        selected={depth === def.id}
                        unlocked={isDepthUnlocked(zone, def.id, playerCp)}
                        estimate={estimates[i] ?? null}
                        onPick={() => setDepthByZone((prev) => ({ ...prev, [zone.id]: def.id }))}
                      />
                    ))}
                  </div>
                  <p className="hunt-hint est">{t('hunting.estimateNote')}</p>
                </section>

                <section className="hunt-block">
                  <h4 className="hunt-section-title">{t('hunting.subLevelBar', { n: progress.ceiling, m: T.hunting.subLevels })}</h4>
                  <Meter pct={maxed ? 100 : (Math.min(progress.promotionWins, required) / required) * 100} tone="xp" label={t('hunting.subLevelBar', { n: progress.ceiling, m: T.hunting.subLevels })} />
                  <div className="hunt-meter-text">
                    {maxed ? t('hunting.subLevelMax') : promotionLine(progress.promotionWins, required, progress.ceiling)}
                  </div>
                  <p className="hunt-hint">{t('hunting.subLevelExplain')}</p>
                </section>

                <section className="hunt-block facts">
                  <div className="hunt-fact">
                    {passActive
                      ? t('hunting.capLineActive', { n: passCapHours })
                      : zone.offlineCapHours < passCapHours
                        ? t('hunting.capLinePass', { n: zone.offlineCapHours, p: passCapHours })
                        : t('hunting.capLine', { n: zone.offlineCapHours })}
                  </div>
                  <div className={`hunt-fact${inv.used >= inv.capacity ? ' bad' : inv.used >= inv.capacity * 0.85 ? ' warn' : ''}`}>{t('hunting.invFree', { n: inv.used, m: inv.capacity, f: inv.free })}</div>
                  {overflowIn !== null && (
                    <p className="hunt-hint bad">
                      {t('hunting.overflowWarning', { t: fmtSpan(Math.max(overflowIn, 1 / 60) * 3600 * 1000), h: capHours })} <WholesaleLink hint />
                    </p>
                  )}
                  <p className="hunt-hint">{t('hunting.invExplain')}</p>
                </section>
              </>
            )}

            <div className="hunt-detail-foot">
              <button className="battle-btn hunt-start" onClick={() => onStartHunt(zone.id, depth)} disabled={!!blocked} data-tutorial-target="hunt-start" data-ui>
                {blocked ? t(blocked.key, blocked.vars) : t('hunting.start')}
              </button>
            </div>
          </div>
        </div>

        <button className="modal-x" onClick={onClose} aria-label={t('ui.close')} data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
