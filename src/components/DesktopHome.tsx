import { ReactNode, useMemo } from 'react';
import SpriteSheet from './SpriteSheet';
import { MonsterPortrait } from './HuntParts';
import GearIcon from './GearIcon';
import UniqueTag from './UniqueTag';
import { INSTANCED_SLOTS } from '../game/gear';
import { gearInstanceLabel } from './gearLabel';
import { t } from '../locales';
import {
  SaveData,
  computeCP,
  computeHuntingStatus,
  computeMiningStatus,
  computeWoodcuttingStatus,
  computeGardenStatuses,
  formatNumber,
  playerLevel,
  xpForNextLevel,
  xpToReachLevel,
  MAX_LEVEL,
} from '../game/engine';
import { resolveEquipped, viewRarity } from '../game/gearInstances';
import { skillLevel, skillLevelProgress, SkillId } from '../game/skills';
import { getOreTier } from '../game/ores';
import { getWoodTier } from '../game/woodcutting';
import { getHuntingZone } from '../game/huntingZones';
import { getBiomeForFloor, nextMilestone, MAX_DUNGEON_FLOOR } from '../game/dungeon';
import { inventoryCapacity, inventorySlotsUsed } from '../game/inventory';
import { useDisplayName } from '../game/usernameContext';
import { portraitFrameClass } from '../game/seasonItems';
import { ownsAdventurerPass } from '../game/entitlements';
import { readyActivities } from '../game/claimAll';

// Inventory pressure: amber from 85% of the slots, red when there is no free slot (the same thresholds as the hunt screen).
const invTone = (used: number, cap: number): string => (used >= cap ? ' full' : used >= cap * 0.85 ? ' warn' : '');

const dText = (k: string, v?: Record<string, string | number>): string => t(`dungeon.${k}`, v);
const oreText = (k: string): string => t(`ore.${k}`);
const woodText = (k: string): string => t(`wood.${k}`);
const gearText = (k: string): string => t(`gear.${k}`);

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}h${pad(m)}` : `${m}min`;
}

// Same "Xh MMmin" shape as formatRemaining, but floored (elapsed time, not a countdown) — used to
// show real elapsed/cap progress on an activity card ("2h30 / 4h") without inventing any new field.
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}h${pad(m)}` : `${m}min`;
}

function SkillRow({ icon, name, level, cap, progress }: { icon: ReactNode; name: string; level: number; cap: number; progress: number }) {
  return (
    <div className="dh-skill-row">
      <span className="dh-skill-icon">{icon}</span>
      <div className="dh-skill-info">
        <div className="dh-skill-head">
          <span className="dh-skill-name">{name}</span>
          <span className="dh-skill-level">{t('skills.level', { n: level })}{level >= cap ? ' (MAX)' : ''}</span>
        </div>
        <div className="bar dh-skill-bar">
          <div className="bar-fill xp-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function DesktopHome({
  save,
  spriteUrl,
  onOpenHero,
  onOpenHunt,
  onOpenDungeon,
  onOpenForge,
  onOpenExpedition,
  onOpenMining,
  onOpenWoodcutting,
  onOpenGarden,
  onOpenInventory,
  onClaimAll,
  onOpenPass,
}: {
  save: SaveData;
  spriteUrl: string;
  onOpenHero: () => void;
  onOpenHunt: () => void;
  onOpenDungeon: () => void;
  onOpenForge: () => void;
  onOpenExpedition: () => void;
  onOpenMining: () => void;
  onOpenWoodcutting: () => void;
  onOpenGarden: () => void;
  onOpenInventory: () => void;
  onClaimAll: () => void;
  onOpenPass: () => void;
}) {
  const now = Date.now();
  const owner = ownsAdventurerPass(save);
  const ready = readyActivities(save, now);
  const displayName = useDisplayName(save.heroName);
  const level = playerLevel(save.xp);
  const heroProgress = Math.max(0, Math.min(1, (save.xp - xpToReachLevel(level)) / Math.max(1, xpForNextLevel(level))));
  const cp = computeCP(save);
  const equipped = resolveEquipped(save);

  const mining = computeMiningStatus(save, now);
  const woodcutting = computeWoodcuttingStatus(save, now);
  const gardenStatuses = computeGardenStatuses(save, now);
  const gardenGrowing = gardenStatuses.filter((s) => s.plantId && !s.ready).length;
  const gardenReady = gardenStatuses.filter((s) => s.ready).length;
  const hunting = save.activeHuntingZone ? getHuntingZone(save.activeHuntingZone) : undefined;

  const rewardWaiting = !!save.pendingHuntReward && !hunting;
  const anyActivity = !!hunting || rewardWaiting || !!mining.oreId || !!woodcutting.woodId;

  const biome = getBiomeForFloor(save.highestDungeonFloor);
  const milestone = nextMilestone(save.highestDungeonFloor);

  const activeDelivery = save.deliveries.active;
  const deliveryRemaining = activeDelivery ? activeDelivery.endsAt - now : 0;
  const deliveryDone = !!activeDelivery && deliveryRemaining <= 0;

  const skillDefs: { key: SkillId; icon: ReactNode; name: string; xp: number }[] = [
    { key: 'mining', icon: <img className="pixel-icon" src="/assets/icons/nav_mining.png" alt="" />, name: t('nav.mining'), xp: save.skillXp.mining },
    { key: 'woodcutting', icon: '🪓', name: t('nav.woodcutting'), xp: save.skillXp.woodcutting },
    { key: 'gardening', icon: '🌱', name: t('nav.garden'), xp: save.skillXp.gardening },
  ];

  // Counted time and cap of the running hunt come from the engine's own status (the Battle Pass can lengthen the cap); it replays the session, so it
  // is recomputed every 10 s rather than on every render.
  const huntBucket = Math.floor(now / 10000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const huntStatus = useMemo(() => (hunting ? computeHuntingStatus(save, now) : null), [hunting, save, huntBucket]);
  const huntingElapsedMs = huntStatus?.pendingMs ?? 0;
  const huntingCapMs = huntStatus?.capMs ?? 0;
  const huntingProgress = huntingCapMs > 0 ? Math.min(1, huntingElapsedMs / huntingCapMs) : 0;

  const dungeonProgress = save.highestDungeonFloor / MAX_DUNGEON_FLOOR;

  return (
    <div className="desktop-home">
      {/* Area A — Hero */}
      <section className="dh-card dh-hero">
        <button className={`dh-hero-portrait${portraitFrameClass(save)}`} onClick={onOpenHero} data-ui>
          <SpriteSheet src={spriteUrl} size="min(148px, 100%)" row={0} />
        </button>
        <div className="dh-hero-body">
          <div className="dh-hero-headline">
            <span className="dh-hero-name">{displayName}</span>
          </div>
          <div className="dh-hero-badges">
            <span className="dh-hero-badge level">{t('camp.level', { n: level })}</span>
            <span className="dh-hero-badge cp">{t('camp.cp', { n: formatNumber(cp) })}</span>
          </div>
          <div className="bar dh-hero-xpbar">
            <div className="bar-fill xp-fill" style={{ width: `${Math.round(heroProgress * 100)}%` }} />
          </div>
          <div className="dh-hero-equip">
            {[...INSTANCED_SLOTS, 'relic' as const].map((slot) => {
              const view = slot === 'relic' ? (equipped.relic ? { item: equipped.relic, instance: null } : null) : equipped[slot];
              const name = view ? (view.instance ? gearInstanceLabel(view.instance) : t(`gear.${view.item.nameKey}`)) : '—';
              return (
                <div className={`dh-equip-slot${view ? '' : ' empty'}`} key={slot}>
                  <span className={`dh-equip-icon r-${view ? viewRarity(view) : 'common'}`}>
                    {view ? <GearIcon item={view.item} /> : <span className="dh-equip-empty-mark">·</span>}
                  </span>
                  <div className="dh-equip-text">
                    <span className="dh-equip-label">{gearText(slot)}</span>
                    <span className="dh-equip-name-row">
                      <span className="dh-equip-name" title={name}>
                        {name}
                      </span>
                      {view && <UniqueTag templateId={view.item.id} />}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <button className={`dh-inventory-chip${invTone(inventorySlotsUsed(save), inventoryCapacity(save))}`} onClick={onOpenInventory} data-ui>
            <span>{t('inventory.space', { n: inventorySlotsUsed(save), m: inventoryCapacity(save) })}</span>
          </button>
        </div>
      </section>

      {/* Area B — Atividade atual */}
      <section className="dh-card dh-activity">
        <div className="dh-activity-head">
          <h3 className="dh-card-title">{t('home.activityTitle')}</h3>
          {owner ? (
            <button className="dh-claimall" onClick={onClaimAll} disabled={ready.count === 0} title={t('claimAll.hint')} data-ui>
              {t('claimAll.button')}
              {ready.count > 0 && <span className="dh-claimall-count">{ready.count}</span>}
            </button>
          ) : (
            <button className="dh-claimall locked" onClick={onOpenPass} title={t('claimAll.lockedHint')} data-ui>
              <img className="dh-claimall-lock" src="/assets/icons/garden_plot_locked.png" alt="" />
              {t('claimAll.button')}
              <span className="dh-claimall-badge">{t('claimAll.passBadge')}</span>
            </button>
          )}
        </div>
        {!anyActivity && <div className="dh-idle">{t('home.idle')}</div>}
        <div className="dh-activity-grid">
          {hunting && (
            <button className="dh-activity-item" onClick={onOpenHunt} data-ui>
              <span className="dh-activity-icon portrait">
                <MonsterPortrait enemyId={hunting.enemyId} box="44px" />
              </span>
              <div className="dh-activity-info">
                <span className="dh-activity-name">{t('home.hunting')}</span>
                <span className="dh-activity-detail">{dText(hunting.nameKey)}</span>
                <div className="bar dh-activity-bar">
                  <div className={`bar-fill xp-fill${huntStatus?.full ? ' full' : ''}`} style={{ width: `${Math.round(huntingProgress * 100)}%` }} />
                </div>
                <span className="dh-activity-time">
                  {huntStatus?.full ? t('hunting.capFull') : `${formatElapsed(huntingElapsedMs)} / ${formatElapsed(huntingCapMs)}`}
                </span>
                <span className={`dh-activity-inv${invTone(inventorySlotsUsed(save), inventoryCapacity(save))}`}>{t('hunting.invUsed', { n: inventorySlotsUsed(save), m: inventoryCapacity(save) })}</span>
              </div>
            </button>
          )}
          {rewardWaiting && (
            <button className="dh-activity-item" onClick={onOpenHunt} data-ui>
              <span className="dh-activity-icon"><img className="pixel-icon" src="/assets/icons/demon_claw.png" alt="" /></span>
              <div className="dh-activity-info">
                <span className="dh-activity-name">{t('home.hunting')}</span>
                <span className="dh-activity-detail">{t('hunting.rewardWaiting')}</span>
                <span className={`dh-activity-inv${invTone(inventorySlotsUsed(save), inventoryCapacity(save))}`}>{t('hunting.invUsed', { n: inventorySlotsUsed(save), m: inventoryCapacity(save) })}</span>
              </div>
            </button>
          )}
          {mining.oreId && (
            <button className="dh-activity-item" onClick={onOpenMining} data-ui>
              <span className="dh-activity-icon"><img className="pixel-icon" src="/assets/icons/nav_mining.png" alt="" /></span>
              <div className="dh-activity-info">
                <span className="dh-activity-name">{t('home.mining')}</span>
                <span className="dh-activity-detail">{oreText(getOreTier(mining.oreId)?.nameKey ?? '')}</span>
                <div className="bar dh-activity-bar">
                  <div className="bar-fill xp-fill" style={{ width: `${Math.round((mining.pendingMs / Math.max(1, mining.capMs)) * 100)}%` }} />
                </div>
                <span className="dh-activity-time">{formatElapsed(mining.pendingMs)} / {formatElapsed(mining.capMs)}</span>
              </div>
            </button>
          )}
          {woodcutting.woodId && (
            <button className="dh-activity-item" onClick={onOpenWoodcutting} data-ui>
              <span className="dh-activity-icon">🪓</span>
              <div className="dh-activity-info">
                <span className="dh-activity-name">{t('home.woodcutting')}</span>
                <span className="dh-activity-detail">{woodText(getWoodTier(woodcutting.woodId)?.nameKey ?? '')}</span>
                <div className="bar dh-activity-bar">
                  <div className="bar-fill xp-fill" style={{ width: `${Math.round((woodcutting.pendingMs / Math.max(1, woodcutting.capMs)) * 100)}%` }} />
                </div>
                <span className="dh-activity-time">{formatElapsed(woodcutting.pendingMs)} / {formatElapsed(woodcutting.capMs)}</span>
              </div>
            </button>
          )}
          {(gardenGrowing > 0 || gardenReady > 0) && (
            <button className="dh-activity-item" onClick={onOpenGarden} data-ui>
              <span className="dh-activity-icon">🌱</span>
              <div className="dh-activity-info">
                <span className="dh-activity-name">{t('tooltips.garden')}</span>
                <span className="dh-activity-detail">{t('home.gardenStatus', { n: gardenReady, m: gardenGrowing + gardenReady })}</span>
                <div className="dh-garden-dots">
                  {gardenStatuses.map((s, i) => (
                    <span key={i} className={`dh-garden-dot${s.ready ? ' ready' : s.plantId ? ' growing' : ''}`} />
                  ))}
                </div>
              </div>
            </button>
          )}
          {activeDelivery && (
            <button className="dh-activity-item" onClick={onOpenExpedition} data-ui>
              <span className="dh-activity-icon">🏕️</span>
              <div className="dh-activity-info">
                <span className="dh-activity-name">{t('home.delivery')}</span>
                <span className="dh-activity-detail">{deliveryDone ? t('home.deliveryReady') : formatRemaining(deliveryRemaining)}</span>
              </div>
            </button>
          )}
        </div>
      </section>

      {/* Area C — Progressao */}
      <section className="dh-card dh-progression">
        <h3 className="dh-card-title">{t('home.progressionTitle')}</h3>
        <SkillRow icon="⚔️" name={t('home.hero')} level={level} cap={MAX_LEVEL} progress={heroProgress} />
        {skillDefs.map((s) => (
          <SkillRow
            key={s.key}
            icon={s.icon}
            name={s.name}
            level={skillLevel(s.xp, s.key)}
            cap={75}
            progress={skillLevelProgress(s.xp, s.key)}
          />
        ))}
        <div className="dh-skill-row">
          <span className="dh-skill-icon">⚔️</span>
          <div className="dh-skill-info">
            <div className="dh-skill-head">
              <span className="dh-skill-name">{t('home.dungeon')}</span>
              <span className="dh-skill-level">{dText('floorLabel', { n: save.highestDungeonFloor })}</span>
            </div>
            <div className="bar dh-skill-bar">
              <div className="bar-fill xp-fill" style={{ width: `${Math.round(dungeonProgress * 100)}%` }} />
            </div>
            <div className="dh-dungeon-detail">
              <span>{dText(biome.nameKey)}</span>
              {milestone && <span className="dh-dungeon-next">{milestone.boss ? dText('nextBoss') : dText('nextCheckpoint')}: {dText('floorLabel', { n: milestone.floor })}</span>}
              {!milestone && <span>{dText('floorLabel', { n: MAX_DUNGEON_FLOOR })}</span>}
            </div>
          </div>
        </div>
      </section>

      {/* Area D — Acoes rapidas */}
      <section className="dh-card dh-quickactions">
        <h3 className="dh-card-title">{t('home.quickActionsTitle')}</h3>
        <div className="dh-quick-grid">
          <button className="dh-quick-btn primary" onClick={onOpenDungeon} data-ui>
            {t('camp.enterArena')}
          </button>
          <button className="dh-quick-btn" onClick={onOpenHunt} data-ui>
            🏹 {t('tooltips.hunt')}
          </button>
          <button className="dh-quick-btn" onClick={onOpenForge} data-ui>
            {t('ui.forge')}
          </button>
          <button className="dh-quick-btn" onClick={onOpenExpedition} data-ui>
            🏕️ {t('tooltips.expedition')}
          </button>
        </div>
      </section>
    </div>
  );
}
