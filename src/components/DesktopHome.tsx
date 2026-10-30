import { useMemo, useState } from 'react';
import SpriteSheet from './SpriteSheet';
import { MonsterPortrait } from './HuntParts';
import GearIcon from './GearIcon';
import UniqueTag from './UniqueTag';
import PixelIcon from './PixelIcon';
import { Button, Chip, ItemFrame, PageHeader, Panel, Screen, ScreenLayout } from './ui';
import type { CardRarity } from './ui';
import { INSTANCED_SLOTS } from '../game/gear';
import { gearInstanceLabel } from './gearLabel';
import { t } from '../locales';
import { levelLabel, levelBarProgress } from './levelLabel';
import {
  SaveData,
  computeCP,
  computeHuntingStatus,
  computeMiningStatus,
  computeWoodcuttingStatus,
  computeGardenStatuses,
  formatNumber,
} from '../game/engine';
import { resolveEquipped, viewRarity } from '../game/gearInstances';
import { getOreTier } from '../game/ores';
import { getWoodTier } from '../game/woodcutting';
import { getHuntingZone } from '../game/huntingZones';
import { inventoryCapacity, inventorySlotsUsed } from '../game/inventory';
import { useDisplayName } from '../game/usernameContext';
import { portraitFrameClass } from '../game/seasonItems';
import { ownsAdventurerPass } from '../game/entitlements';
import { readyActivities } from '../game/claimAll';
import { nextStep, NextStepTarget } from '../game/nextStep';
import { nextStepLine } from './nextStepText';
import useIsPhone from '../hooks/useIsPhone';
import EventsPanel from './events/EventsPanel';
import type { ProfessionId } from '../game/leagueEvents';

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

// The Home dashboard in the shared screen layout: the camp header, the hero and the current activity on the left; the folded equipment and the events in the summary column on the right
// (under them on a phone). Same data and handlers as before; only the presentation moved onto the shared pieces (src/components/ui).
export default function DesktopHome({
  save,
  spriteUrl,
  onOpenHero,
  onOpenHunt,
  onOpenExpedition,
  onOpenMining,
  onOpenWoodcutting,
  onOpenGarden,
  onOpenInventory,
  onClaimAll,
  onOpenPass,
  onOpenNextStep,
  onPickProfession,
  onOpenCalendar,
}: {
  save: SaveData;
  spriteUrl: string;
  onOpenHero: () => void;
  onOpenHunt: () => void;
  onOpenExpedition: () => void;
  onOpenMining: () => void;
  onOpenWoodcutting: () => void;
  onOpenGarden: () => void;
  onOpenInventory: () => void;
  onClaimAll: () => void;
  onOpenPass: () => void;
  onOpenNextStep: (target: NextStepTarget) => void;
  onPickProfession: (profession: ProfessionId) => void;
  onOpenCalendar?: () => void;
}) {
  const phone = useIsPhone();
  // UI-only state (never saved): the phone block with the equipment slots starts folded.
  const [gearOpen, setGearOpen] = useState(false);
  const now = Date.now();
  const owner = ownsAdventurerPass(save);
  const ready = readyActivities(save, now);
  const displayName = useDisplayName(save.heroName);
  const heroProgress = levelBarProgress(save);
  const cp = computeCP(save);
  const equipped = resolveEquipped(save);

  const mining = computeMiningStatus(save, now);
  const woodcutting = computeWoodcuttingStatus(save, now);
  const gardenStatuses = computeGardenStatuses(save, now);
  const gardenGrowing = gardenStatuses.filter((s) => s.plantId && !s.ready).length;
  const gardenReady = gardenStatuses.filter((s) => s.ready).length;
  const hunting = save.activeHuntingZone ? getHuntingZone(save.activeHuntingZone) : undefined;

  const rewardWaiting = !!save.pendingHuntReward && !hunting;
  // The one "next step" suggestion (nextStep.ts); it walks the forge recipes, so it is recomputed when the save changes, not on every tick.
  const step = useMemo(() => nextStep(save), [save]);
  const anyActivity = !!hunting || rewardWaiting || !!mining.oreId || !!woodcutting.woodId;

  const activeDelivery = save.deliveries.active;
  const deliveryRemaining = activeDelivery ? activeDelivery.endsAt - now : 0;
  const deliveryDone = !!activeDelivery && deliveryRemaining <= 0;

  // Counted time and cap of the running hunt come from the engine's own status (the Battle Pass can lengthen the cap); it replays the session, so it
  // is recomputed every 10 s rather than on every render.
  const huntBucket = Math.floor(now / 10000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const huntStatus = useMemo(() => (hunting ? computeHuntingStatus(save, now) : null), [hunting, save, huntBucket]);
  const huntingElapsedMs = huntStatus?.pendingMs ?? 0;
  const huntingCapMs = huntStatus?.capMs ?? 0;
  const huntingProgress = huntingCapMs > 0 ? Math.min(1, huntingElapsedMs / huntingCapMs) : 0;

  // The eight equipment slots. After the current activity on a wider screen; on a phone they sit in their own folded block below the activity so the first screen is the hero summary and what to do now.
  const slotsGrid = (
    <div className="hm-slots">
      {[...INSTANCED_SLOTS, 'relic' as const].map((slot) => {
        const view = slot === 'relic' ? (equipped.relic ? { item: equipped.relic, instance: null } : null) : equipped[slot];
        const name = view ? (view.instance ? gearInstanceLabel(view.instance) : t(`gear.${view.item.nameKey}`)) : '—';
        const rarity = (view ? viewRarity(view) : 'common') as CardRarity;
        return (
          <div className={`hm-slot${view ? '' : ' empty'}`} key={slot}>
            <ItemFrame rarity={rarity} size="sm">
              {view ? <GearIcon item={view.item} /> : null}
            </ItemFrame>
            <div className="hm-slot-text">
              <span className="hm-slot-label">{gearText(slot)}</span>
              <span className="hm-slot-name" title={name}>
                {name}
                {view && <UniqueTag templateId={view.item.id} />}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );


  return (
    <Screen label={t('camp.title')}>
      <ScreenLayout
        main={
          <>
            <PageHeader icon={<PixelIcon name="camp" />} title={t('camp.title')} subtitle={t('camp.resting')} />

            {/* Hero */}
            <Panel className="hm-hero">
              <button className={`hm-portrait${portraitFrameClass(save)}`} onClick={onOpenHero} aria-label={t('nav.openProfile')} title={t('nav.openProfile')} data-ui>
                <SpriteSheet src={spriteUrl} size="min(132px, 100%)" row={0} />
              </button>
              <div className="hm-hero-body">
                <h3 className="hm-hero-name">{displayName}</h3>
                <div className="hm-hero-chips">
                  <Chip tone="gold">{levelLabel(save)}</Chip>
                  <Chip>{t('camp.cp', { n: formatNumber(cp) })}</Chip>
                </div>
                <div className="bar hm-bar hm-hero-xp">
                  <div className="bar-fill xp-fill" style={{ width: `${Math.round(heroProgress * 100)}%` }} />
                </div>
                <button className={`hm-bag${invTone(inventorySlotsUsed(save), inventoryCapacity(save))}`} onClick={onOpenInventory} data-ui>
                  <PixelIcon name="inventory" />
                  <span>{t('inventory.space', { n: inventorySlotsUsed(save), m: inventoryCapacity(save) })}</span>
                </button>
              </div>
            </Panel>

            {/* Atividade atual */}
            <Panel
              title={t('home.activityTitle')}
              actions={
                owner ? (
                  <Button variant="primary" size="sm" onClick={onClaimAll} disabled={ready.count === 0} title={t('claimAll.hint')}>
                    {t('claimAll.button')}
                    {ready.count > 0 && <span className="hm-count">{ready.count}</span>}
                  </Button>
                ) : (
                  // Without the Pass the whole sale is this one locked button: it keeps the promise visible and takes the player to the Pass.
                  <Button variant="secondary" size="sm" onClick={onOpenPass} aria-label={`${t('claimAll.button')}: ${t('claimAll.lockedHint')}`} title={t('claimAll.lockedHint')}>
                    <img className="hm-lock" src="/assets/icons/garden_plot_locked.png" alt="" />
                    {t('claimAll.button')}
                    <Chip tone="gold">{t('claimAll.passBadge')}</Chip>
                  </Button>
                )
              }
            >
              {(step.id !== 'running' || !anyActivity) && (
                <div className="hm-next">
                  <span className="hm-next-label">{t('nextStep.label')}</span>
                  <span className="hm-next-text">{nextStepLine(step)}</span>
                  {step.target !== 'none' && (
                    <Button size="sm" onClick={() => onOpenNextStep(step.target)}>
                      {t('nextStep.go')}
                    </Button>
                  )}
                </div>
              )}
              <div className="hm-acts">
                {hunting && (
                  <button className="hm-act" onClick={onOpenHunt} data-ui>
                    <span className="hm-act-icon portrait">
                      <MonsterPortrait enemyId={hunting.enemyId} box="44px" />
                    </span>
                    <div className="hm-act-info">
                      <span className="hm-act-name">{t('home.hunting')}</span>
                      <span className="hm-act-detail">{dText(hunting.nameKey)}</span>
                      <div className="bar hm-bar">
                        <div className={`bar-fill xp-fill${huntStatus?.full ? ' full' : ''}`} style={{ width: `${Math.round(huntingProgress * 100)}%` }} />
                      </div>
                      <span className="hm-act-time">{huntStatus?.full ? t('hunting.capFull') : `${formatElapsed(huntingElapsedMs)} / ${formatElapsed(huntingCapMs)}`}</span>
                      <span className={`hm-act-inv${invTone(inventorySlotsUsed(save), inventoryCapacity(save))}`}>{t('hunting.invUsed', { n: inventorySlotsUsed(save), m: inventoryCapacity(save) })}</span>
                    </div>
                  </button>
                )}
                {rewardWaiting && (
                  <button className="hm-act" onClick={onOpenHunt} data-ui>
                    <span className="hm-act-icon">
                      <PixelIcon name="hunt" />
                    </span>
                    <div className="hm-act-info">
                      <span className="hm-act-name">{t('home.hunting')}</span>
                      <span className="hm-act-detail">{t('hunting.rewardWaiting')}</span>
                      <span className={`hm-act-inv${invTone(inventorySlotsUsed(save), inventoryCapacity(save))}`}>{t('hunting.invUsed', { n: inventorySlotsUsed(save), m: inventoryCapacity(save) })}</span>
                    </div>
                  </button>
                )}
                {mining.oreId && (
                  <button className="hm-act" onClick={onOpenMining} data-ui>
                    <span className="hm-act-icon">
                      <PixelIcon name="mining" />
                    </span>
                    <div className="hm-act-info">
                      <span className="hm-act-name">{t('home.mining')}</span>
                      <span className="hm-act-detail">{oreText(getOreTier(mining.oreId)?.nameKey ?? '')}</span>
                      <div className="bar hm-bar">
                        <div className="bar-fill xp-fill" style={{ width: `${Math.round((mining.pendingMs / Math.max(1, mining.capMs)) * 100)}%` }} />
                      </div>
                      <span className="hm-act-time">
                        {formatElapsed(mining.pendingMs)} / {formatElapsed(mining.capMs)}
                      </span>
                    </div>
                  </button>
                )}
                {woodcutting.woodId && (
                  <button className="hm-act" onClick={onOpenWoodcutting} data-ui>
                    <span className="hm-act-icon">
                      <PixelIcon name="woodcutting" />
                    </span>
                    <div className="hm-act-info">
                      <span className="hm-act-name">{t('home.woodcutting')}</span>
                      <span className="hm-act-detail">{woodText(getWoodTier(woodcutting.woodId)?.nameKey ?? '')}</span>
                      <div className="bar hm-bar">
                        <div className="bar-fill xp-fill" style={{ width: `${Math.round((woodcutting.pendingMs / Math.max(1, woodcutting.capMs)) * 100)}%` }} />
                      </div>
                      <span className="hm-act-time">
                        {formatElapsed(woodcutting.pendingMs)} / {formatElapsed(woodcutting.capMs)}
                      </span>
                    </div>
                  </button>
                )}
                {(gardenGrowing > 0 || gardenReady > 0) && (
                  <button className="hm-act" onClick={onOpenGarden} data-ui>
                    <span className="hm-act-icon">
                      <PixelIcon name="garden" />
                    </span>
                    <div className="hm-act-info">
                      <span className="hm-act-name">{t('tooltips.garden')}</span>
                      <span className="hm-act-detail">{t('home.gardenStatus', { n: gardenReady, m: gardenGrowing + gardenReady })}</span>
                      <div className="hm-dots">
                        {gardenStatuses.map((s, i) => (
                          <span key={i} className={`hm-dot${s.ready ? ' ready' : s.plantId ? ' growing' : ''}`} />
                        ))}
                      </div>
                    </div>
                  </button>
                )}
                {activeDelivery && (
                  <button className="hm-act" onClick={onOpenExpedition} data-ui>
                    <span className="hm-act-icon">
                      <PixelIcon name="deliveries" />
                    </span>
                    <div className="hm-act-info">
                      <span className="hm-act-name">{t('home.delivery')}</span>
                      <span className="hm-act-detail">{deliveryDone ? t('home.deliveryReady') : formatRemaining(deliveryRemaining)}</span>
                    </div>
                  </button>
                )}
              </div>
            </Panel>

            {/* Equipamento detalhado: depois da atividade atual (no celular fica dobrado na coluna de resumo) */}
            {!phone && (
              <Panel title={t('camp.equipmentTitle')} className="hm-gear-wide">
                {slotsGrid}
              </Panel>
            )}
          </>
        }
        side={
          <>
            {/* Equipamento dobrado: onde a coluna é estreita (celular, tablet), abaixo da atividade; na coluna larga o painel aberto fica no centro, depois da atividade */}
            <Panel
              title={t('camp.equipmentTitle')}
              className={`hm-gear-panel hm-gear-narrow${gearOpen ? '' : ' folded'}`}
              actions={
                <Button size="sm" onClick={() => setGearOpen((v) => !v)} aria-expanded={gearOpen} aria-controls="hm-gear-slots">
                  {gearOpen ? t('camp.equipmentHide') : t('camp.equipmentShow')}
                </Button>
              }
            >
              {gearOpen ? <div id="hm-gear-slots">{slotsGrid}</div> : null}
            </Panel>

            {/* Eventos da Liga */}
            <EventsPanel save={save} onPickProfession={onPickProfession} onOpenCalendar={onOpenCalendar} />

          </>
        }
      />
    </Screen>
  );
}
