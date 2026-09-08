import { useEffect, useState } from 'react';
import Assets from '../assets.json';
import { t } from '../locales';
import { computeCP, computeHuntingStatus, SaveData } from '../game/engine';
import { getBiomeForFloor, isDungeonBoss, isDungeonCheckpoint, MAX_DUNGEON_FLOOR, nextMilestone, recommendedCpForFloor } from '../game/dungeon';
import { HUNTING_ZONES, isZoneUnlocked } from '../game/huntingZones';
import { getMaterial, MaterialId } from '../game/materials';
import { getEquipped } from '../game/gear';
import { spriteForArmorTier } from '../game/sprites';
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

export default function DungeonMapModal({
  save,
  onEnterDungeon,
  onStartHunt,
  onClaimHunt,
  onExpedition,
  onClose,
}: {
  save: SaveData;
  onEnterDungeon: () => void;
  onStartHunt: (zoneId: string) => void;
  onClaimHunt: () => void;
  onExpedition: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'dungeon' | 'hunt'>('dungeon');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (tab !== 'hunt') return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tab]);

  const floor = save.highestDungeonFloor;
  const biome = getBiomeForFloor(floor);
  const milestone = nextMilestone(floor);
  const recommendedCp = recommendedCpForFloor(floor);
  const playerCp = computeCP(save);
  const cpInsufficient = playerCp < recommendedCp;
  const huntStatus = computeHuntingStatus(save, now);
  const playerSpriteUrl = spriteForArmorTier(getEquipped(save.equipped).armor?.tier ?? 0);

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal">
        <h2 className="modal-title">{t('dungeon.title')}</h2>

        <div className="dungeon-tabs">
          <button className={`tab${tab === 'dungeon' ? ' active' : ''}`} onClick={() => setTab('dungeon')} data-ui>
            {dungeonText('dungeonTab')}
          </button>
          <button className={`tab${tab === 'hunt' ? ' active' : ''}`} onClick={() => setTab('hunt')} data-ui>
            {dungeonText('huntTab')}
          </button>
        </div>

        {tab === 'dungeon' ? (
          <div className="dungeon-body">
            <div className="floor-card">
              <div className="floor-header">
                <span className="floor-name">
                  {dungeonText(biome.nameKey)}
                  {isDungeonBoss(floor) && <span className="milestone-icon boss">👑</span>}
                  {!isDungeonBoss(floor) && isDungeonCheckpoint(floor) && <span className="milestone-icon">💀</span>}
                </span>
                <span className="floor-cp">{t('dungeon.floorProgress', { n: floor, m: MAX_DUNGEON_FLOOR })}</span>
              </div>
              <div className="floor-drops">
                <span className="drops-label">{dungeonText('recommendedCp')}:</span>
                <span className={`floor-drop${cpInsufficient ? ' cp-insufficient' : ''}`}>
                  <span>{recommendedCp}</span>
                </span>
                <span className="floor-drop">
                  <span>{t('dungeon.yourCp', { n: playerCp })}</span>
                </span>
              </div>
              {cpInsufficient && <div className="cp-warning-banner">{t('dungeon.cpWarning', { n: recommendedCp })}</div>}
              {milestone && (
                <div className="floor-drops">
                  <span className="drops-label">
                    {milestone.boss ? '👑 ' + dungeonText('nextBoss') : '💀 ' + dungeonText('nextCheckpoint')}:
                  </span>
                  <span className="floor-drop">
                    <span>{t('dungeon.floorProgress', { n: milestone.floor, m: MAX_DUNGEON_FLOOR })}</span>
                  </span>
                </div>
              )}
              <button className="battle-btn" onClick={onEnterDungeon} data-ui>
                {dungeonText('enterDungeon')}
              </button>
            </div>
          </div>
        ) : (
          <div className="dungeon-body">
            {HUNTING_ZONES.map((zone) => {
              const unlocked = isZoneUnlocked(zone, save.highestDungeonFloor);
              const isActive = save.activeHuntingZone === zone.id;
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
                            <span className="hunt-drop-chance">{formatChance(d.chance)}</span>
                          </span>
                        ))}
                      </div>

                      {isActive ? (
                        <>
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
                          {Object.keys(huntStatus.drops).length > 0 && (
                            <div className="floor-drops">
                              {Object.entries(huntStatus.drops).map(([mid, qty]) => (
                                <span className="floor-drop" key={mid}>
                                  <span className="mat-icon">
                                    <MaterialIcon item={getMaterial(mid as MaterialId)!} />
                                  </span>
                                  <span>
                                    {matText(mid)} +{qty as number}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                          <button
                            className="battle-btn"
                            onClick={onClaimHunt}
                            disabled={huntStatus.goldReady <= 0 && Object.keys(huntStatus.drops).length === 0}
                            data-ui
                          >
                            {huntText('collect')}
                          </button>
                        </>
                      ) : (
                        <button className="battle-btn" onClick={() => onStartHunt(zone.id)} data-ui>
                          {huntText('start')}
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="floor-locked">{t('dungeon.unlocksAt', { n: zone.unlockFloor })}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button className="expedition-entry" onClick={onExpedition} data-ui>
          {t('dungeon.expedition')}
        </button>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
