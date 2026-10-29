import { CSSProperties, useMemo, useState } from 'react';
import { promotionLine } from './promotionLine';
import ActiveBuffs from './ActiveBuffs';
import { FramedSprite, MatIcon, Meter, MonsterPortrait, RarityChip, ZoneUniques } from './HuntParts';
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
import { MaterialId } from '../game/materials';
import WholesaleLink from './WholesaleLink';
import SubLevelNeed from './SubLevelNeed';
import { equipmentIndex, gearSetFor } from '../game/gearIndex';
import { defaultZone, depthsOpen, fmtSpan, matName, startBlockedReason, subLevelNotes, zoneDifficulty, zoneLockedText, zoneState } from '../game/huntView';
import { Button, Chip, ModalShell, Panel } from './ui';

const zoneName = (zone: HuntingZoneDef): string => t(`dungeon.${zone.nameKey}`);
const monsterName = (zone: HuntingZoneDef): string => t(`enemies.${huntingEnemyNameKey(zone.enemyId)}`);
// The chip of a zone: locked, or how hard it is for this hero (green Pronto / yellow Arriscado / red Muito forte), never 'unlocked' mixed with 'strong enough'.
const chipOf = (locked: boolean, difficulty: ReturnType<typeof zoneDifficulty>): { tone: 'plain' | 'good' | 'gold' | 'bad'; label: string } =>
  locked ? { tone: 'plain', label: t('hunting.stateLocked') } : { tone: difficulty === 'ready' ? 'good' : difficulty === 'risky' ? 'gold' : 'bad', label: t(`hunting.state_${difficulty}`) };

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
  const needed = gearSetFor(depthGearRequired(zone, depthId));
  return (
    <button type="button" className={`hs-depth${selected ? ' active' : ''}${unlocked ? '' : ' locked'}`} onClick={onPick} role="radio" aria-checked={selected} data-ui>
      <span className="hs-depth-head">
        <span className="hs-depth-name">{t(`hunting.${def.nameKey}`)}</span>
        <span className="hs-depth-cp">{t('dungeon.cp', { n: fmtNum(recommended) })}</span>
      </span>
      {!unlocked || !estimate ? (
        <span className="hs-depth-lock">{t('hunting.depthLocked', { tier: needed.tier, refine: needed.refine })}</span>
      ) : (
        <>
          <span className="hs-depth-tags">
            <span className={`ui-tag ${estimate.outlook === 'always' ? 'good' : estimate.outlook === 'risky' ? 'gold' : 'bad'}`}>{t(`hunting.outlook_${estimate.outlook}`)}</span>
            <span className="hs-depth-level">{t('hunting.estimateLevel', { n: estimate.subLevel })}</span>
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
  const gear = equipmentIndex(save); // the depth gate asks equipment, the CP is shown as advice
  const [zoneId, setZoneId] = useState(() => defaultZone(HUNTING_ZONES, save, gear).id);
  const [depthByZone, setDepthByZone] = useState<Record<string, HuntingDepth>>({});
  // Phones show one pane at a time: the zone list first, then the chosen zone's detail.
  const [step, setStep] = useState<'list' | 'detail'>('list');

  const zone = HUNTING_ZONES.find((z) => z.id === zoneId) ?? HUNTING_ZONES[0];
  const depth = depthByZone[zone.id] ?? DEFAULT_HUNTING_DEPTH;
  const heroLevel = playerLevel(save.xp);
  const zoneOpen = isZoneOpen(zone, save.highestDungeonFloor, heroLevel);
  // where you are going: the zone's own map strip behind the monster
  const headStyle: CSSProperties & Record<'--bg', string> = { '--bg': `url(${huntingZoneBackgroundUrl(zone.id)})` };
  const enemyArt = huntingEnemyArt(zone.enemyId);

  // Real-engine projection per depth (huntEstimate.ts), memoised there on the hero's stats, the zone and its saved sub-level.
  const estimates = useMemo(() => (zoneOpen ? HUNTING_DEPTHS.map((d) => estimateHuntYield(save, zone.id, d.id)) : []), [save, zone.id, zoneOpen]);

  // The shallow-depth outlook of every open zone (the same memoised projection as the depth cards), for the chip on each row of the list.
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
          <Panel title={t('hunting.zonesTitle')} className="hs-zones">
            <div className="hs-zone-list">
              {HUNTING_ZONES.map((z) => {
                const zs = zoneState(z, save, gear);
                const rowChip = chipOf(zs === 'locked', zoneDifficulty(z, 'shallow', gear, shallowOutlooks[z.id] ?? null));
                return (
                  <button
                    type="button"
                    key={z.id}
                    className={`hs-zone state-${zs}${z.id === zone.id ? ' selected' : ''}`}
                    onClick={() => {
                      setZoneId(z.id);
                      setStep('detail');
                    }}
                    aria-pressed={z.id === zone.id}
                    data-ui
                  >
                    <MonsterPortrait enemyId={z.enemyId} box="56px" />
                    <span className="hs-zone-info">
                      <span className="hs-zone-name">{zoneName(z)}</span>
                      {zs === 'locked' ? (
                        <span className="hs-zone-sub">{t(zoneLockedText(z).key, zoneLockedText(z).vars)}</span>
                      ) : (
                        <>
                          <span className="hs-zone-sub">{t('hunting.cpSuggested', { n: fmtNum(recommendedCpForDepth(z, 'shallow')) })}</span>
                          <span className="hs-zone-sub">{t('hunting.depthsOpen', { n: depthsOpen(z, gear), m: HUNTING_DEPTHS.length })}</span>
                        </>
                      )}
                      <Chip tone={rowChip.tone}>{rowChip.label}</Chip>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <div className="hs-detail">
            <Button size="sm" className="hs-back" onClick={() => setStep('list')}>
              &lt; {t('hunting.back')}
            </Button>

            <div className={`hs-banner${zoneOpen ? '' : ' locked'}`} style={headStyle}>
              <div className="hs-banner-monster">
                <FramedSprite src={huntingEnemySpriteUrl(zone.enemyId)} art={enemyArt} box="120px" height={0.9 * enemyArt.height} row={0} still />
              </div>
              <div className="hs-banner-text">
                <span className="hs-banner-monstername">
                  {monsterName(zone)}
                  {zoneOpen && ` · ${t(`hunting.depth_${depth}`)}`}
                </span>
                <span className="hs-banner-zone">{zoneName(zone)}</span>
                <span className="hs-banner-cp">
                  {zoneOpen ? t('hunting.cpLine', { rec: fmtNum(recommendedCpForDepth(zone, depth)), you: fmtNum(playerCp) }) : t(zoneLockedText(zone).key, zoneLockedText(zone).vars)}
                </span>
                <span>
                  <Chip tone={headChip.tone}>{headChip.label}</Chip>
                </span>
              </div>
            </div>

            <Panel title={t('hunting.materialsTitle')} className="hs-p-mats">
              <div className="hs-mats">
                {zone.drops.map((d) => (
                  <span className="hs-mat" key={d.material}>
                    <MatIcon id={d.material} />
                    <span className="hs-mat-name">{matName(d.material)}</span>
                    <RarityChip rarity={d.rarity} />
                  </span>
                ))}
              </div>
              {zone.uniques && zone.uniques.length > 0 && (
                <>
                  <p className="hs-sub">{t('hunting.uniquesTitle')}</p>
                  <ZoneUniques itemIds={zone.uniques.map((u) => u.itemId)} />
                </>
              )}
            </Panel>

            {zoneOpen && (
              <>
                <Panel title={t('hunting.depthTitle')} className="hs-p-depth">
                  <p className="hs-hint">{t('hunting.depthExplain')}</p>
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
                </Panel>

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
                  <p className={`hs-fact${inv.used >= inv.capacity ? ' bad' : inv.used >= inv.capacity * 0.85 ? ' warn' : ''}`}>{t('hunting.invFree', { n: inv.used, m: inv.capacity, f: inv.free })}</p>
                  {overflowIn !== null && (
                    <p className="hs-fact bad">
                      {t('hunting.overflowWarning', { t: fmtSpan(Math.max(overflowIn, 1 / 60) * 3600 * 1000), h: capHours })} <WholesaleLink hint />
                    </p>
                  )}
                  <p className="hs-hint">{t('hunting.xpKillExplain')}</p>
                  <p className="hs-hint">{t('hunting.invExplain')}</p>
                </Panel>
              </>
            )}

            <div className="hs-foot">
              <Button variant="primary" block className="hunt-start" onClick={() => onStartHunt(zone.id, depth)} disabled={!!blocked} data-tutorial-target="hunt-start">
                {blocked ? t(blocked.key, blocked.vars) : t('hunting.start')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
