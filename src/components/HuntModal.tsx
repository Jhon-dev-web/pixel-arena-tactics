import { useEffect, useState } from 'react';
import Assets from '../assets.json';
import { t } from '../locales';
import { computeCP, computeHuntingStatus, effectivePouchSlots, SaveData } from '../game/engine';
import {
  DEFAULT_HUNTING_DEPTH,
  effectiveDropChance,
  HUNTING_DEPTHS,
  HUNTING_ZONES,
  HuntingDepth,
  HuntingZoneDef,
  isDepthUnlocked,
  isZoneUnlocked,
  recommendedCpForDepth,
} from '../game/huntingZones';
import { getMaterial } from '../game/materials';
import { getEquipped } from '../game/gear';
import { spriteForArmorTier } from '../game/sprites';
import { allocateToPouch } from '../game/huntPouch';
import HuntBattleView from './HuntBattleView';
import MaterialIcon from './MaterialIcon';

const dungeonText = (k: string): string => t(`dungeon.${k}`);
const matText = (k: string): string => t(`materials.mat_${k}`);
const huntText = (k: string): string => t(`hunting.${k}`);

function formatChance(chance: number): string {
  const pct = chance * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function formatHours(ms: number): string {
  const h = ms / (3600 * 1000);
  return h >= 10 ? h.toFixed(0) : h.toFixed(1);
}

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
  return (
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
            <span className="hunt-depth-rate">{t('hunting.rateMultiplier', { n: def.itemsPerHourMultiplier.toFixed(1) })}</span>
          </button>
        );
      })}
    </div>
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
  const playerSpriteUrl = spriteForArmorTier(getEquipped(save.equipped).armor?.tier ?? 0);
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
                          <span className="hunt-drop-chance">{formatChance(effectiveDropChance(d, depth))}</span>
                        </span>
                      ))}
                    </div>

                    {isActive ? (
                      <>
                        <div className="hunt-depth-current">{t('hunting.currentDepth', { depth: huntText(HUNTING_DEPTHS.find((d) => d.id === depth)!.nameKey) })}</div>
                        <HuntBattleView enemyId={zone.enemyId} playerSpriteUrl={playerSpriteUrl} />
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
