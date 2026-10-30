import { CSSProperties, useMemo, useState } from 'react';
import { promotionLine } from './promotionLine';
import ActiveBuffs from './ActiveBuffs';
import { FramedSprite, Meter, RarityChip, ZoneUniques } from './HuntParts';
import MaterialIcon from './MaterialIcon';
import { fmtNum, t } from '../locales';
import { computeCP, getHuntProgress, huntPromotionRequiredWins, playerLevel, SaveData } from '../game/engine';
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
  depthGearRequired,
  isDepthUnlocked,
  isZoneOpen,
  recommendedCpForDepth,
} from '../game/huntingZones';
import { estimateHuntYield, HuntYieldEstimate } from '../game/huntEstimate';
import { huntInventoryStatus, hoursUntilInventoryFull } from '../game/huntInventory';
import { getMaterial, MaterialId } from '../game/materials';
import WholesaleLink from './WholesaleLink';
import SubLevelNeed from './SubLevelNeed';
import { equipmentIndex, gearSetFor } from '../game/gearIndex';
import { defaultZone, fmtSpan, matName, startBlockedReason, subLevelNotes, zoneDifficulty, zoneLockedText, zoneState } from '../game/huntView';
import { Button, Chip, ItemFrame, ModalShell, Panel } from './ui';
import type { CardRarity } from './ui';

// the frame colour of a drop: common = plain, refined = blue, noble = purple
const dropTier = (rarity: string | undefined): CardRarity => (rarity === 'rare' ? 'epic' : rarity === 'uncommon' ? 'rare' : 'common');
const zoneName = (zone: HuntingZoneDef): string => t(`dungeon.${zone.nameKey}`);
const monsterName = (zone: HuntingZoneDef): string => t(`enemies.${huntingEnemyNameKey(zone.enemyId)}`);
const zoneBg = (zone: HuntingZoneDef): CSSProperties & Record<'--bg', string> => ({ '--bg': `url(${huntingZoneBackgroundUrl(zone.id)})` });
// The chip of a zone: locked, or how hard it is for this hero (green Pronto / yellow Arriscado / red Muito forte), never 'unlocked' mixed with 'strong enough'.
const chipOf = (locked: boolean, difficulty: ReturnType<typeof zoneDifficulty>): { tone: 'plain' | 'good' | 'gold' | 'bad'; label: string } =>
  locked ? { tone: 'plain', label: t('hunting.stateLocked') } : { tone: difficulty === 'ready' ? 'good' : difficulty === 'risky' ? 'gold' : 'bad', label: t(`hunting.state_${difficulty}`) };

// One of the three depth buttons in a row: the name, and under it either the outlook of this hero there or what the locked depth asks. The recommended CP is advice and sits under the row, for the picked depth.
function DepthOption({ zone, depthId, selected, unlocked, estimate, onPick }: { zone: HuntingZoneDef; depthId: HuntingDepth; selected: boolean; unlocked: boolean; estimate: HuntYieldEstimate | null; onPick: () => void }) {
  const def = HUNTING_DEPTHS.find((d) => d.id === depthId)!;
  const needed = gearSetFor(depthGearRequired(zone, depthId));
  return (
    <button type="button" className={`hs-depth${selected ? ' active' : ''}${unlocked ? '' : ' locked'}`} onClick={onPick} role="radio" aria-checked={selected} data-ui>
      <span className="hs-depth-name">{t(`hunting.${def.nameKey}`)}</span>
      {!unlocked || !estimate ? (
        <span className="hs-depth-lock">{t('hunting.depthLocked', { tier: needed.tier, refine: needed.refine })}</span>
      ) : (
        <span className={`ui-tag ${estimate.outlook === 'always' ? 'good' : estimate.outlook === 'risky' ? 'gold' : 'bad'}`}>{t(`hunting.outlook_${estimate.outlook}`)}</span>
      )}
    </button>
  );
}

// Hunting in three steps, like a phone game should be: pick the place (a column of big cards), pick the depth and start (the monster, three buttons, the start button, what drops), then the hunt itself (HuntRunning).
// Everything the old screen said is still here; what is only reading material waits behind "Mais detalhes".
// `initialZoneId` / `initialDepth` only let a test open the screen on a given choice (the screen itself starts on the deepest startable zone, at the shallow depth).
export default function HuntSelection({
  save,
  onStartHunt,
  onClose,
  initialZoneId,
  initialDepth,
}: {
  save: SaveData;
  onStartHunt: (zoneId: string, depth: HuntingDepth) => void;
  onClose: () => void;
  initialZoneId?: string;
  initialDepth?: HuntingDepth;
}) {
  const playerCp = computeCP(save);
  const gear = equipmentIndex(save); // the depth gate asks equipment, the CP is shown as advice
  const [zoneId, setZoneId] = useState(() => initialZoneId ?? defaultZone(HUNTING_ZONES, save, gear).id);
  const [depthByZone, setDepthByZone] = useState<Record<string, HuntingDepth>>(() => (initialDepth ? { [initialZoneId ?? defaultZone(HUNTING_ZONES, save, gear).id]: initialDepth } : {}));
  // Phones show one pane at a time: the zone list first, then the chosen zone's detail.
  const [step, setStep] = useState<'list' | 'detail'>('list');

  const zone = HUNTING_ZONES.find((z) => z.id === zoneId) ?? HUNTING_ZONES[0];
  const depth = depthByZone[zone.id] ?? DEFAULT_HUNTING_DEPTH;
  const heroLevel = playerLevel(save.xp);
  const zoneOpen = isZoneOpen(zone, save.highestDungeonFloor, heroLevel);
  const enemyArt = huntingEnemyArt(zone.enemyId);

  // Real-engine projection per depth (huntEstimate.ts), memoised there on the hero's stats, the zone and its saved sub-level.
  const estimates = useMemo(() => (zoneOpen ? HUNTING_DEPTHS.map((d) => estimateHuntYield(save, zone.id, d.id)) : []), [save, zone.id, zoneOpen]);

  // The shallow-depth outlook of every open zone (the same memoised projection as the depth buttons), for the chip on each card of the list.
  const shallowOutlooks = useMemo(
    () => Object.fromEntries(HUNTING_ZONES.map((z) => [z.id, isZoneOpen(z, save.highestDungeonFloor, playerLevel(save.xp)) ? estimateHuntYield(save, z.id, 'shallow')?.outlook ?? null : null])),
    [save],
  );

  const progress = getHuntProgress(save, zone.id, depth);
  const required = huntPromotionRequiredWins(progress.ceiling);
  const maxed = progress.ceiling >= T.hunting.subLevels;
  const blocked = startBlockedReason(save, zone, depth, gear);
  // The inventory the hunt would meet: its free space now, and whether this hero's estimated yield would overflow it before the storage cap (an estimate).
  const depthEstimate = estimates[HUNTING_DEPTHS.findIndex((d) => d.id === depth)] ?? null;
  const passActive = ownsAdventurerPass(save);
  const passCapHours = Math.max(zone.offlineCapHours, T.battlePass.capHours);
  const capHours = passActive ? passCapHours : zone.offlineCapHours;
  const inv = huntInventoryStatus(save, zone.id, {});
  const perHour: Partial<Record<MaterialId, number>> = {};
  for (const m of depthEstimate?.materialsPerHour ?? []) perHour[m.material] = m.perHour;
  const headChip = chipOf(!zoneOpen, zoneDifficulty(zone, depth, gear, depthEstimate?.outlook ?? null));
  const overflowIn = zoneOpen && depthEstimate && depthEstimate.outlook !== 'cannot' ? hoursUntilInventoryFull(save, zone.id, {}, perHour, capHours) : null;
  const notes = subLevelNotes(zone, depth, progress.ceiling);
  const invTone = inv.used >= inv.capacity ? ' bad' : inv.used >= inv.capacity * 0.85 ? ' warn' : '';
  const locked = zoneLockedText(zone);

  return (
    <ModalShell
      className={`hs-modal step-${step}`}
      tutorialTarget="hunt-modal"
      icon={<img className="pixel-icon" src="/assets/icons/demon_claw.png" alt="" />}
      title={t('hunting.title')}
      subtitle={t('dungeon.yourCp', { n: fmtNum(playerCp) })}
      closeLabel={t('ui.close')}
      onClose={onClose}
    >
      <div className="hs">
        <ActiveBuffs save={save} skip={['gatherer']} />

        <div className="hs-cols">
          {/* step 1: where to hunt */}
          <div className="hs-zones hs-zone-list" role="list" aria-label={t('hunting.zonesTitle')}>
            {HUNTING_ZONES.map((z) => {
              const zs = zoneState(z, save, gear);
              const rowChip = chipOf(zs === 'locked', zoneDifficulty(z, 'shallow', gear, shallowOutlooks[z.id] ?? null));
              const lockedText = zoneLockedText(z);
              const art = huntingEnemyArt(z.enemyId);
              return (
                <button
                  type="button"
                  key={z.id}
                  className={`hs-zone state-${zs}${z.id === zone.id ? ' selected' : ''}`}
                  style={zoneBg(z)}
                  onClick={() => {
                    setZoneId(z.id);
                    setStep('detail');
                  }}
                  aria-pressed={z.id === zone.id}
                  data-ui
                >
                  <span className="hs-zone-chip">
                    <Chip tone={rowChip.tone}>{rowChip.label}</Chip>
                  </span>
                  <span className="hs-zone-art">
                    <FramedSprite src={huntingEnemySpriteUrl(z.enemyId)} art={art} box="104px" height={0.9 * art.height} row={0} still />
                  </span>
                  <span className="hs-zone-plate">
                    <span className="hs-zone-name">{zoneName(z)}</span>
                    <span className="hs-zone-sub">{zs === 'locked' ? t(lockedText.key, lockedText.vars) : t('hunting.zoneLevels', { a: 1, b: T.hunting.subLevels })}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* step 2: the depth, the start button, what drops there */}
          <div className="hs-detail">
            <Button size="sm" className="hs-back" onClick={() => setStep('list')}>
              &lt; {t('hunting.back')}
            </Button>

            <div className={`hs-banner${zoneOpen ? '' : ' locked'}`} style={zoneBg(zone)}>
              <span className="hs-banner-chip">
                <Chip tone={headChip.tone}>{headChip.label}</Chip>
              </span>
              <div className="hs-banner-monster">
                <FramedSprite src={huntingEnemySpriteUrl(zone.enemyId)} art={enemyArt} box="104px" height={0.9 * enemyArt.height} row={0} still />
              </div>
              <div className="hs-banner-text">
                <span className="hs-banner-zone">{zoneName(zone)}</span>
                <span className="hs-banner-monstername">{zoneOpen ? `${monsterName(zone)} · ${t('hunting.zoneLevels', { a: 1, b: T.hunting.subLevels })}` : t(locked.key, locked.vars)}</span>
              </div>
            </div>

            {zoneOpen && (
              <div className="hs-p-depth">
                <div className="hs-depths" role="radiogroup" aria-label={t('hunting.depthTitle')}>
                  {HUNTING_DEPTHS.map((def, i) => (
                    <DepthOption
                      key={def.id}
                      zone={zone}
                      depthId={def.id}
                      selected={depth === def.id}
                      unlocked={isDepthUnlocked(zone, def.id, gear)}
                      estimate={estimates[i] ?? null}
                      onPick={() => setDepthByZone((prev) => ({ ...prev, [zone.id]: def.id }))}
                    />
                  ))}
                </div>
                <p className="hs-hint">{t('hunting.depthExplain')}</p>
                <p className="hs-cpline">{t('hunting.cpLine', { rec: fmtNum(recommendedCpForDepth(zone, depth)), you: fmtNum(playerCp) })}</p>
              </div>
            )}

            <div className="hs-foot">
              <Button variant="primary" block className="hunt-start" onClick={() => onStartHunt(zone.id, depth)} disabled={!!blocked} data-tutorial-target="hunt-start">
                {blocked ? t(blocked.key, blocked.vars) : t('hunting.start')}
              </Button>
            </div>

            {/* the warnings stay in sight: a nearly full inventory, and the estimate that it fills before the collection limit */}
            {zoneOpen && (invTone || overflowIn !== null) && (
              <div className="hs-warns">
                {invTone && <p className={`hs-fact${invTone}`}>{t('hunting.invFree', { n: inv.used, m: inv.capacity, f: inv.free })}</p>}
                {overflowIn !== null && (
                  <p className="hs-fact bad">
                    {t('hunting.overflowWarning', { t: fmtSpan(Math.max(overflowIn, 1 / 60) * 3600 * 1000), h: capHours })} <WholesaleLink hint />
                  </p>
                )}
              </div>
            )}

            <div className="hs-p-mats">
              <p className="hs-sub">{t('hunting.materialsTitle')}</p>
              <div className="hs-drops">
                {zone.drops.map((d) => {
                  const def = getMaterial(d.material);
                  return (
                    <span className="hs-drop" key={d.material} title={matName(d.material)}>
                      <ItemFrame rarity={dropTier(d.rarity)}>{def && <MaterialIcon item={def} />}</ItemFrame>
                      <span className="hs-drop-name">{matName(d.material)}</span>
                      <RarityChip rarity={d.rarity} />
                    </span>
                  );
                })}
              </div>
              {zone.uniques && zone.uniques.length > 0 && (
                <>
                  <p className="hs-sub">{t('hunting.uniquesTitle')}</p>
                  <ZoneUniques itemIds={zone.uniques.map((u) => u.itemId)} />
                </>
              )}
            </div>

            {zoneOpen && (
              <details className="hs-more">
                <summary>{t('hunting.moreDetails')}</summary>
                <Panel title={t('hunting.subLevelBar', { n: progress.ceiling, m: T.hunting.subLevels })} className="hs-p-sub">
                  <Meter pct={maxed ? 100 : (Math.min(progress.promotionWins, required) / required) * 100} tone="xp" label={t('hunting.subLevelBar', { n: progress.ceiling, m: T.hunting.subLevels })} />
                  <p className="hs-meter-text">{maxed ? t('hunting.subLevelMax') : promotionLine(progress.promotionWins, required, progress.ceiling)}</p>
                  <p className="hs-hint">{t('hunting.subLevelExplain')}</p>
                  {notes.xpPct > 0 && <p className="hs-hint">{t('hunting.subLevelXp', { n: notes.xpPct })}</p>}
                  {!maxed && notes.nextGear > 0 && <SubLevelNeed required={notes.nextGear} />}
                </Panel>
                <Panel tone="inset" className="hs-facts">
                  <p className="hs-fact">
                    {passActive
                      ? t('hunting.capLineActive', { n: passCapHours })
                      : zone.offlineCapHours < passCapHours
                        ? t('hunting.capLinePass', { n: zone.offlineCapHours, p: passCapHours })
                        : t('hunting.capLine', { n: zone.offlineCapHours })}
                  </p>
                  {!invTone && <p className="hs-fact">{t('hunting.invFree', { n: inv.used, m: inv.capacity, f: inv.free })}</p>}
                  <p className="hs-hint">{t('hunting.xpKillExplain')}</p>
                  <p className="hs-hint">{t('hunting.invExplain')}</p>
                </Panel>
              </details>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
