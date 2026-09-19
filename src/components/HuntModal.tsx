import { useEffect, useState } from 'react';
import Assets from '../assets.json';
import { t } from '../locales';
import { computeCP, computeHuntingStatus, effectivePouchSlots, getHuntProgress, huntPromotionRequiredWins, SaveData } from '../game/engine';
import T from '../game/tunables';
import {
  DEFAULT_HUNTING_DEPTH,
  HUNTING_DEPTHS,
  HUNTING_ZONES,
  HuntingDepth,
  HuntingZoneDef,
  isDepthUnlocked,
  isZoneUnlocked,
  recommendedCpForDepth,
} from '../game/huntingZones';
import { DropRarity, getMaterial } from '../game/materials';
import { playerSpriteUrl } from '../game/sprites';
import { allocateToPouch } from '../game/huntPouch';
import HuntBattleView from './HuntBattleView';
import MaterialIcon from './MaterialIcon';

const dungeonText = (k: string): string => t(`dungeon.${k}`);
const matText = (k: string): string => t(`materials.mat_${k}`);
const huntText = (k: string): string => t(`hunting.${k}`);

// Purely presentational: the conceptual loot profile of each depth (pips out of LOOT_PIPS) and the star
// rating of a sub-level. Neither is derived from — nor feeds — the real drop math (dropMultiplier,
// subLevelDropMultiplier); the player never sees numbers, percentages or multipliers.
const LOOT_PIPS = 4;
const LOOT_STARS = 5;
const LOOT_RARITIES: DropRarity[] = ['common', 'uncommon', 'rare'];
const DEPTH_LOOT_PROFILE: Record<HuntingDepth, Record<DropRarity, number>> = {
  shallow: { common: 3, uncommon: 1, rare: 1 },
  dense: { common: 3, uncommon: 2, rare: 2 },
  deep: { common: 2, uncommon: 3, rare: 4 },
};
const masteryStars = (subLevel: number): number => Math.min(LOOT_STARS, Math.max(1, Math.ceil(subLevel / 2)));

function LootPips({ rarity, filled }: { rarity: DropRarity; filled: number }) {
  return (
    <span className={`hunt-pips pips-${rarity}`} aria-hidden="true">
      {Array.from({ length: LOOT_PIPS }, (_, i) => (
        <span key={i} className={`hunt-pip${i < filled ? ' on' : ''}`} />
      ))}
    </span>
  );
}

// "Domínio": how far the hero has mastered this depth's sub-levels — a purely visual read of the sub-level,
// never a statement about item quality/rarity.
function Mastery({ subLevel }: { subLevel: number }) {
  const stars = masteryStars(subLevel);
  const maxed = subLevel >= T.hunting.subLevels;
  return (
    <span className="hunt-mastery">
      <span className="hunt-mastery-label">{huntText(maxed ? 'masteryMax' : 'mastery')}</span>
      <span className="hunt-stars" aria-hidden="true">
        {Array.from({ length: LOOT_STARS }, (_, i) => (
          <span key={i} className={`hunt-star${i < stars ? ' on' : ''}`}>★</span>
        ))}
      </span>
    </span>
  );
}

function formatHours(ms: number): string {
  const h = ms / (3600 * 1000);
  return h >= 10 ? h.toFixed(0) : h.toFixed(1);
}

// Same helper BattleModal.tsx uses for its HP bars (not exported there, so mirrored here).
const hpPct = (cur: number, max: number): number => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

function DepthPicker({
  zone,
  selected,
  playerCp,
  onPick,
}: {
  zone: HuntingZoneDef;
  selected: HuntingDepth;
  playerCp: number;
  onPick: (depth: HuntingDepth) => void;
}) {
  const selectedDef = HUNTING_DEPTHS.find((d) => d.id === selected) ?? HUNTING_DEPTHS[0];
  return (
    <>
    <div className="hunt-depth-row">
      {HUNTING_DEPTHS.map((def) => {
        const recommendedCp = recommendedCpForDepth(zone, def.id);
        const unlocked = isDepthUnlocked(zone, def.id, playerCp);
        const isSelected = selected === def.id;
        return (
          <button
            key={def.id}
            type="button"
            className={`hunt-depth-btn${isSelected ? ' active' : ''}${unlocked ? '' : ' locked'}`}
            onClick={() => unlocked && onPick(def.id)}
            disabled={!unlocked}
            title={unlocked ? undefined : t('hunting.depthLocked', { n: recommendedCp })}
            data-ui
          >
            <span className="hunt-depth-name">{!unlocked && '🔒 '}{huntText(def.nameKey)}</span>
            <span className="hunt-depth-cp">{t('dungeon.cp', { n: recommendedCp })}</span>
            <span className="hunt-depth-mini" aria-hidden="true">
              {LOOT_RARITIES.map((r) => (
                <LootPips key={r} rarity={r} filled={DEPTH_LOOT_PROFILE[def.id][r]} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
    <div className="hunt-depth-detail">
      <div className="hunt-depth-detail-head">
        <span className="hunt-depth-detail-name">{huntText(selectedDef.nameKey)}</span>
        <span className="hunt-depth-detail-sub">{huntText(`depthSub_${selectedDef.id}`)}</span>
      </div>
      {LOOT_RARITIES.map((r) => (
        <div className="hunt-depth-profile-row" key={r}>
          <span className={`hunt-depth-profile-label tier-${r}`}>{huntText(`tier_${r}`)}</span>
          <LootPips rarity={r} filled={DEPTH_LOOT_PROFILE[selectedDef.id][r]} />
        </div>
      ))}
      <div className="hunt-depth-desc">{huntText(`depthDesc_${selectedDef.id}`)}</div>
    </div>
    </>
  );
}

export default function HuntModal({
  save,
  onStartHunt,
  onStopHunt,
  onClose,
}: {
  save: SaveData;
  onStartHunt: (zoneId: string, depth: HuntingDepth) => void;
  onStopHunt: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [selectedDepth, setSelectedDepth] = useState<Record<string, HuntingDepth>>({});

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

  const huntStatus = computeHuntingStatus(save, now);
  const heroSpriteUrl = playerSpriteUrl();
  const playerCp = computeCP(save);

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal">
        <h2 className="modal-title">{dungeonText('huntTab')}</h2>

        <div className="dungeon-body">
          {HUNTING_ZONES.map((zone) => {
            const unlocked = isZoneUnlocked(zone, save.highestDungeonFloor);
            const isActive = save.activeHuntingZone === zone.id;
            const depth = isActive ? save.activeHuntingDepth ?? DEFAULT_HUNTING_DEPTH : selectedDepth[zone.id] ?? DEFAULT_HUNTING_DEPTH;
            const canStartAtDepth = isDepthUnlocked(zone, depth, playerCp);
            return (
              <div className={`floor-card${unlocked ? '' : ' locked'}`} key={zone.id}>
                <div className="floor-header">
                  <span className="floor-name">{dungeonText(zone.nameKey)}</span>
                  <span className="floor-cp">{t('dungeon.cp', { n: zone.cp })}</span>
                </div>

                {unlocked ? (
                  <>
                    <div className="floor-drops">
                      <span className="drops-label">{t('dungeon.drops')}:</span>
                      <span className="floor-drop">
                        <span className="mat-icon">
                          <img src={Assets.icons.gold.url} alt="" />
                        </span>
                        <span>{t('hunting.perHour', { n: zone.goldPerHour })}</span>
                      </span>
                    </div>
                    <div className="hunt-drop-tiers">
                      {zone.drops.map((d) => (
                        <span className={`hunt-drop-tag tier-${d.rarity}`} key={d.material}>
                          <span className="mat-icon">
                            <MaterialIcon item={getMaterial(d.material)!} />
                          </span>
                          <span className="hunt-drop-tier-label">{huntText(`tier_${d.rarity}`)}</span>
                          <span className="hunt-drop-name">{matText(d.material)}</span>
                        </span>
                      ))}
                    </div>

                    {isActive ? (
                      <>
                        <div className="hunt-run-depth">
                          <div className="hunt-run-depth-line">
                            <span className="hunt-run-depth-name">{huntText(HUNTING_DEPTHS.find((d) => d.id === depth)!.nameKey)}</span>
                            <span className="hunt-run-depth-sub"> · {huntText(`depthSub_${depth}`)}</span>
                          </div>
                          <div className="hunt-run-focus">{huntText(`depthFocus_${depth}`)}</div>
                        </div>
                        <div className="hunt-run-level">
                          <span className="hunt-sublevel-progress">
                            {t('hunting.subLevelProgress', { n: huntStatus.ceilingSubLevel, m: T.hunting.subLevels })}
                          </span>
                          <Mastery subLevel={huntStatus.ceilingSubLevel} />
                        </div>
                        {huntStatus.ceilingSubLevel < T.hunting.subLevels && (
                          <div className="hunt-run-promo">
                            <span className="hunt-run-promo-label">{huntText('nextPromotion')}</span>
                            <span className="hunt-run-promo-value">
                              {t('hunting.promotionWins', {
                                n: Math.min(huntStatus.promotionWins, huntStatus.promotionRequired),
                                x: huntStatus.promotionRequired,
                              })}
                            </span>
                          </div>
                        )}
                        <HuntBattleView enemyId={zone.enemyId} playerSpriteUrl={heroSpriteUrl} />
                        {huntStatus.liveSnapshot && (
                          <div className="battle-top hunt-hp-panel">
                            <div className="battle-hud hero">
                              <span className="hp-label">
                                <span className="hp-name-text">{dungeonText('heroLabel')}</span>
                              </span>
                              <div className="battle-hp-row">
                                <div className="bar hp">
                                  <div
                                    className="bar-fill hp-fill"
                                    style={{ width: `${hpPct(huntStatus.liveSnapshot.heroHp, huntStatus.liveSnapshot.heroMax)}%` }}
                                  />
                                </div>
                                <span className="hp-num">
                                  {Math.round(huntStatus.liveSnapshot.heroHp)} / {huntStatus.liveSnapshot.heroMax}
                                </span>
                              </div>
                            </div>
                            <div className="battle-hud enemy">
                              <span className="hp-label">
                                <span className="hp-name-text">
                                  {t('hunting.subLevelEnemyLabel', { n: huntStatus.liveSnapshot.subLevel })}
                                </span>
                              </span>
                              <div className="battle-hp-row">
                                <div className="bar hp enemy-hp">
                                  <div
                                    className="bar-fill enemy-hp-fill"
                                    style={{ width: `${hpPct(huntStatus.liveSnapshot.enemyHp, huntStatus.liveSnapshot.enemyMax)}%` }}
                                  />
                                </div>
                                <span className="hp-num">
                                  {Math.round(huntStatus.liveSnapshot.enemyHp)} / {huntStatus.liveSnapshot.enemyMax}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="camp-mine-bar">
                          <div
                            className={`camp-mine-fill${huntStatus.full ? ' full' : ''}`}
                            style={{ width: `${huntStatus.capMs <= 0 ? 0 : Math.min(100, (huntStatus.pendingMs / huntStatus.capMs) * 100)}%` }}
                          />
                        </div>
                        <span className="camp-mine-time">
                          {huntStatus.full ? huntText('full') : huntText('hunting')} ·{' '}
                          {t('mining.capProgress', { cur: formatHours(huntStatus.pendingMs), cap: formatHours(huntStatus.capMs) })}
                        </span>
                        {(() => {
                          const capacity = effectivePouchSlots(save, now);
                          const preview = allocateToPouch(save.huntPouch, huntStatus.drops, zone.drops.map((d) => d.material), capacity);
                          return (
                            <>
                              {preview.items.length > 0 && (
                                <div className="floor-drops">
                                  <span className="drops-label">{t('hunting.pouchLabel', { n: preview.items.length, m: capacity })}:</span>
                                  {preview.items.map((item) => (
                                    <span className="floor-drop" key={item.itemId}>
                                      <span className="mat-icon">
                                        <MaterialIcon item={getMaterial(item.itemId)!} />
                                      </span>
                                      <span>
                                        {matText(item.itemId)} +{item.count}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {preview.lostItems.length > 0 && (
                                <div className="floor-drops">
                                  <span className="drops-label pouch-full-label">{t('hunting.pouchFull')}:</span>
                                  {preview.lostItems.map((item) => (
                                    <span className="floor-drop lost" key={item.itemId}>
                                      <span className="mat-icon">
                                        <MaterialIcon item={getMaterial(item.itemId)!} />
                                      </span>
                                      <span>
                                        {matText(item.itemId)} +{item.count}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        <button className="camp-expedition-cancel" onClick={onStopHunt} data-ui>
                          {huntText('stop')}
                        </button>
                      </>
                    ) : (
                      <>
                        <DepthPicker
                          zone={zone}
                          selected={depth}
                          playerCp={playerCp}
                          onPick={(d) => setSelectedDepth((prev) => ({ ...prev, [zone.id]: d }))}
                        />
                        {(() => {
                          const progress = getHuntProgress(save, zone.id, depth);
                          return (
                            <div className="hunt-sublevel-resume">
                              {t('hunting.subLevelProgress', { n: progress.ceiling, m: T.hunting.subLevels })}
                              {progress.ceiling < T.hunting.subLevels && (
                                <>
                                  {' · '}
                                  {t('hunting.subLevelPromotion', {
                                    next: progress.ceiling + 1,
                                    n: Math.min(progress.promotionWins, huntPromotionRequiredWins(progress.ceiling)),
                                    x: huntPromotionRequiredWins(progress.ceiling),
                                  })}
                                </>
                              )}
                            </div>
                          );
                        })()}
                        <div className="hunt-run-level idle">
                          <Mastery subLevel={getHuntProgress(save, zone.id, depth).ceiling} />
                        </div>
                        <button className="battle-btn" onClick={() => onStartHunt(zone.id, depth)} disabled={!canStartAtDepth} data-ui>
                          {huntText('start')}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <span className="floor-locked">{t('dungeon.unlocksAt', { n: zone.unlockFloor })}</span>
                )}
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
