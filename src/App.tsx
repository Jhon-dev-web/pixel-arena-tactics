import { useEffect, useRef, useState } from 'react';
import T, { setTunableListener } from './game/tunables';
import {
  addBattlePassXp,
  computeCP,
  computeGardenStatuses,
  computeMiningStatus,
  computeWoodcuttingStatus,
  defaultSave,
  effectiveRepairCost,
  isBattlePassActive,
  loadSave,
  persistSave,
  playerLevel,
  ContextualTutorialId,
  InitialTutorialStep,
  SaveData,
} from './game/engine';
import { applyHuntClaim, applyHuntStop, huntClaimBlocked, requestHuntStart } from './game/huntLifecycle';
import { applyHarvest, applyPlant, applyUproot } from './game/gardenActions';
import { applyElixir, ElixirId } from './game/elixirs';
import { withSessionWindow } from './game/huntSession';
import { getBattlePassLevelDef } from './game/battlepass';
import { DURABILITY_LOSS_PER_STAGE, GEAR, getGear, isInstancedSlot } from './game/gear';
import { applyReforge } from './game/reforge';
import {
  InstancedSlot,
  applyDiscardInstance,
  applyDurabilityLoss,
  applyEquipInstance,
  applyForge,
  applyRepair,
  applySalvage,
  applySocketGem,
  applyUnequipSlot,
  applyUnsocketGem,
  applyUpgrade,
  createGearInstance,
  equippedSubstatTotals,
  maxGearInstances,
  questMaxRefine,
  resolveGearInstance,
} from './game/gearInstances';
import { MaterialId, hasMaterials } from './game/materials';
import { getRefiningRecipe } from './game/refining';
import { getPotionRecipe } from './game/potions';
import { CONSUMABLE_STACK, ConsumableId, EXPEDITION_TICKET_SKIP_MS, getConsumable } from './game/consumables';
import { isBagFull } from './game/inventory';
import { GEMS, GemId } from './game/gems';
import { getTitleDef } from './game/titles';
import { playerSpriteUrl } from './game/sprites';
import AdminModal from './components/AdminModal';
import ShopModal from './components/ShopModal';
import ForgeModal from './components/ForgeModal';
import InventoryModal from './components/InventoryModal';
import HeroModal from './components/HeroModal';
import DungeonMapModal from './components/DungeonMapModal';
import HuntModal from './components/HuntModal';
import BattleModal from './components/BattleModal';
import DeliveryModal from './components/DeliveryModal';
import MiningModal from './components/MiningModal';
import WoodcuttingModal from './components/WoodcuttingModal';
import GardenModal from './components/GardenModal';
import ClaimModal from './components/ClaimModal';
import HuntRewardModal from './components/HuntRewardModal';
import QuestsModal from './components/QuestsModal';
import BattlePassModal from './components/BattlePassModal';
import { crossedMilestoneFloors, dungeonRunXp, getMilestoneReward, MAX_DUNGEON_FLOOR, milestoneXpBonus } from './game/dungeon';
import { RunRewards } from './game/waves';
import { DEFAULT_HUNTING_DEPTH, getHuntingZone, HuntingDepth, isDepthUnlocked, isZoneUnlocked, unlockedZoneIds } from './game/huntingZones';
import { nextHuntPouchTierDef } from './game/huntPouch';
import { getOreTier, isOreTierUnlocked } from './game/ores';
import { getWoodTier, isWoodTierUnlocked } from './game/woodcutting';
import { skillLevel } from './game/skills';
import { ExpeditionRewards, expeditionRewards, getExpedition } from './game/expedition';
import { isDeliveryReady } from './game/deliveries';
import { applyDeliveryAccept, applyDeliveryClaim, applyDeliveryReroll, applyDeliveryTicket, ensureDeliveryOffers } from './game/deliveries';
import { claimableCount, isClaimed, isComplete, QuestContext, QUESTS_ACHIEVEMENTS, QUESTS_DAILY } from './game/quests';
import TopHud from './components/TopHud';
import FirstViewTooltip from './components/FirstViewTooltip';
import TutorialOverlay from './components/TutorialOverlay';
import SettingsModal from './components/SettingsModal';
import Campfire from './components/Campfire';
import { initAudio, loadMuted, playSfx, setMuted } from './game/audio';
import Assets from './assets.json';
import { Locale, setLocale, setLocaleListener, t } from './locales';
import './App.css';

const gearText = (key: string): string => t(`gear.${key}`);

// First-view tooltips for the Camp side-rail icons — order matches the rail top-to-bottom. Admin (dev
// only) is deliberately excluded: it doesn't exist in a production build, so there's nothing to
// introduce to a real player. See FirstViewTooltip.tsx / SaveData.seenTooltips.
const TOOLTIP_IDS = ['mining', 'woodcutting', 'garden', 'hunt', 'expedition', 'battlepass', 'bag', 'quests', 'mute', 'settings'] as const;
const tooltipText = (id: string): string => t(`tooltips.${id}`);

function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave());

  const [shopOpen, setShopOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dungeonOpen, setDungeonOpen] = useState(false);
  const [huntOpen, setHuntOpen] = useState(false);
  const [battleFloor, setBattleFloor] = useState<number | null>(null);
  const [expeditionOpen, setExpeditionOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [woodOpen, setWoodOpen] = useState(false);
  const [gardenOpen, setGardenOpen] = useState(false);
  const [claimResult, setClaimResult] = useState<{ title: string; name: string; rewards: ExpeditionRewards } | null>(null);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [battlePassOpen, setBattlePassOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [, setLocaleVersion] = useState(0);
  const [muted, setMutedState] = useState<boolean>(() => loadMuted());
  const [cheatMode, setCheatMode] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [tooltipQueue, setTooltipQueue] = useState<string[]>(() => TOOLTIP_IDS.filter((id) => !save.seenTooltips.includes(id)));
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [tutorialStep, setTutorialStep] = useState<InitialTutorialStep | null>(() =>
    save.tutorial.initial === 'pending' || save.tutorial.initial === 'in_progress' ? save.tutorial.initialStep : null,
  );
  const [contextTutorial, setContextTutorial] = useState<ContextualTutorialId | null>(null);

  const saveRef = useRef(save);
  const cheatModeRef = useRef(false);

  const toastTimeout = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimeout.current) window.clearTimeout(toastTimeout.current);
    toastTimeout.current = window.setTimeout(() => setToast(null), 1600);
  };

  // Character XP is intentionally never shown as a number anywhere in the UI (see TopHud/HeroModal/
  // HuntModal/HuntRewardModal; DeliveryModal is the one exception: an order card shows the XP it pays) — a level-up toast is the only XP-gain feedback left,
  // so it's centralized here rather than duplicated at every xp-granting call site.
  const setSaveBoth = (s: SaveData) => {
    const prevLevel = playerLevel(saveRef.current.xp);
    const nextLevel = playerLevel(s.xp);
    saveRef.current = s;
    setSave(s);
    if (nextLevel > prevLevel) {
      playSfx('victory');
      showToast(t('ui.levelUp', { n: nextLevel }));
    }
  };

  const updateTutorial = (next: SaveData['tutorial']) => setSaveBoth({ ...saveRef.current, tutorial: next, seenWelcome: true });

  const advanceInitialTutorial = () => {
    const step = tutorialStep;
    if (!step) return;
    const next: Partial<Record<InitialTutorialStep, InitialTutorialStep>> = {
      intro: 'character',
      character: 'hunt',
      huntModal: 'dungeon',
      dungeon: 'forge',
      forge: 'final',
    };
    if (step === 'final') {
      const s = saveRef.current;
      setSaveBoth({ ...s, tutorial: { ...s.tutorial, initial: 'completed', initialStep: 'final' }, seenWelcome: true, seenTooltips: [...new Set([...s.seenTooltips, ...TOOLTIP_IDS])] });
      setTooltipQueue([]);
      setActiveTooltip(null);
      setTutorialStep(null);
      return;
    }
    const following = next[step];
    if (!following) return;
    if (step === 'huntModal') setHuntOpen(false);
    updateTutorial({ ...saveRef.current.tutorial, initial: 'in_progress', initialStep: following });
    setTutorialStep(following);
  };

  const skipInitialTutorial = () => {
    const s = saveRef.current;
    setSaveBoth({ ...s, tutorial: { ...s.tutorial, initial: 'skipped', initialStep: 'final', automatic: false }, seenWelcome: true, seenTooltips: [...new Set([...s.seenTooltips, ...TOOLTIP_IDS])] });
    setTooltipQueue([]);
    setActiveTooltip(null);
    setTutorialStep(null);
  };

  // Escape only dismisses the current visual layer. The saved step remains intact and reload/replay
  // can resume it; only the explicit Skip button changes the automatic-tutorial preference.
  const dismissInitialTutorial = () => setTutorialStep(null);

  const replayTutorial = () => {
    setHeroOpen(false);
    updateTutorial({ ...saveRef.current.tutorial, initial: 'pending', initialStep: 'intro' });
    setTutorialStep('intro');
  };

  const openContextTutorial = (id: ContextualTutorialId) => {
    const tutorial = saveRef.current.tutorial;
    if (tutorialStep || contextTutorial || !tutorial.automatic || (tutorial.initial !== 'completed' && tutorial.initial !== 'skipped') || tutorial.seen.includes(id)) return;
    setContextTutorial(id);
  };

  const closeContextTutorial = () => {
    if (!contextTutorial) return;
    const tutorial = saveRef.current.tutorial;
    updateTutorial({ ...tutorial, seen: tutorial.seen.includes(contextTutorial) ? tutorial.seen : [...tutorial.seen, contextTutorial] });
    setContextTutorial(null);
  };

  const skipAutomaticTutorials = () => {
    const s = saveRef.current;
    setSaveBoth({ ...s, tutorial: { ...s.tutorial, automatic: false }, seenWelcome: true, seenTooltips: [...new Set([...s.seenTooltips, ...TOOLTIP_IDS])] });
    setTooltipQueue([]);
    setActiveTooltip(null);
    setContextTutorial(null);
  };

  const dismissContextTutorial = () => setContextTutorial(null);

  // First-view tooltip sequencing: shows one at a time from tooltipQueue (staggered, so a fresh save
  // with everything unlocked doesn't dump 9 bubbles at once), marks each seen the instant it's
  // displayed (so a reload mid-display never re-shows it — "seen" means shown, not "fully read"), and
  // never blocks the icon underneath — the icon's own onClick still fires normally either way. Held
  // off entirely while a guided tutorial card is up, so the two introduction systems never compete.
  useEffect(() => {
    if (tutorialStep || contextTutorial || activeTooltip || tooltipQueue.length === 0) return;
    const staggerId = window.setTimeout(() => {
      const [next, ...rest] = tooltipQueue;
      setTooltipQueue(rest);
      setActiveTooltip(next);
      const s = saveRef.current;
      if (!s.seenTooltips.includes(next)) {
        setSaveBoth({ ...s, seenTooltips: [...s.seenTooltips, next] });
      }
    }, 700);
    return () => window.clearTimeout(staggerId);
  }, [tutorialStep, contextTutorial, activeTooltip, tooltipQueue]);

  useEffect(() => {
    if (!activeTooltip) return;
    const dismissId = window.setTimeout(() => setActiveTooltip(null), 3000);
    const onAnyClick = () => setActiveTooltip(null);
    window.addEventListener('click', onAnyClick, true);
    return () => {
      window.clearTimeout(dismissId);
      window.removeEventListener('click', onAnyClick, true);
    };
  }, [activeTooltip]);

  useEffect(() => {
    persistSave(save);
  }, [save]);

  useEffect(() => {
    setTunableListener(() => setVersion((v) => v + 1));
    return () => setTunableListener(null);
  }, []);

  useEffect(() => {
    setLocaleListener(() => setLocaleVersion((v) => v + 1));
    return () => setLocaleListener(null);
  }, []);

  useEffect(() => {
    void initAudio();
  }, []);

  useEffect(() => {
    // Admin panel is a dev-only tool — the listener must not even register in a production build.
    if (!import.meta.env.DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setAdminOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playSfx('click');
  };

  const openDungeon = () => {
    playSfx('click');
    setDungeonOpen(true);
  };

  const openHunt = () => {
    playSfx('click');
    setHuntOpen(true);
    if (tutorialStep === 'hunt') {
      updateTutorial({ ...saveRef.current.tutorial, initial: 'in_progress', initialStep: 'huntModal' });
      setTutorialStep('huntModal');
    }
  };

  // A "session" is one full Dungeon attempt (enter -> climb until death or voluntary retreat), capped
  // per-day (see freeSessionsPerDay/extraSessionShardCost below).
  const enterDungeon = () => {
    const s = saveRef.current;
    if (s.activeOreId) {
      showToast(t('mining.busyDungeon'));
      return;
    }
    if (s.activeWoodId) {
      showToast(t('woodcutting.busyOther'));
      return;
    }
    if (s.activeHuntingZone) {
      showToast(t('hunting.busyOther'));
      return;
    }
    const today = new Date().toDateString();
    const used = s.dungeonSessionsDay === today ? s.dungeonSessionsUsed : 0;
    const cost = T.dungeon.extraSessionShardCost;
    if (used >= T.dungeon.freeSessionsPerDay) {
      if (s.shards < cost) {
        showToast(t('dungeon.sessionsExhausted', { n: cost }));
        return;
      }
      setSaveBoth({ ...s, shards: s.shards - cost, dungeonSessionsDay: today, dungeonSessionsUsed: used + 1 });
      showToast(t('dungeon.extraSessionPaid', { n: cost }));
    } else {
      setSaveBoth({ ...s, dungeonSessionsDay: today, dungeonSessionsUsed: used + 1 });
    }
    playSfx('click');
    setDungeonOpen(false);
    setBattleFloor(s.highestDungeonFloor);
  };

  const finishRun = (startFloor: number, rewards: RunRewards, outcome: 'retreat' | 'defeat') => {
    const s = saveRef.current;
    const mats = { ...s.materials };
    for (const [mid, qty] of Object.entries(rewards.drops ?? {})) {
      mats[mid as MaterialId] = (mats[mid as MaterialId] ?? 0) + (qty as number);
    }
    const stages = Math.max(0, rewards.stages);
    const success = outcome === 'retreat' && stages > 0;
    const atCap = playerLevel(s.xp) >= 100;
    // Only the EQUIPPED weapon / armor instances wear down; every other copy is untouched.
    const worn = stages > 0 ? applyDurabilityLoss(s, DURABILITY_LOSS_PER_STAGE * stages) : s;
    // Floor checkpoint: every stage actually defeated this run is banked permanently, win or lose the
    // run overall — dying deep in a run no longer discards floors you already cleared to get there.
    // Only the one-time milestone loot below (gold/gems/title at 25/50/75/100) stays retreat-gated.
    const clearedFloor = stages > 0 ? Math.min(MAX_DUNGEON_FLOOR, startFloor + stages) : s.highestDungeonFloor;
    const nextFloor = Math.max(s.highestDungeonFloor, clearedFloor);
    const quests = { ...s.quests };
    let battlePassLevel = s.battlePassLevel;
    let battlePassXp = s.battlePassXp;
    if (stages > 0) {
      quests.daily = { ...quests.daily, kills: (quests.daily.kills ?? 0) + stages };
      quests.counters = { ...quests.counters, kills: (quests.counters.kills ?? 0) + stages };
      quests.counters.maxFloorCleared = Math.max(quests.counters.maxFloorCleared ?? 0, clearedFloor);
      ({ battlePassLevel, battlePassXp } = addBattlePassXp(s, T.battlePass.xpPerFloor * stages));
    }
    const subs = equippedSubstatTotals(s);
    const goldGain = Math.round(rewards.gold * (1 + subs.goldBonus / 100));
    const unlockedHuntingZones = Array.from(new Set([...s.unlockedHuntingZones, ...unlockedZoneIds(nextFloor)]));

    // Milestone (first-clear) rewards only ever apply to a successful retreat — dying still banks the
    // floor checkpoint above, but forfeits this run's shot at the milestone's bonus gold/gems/title.
    const crossed = success ? crossedMilestoneFloors(startFloor, stages, s.dungeonCheckpoints) : [];
    let gold = s.gold + goldGain;
    let gems = s.gems;
    // Per-clear gate-boss gem drop (waveRewards) — kept even on a defeat, same as its shards/drops.
    if (rewards.gems && Object.keys(rewards.gems).length > 0) {
      const g = { ...gems };
      for (const [gid, qty] of Object.entries(rewards.gems)) g[gid as GemId] = (g[gid as GemId] ?? 0) + (qty as number);
      gems = g;
    }
    let cosmetics = s.cosmetics;
    let oneTokenBalance = s.oneTokenBalance;
    let dungeonCheckpoints = s.dungeonCheckpoints;
    if (crossed.length > 0) {
      dungeonCheckpoints = [...s.dungeonCheckpoints, ...crossed];
      for (const floor of crossed) {
        const reward = getMilestoneReward(floor);
        if (!reward) continue;
        gold += reward.gold;
        const g = { ...gems };
        for (const [gid, qty] of Object.entries(reward.gems)) g[gid as GemId] = (g[gid as GemId] ?? 0) + (qty as number);
        gems = g;
        if (reward.titleId && !cosmetics.includes(reward.titleId)) cosmetics = [...cosmetics, reward.titleId];
        if (reward.oneTokenBalance) oneTokenBalance += reward.oneTokenBalance;
      }
    }
    const xpGain = dungeonRunXp(startFloor, stages) + milestoneXpBonus(startFloor, stages);

    setSaveBoth({
      ...s,
      gold,
      gems,
      cosmetics,
      oneTokenBalance,
      dungeonCheckpoints,
      materials: mats,
      shards: s.shards + rewards.shards,
      xp: atCap ? s.xp : s.xp + xpGain,
      victories: s.victories + (success ? 1 : 0),
      highestDungeonFloor: nextFloor,
      unlockedHuntingZones,
      gearInstances: worn.gearInstances,
      blessed: false,
      quests,
      battlePassLevel,
      battlePassXp,
    });
    playSfx(outcome === 'retreat' ? 'victory' : 'hit');
    setBattleFloor(null);
  };

  // `id` is a gear INSTANCE id.
  const repairItem = (id: string, blessed: boolean) => {
    const s = saveRef.current;
    const hit = resolveGearInstance(s, id);
    if (!hit) return;
    const next = applyRepair(s, id, blessed, effectiveRepairCost(s, hit.item.tier ?? 0, Date.now()));
    if (!next) return;
    playSfx('victory');
    setSaveBoth(next);
  };

  const buyGem = (id: GemId) => {
    const def = GEMS.find((g) => g.id === id);
    if (!def) return;
    const s = saveRef.current;
    if (s.shards < def.shardCost) return;
    playSfx('click');
    setSaveBoth({ ...s, shards: s.shards - def.shardCost, gems: { ...s.gems, [id]: (s.gems[id] ?? 0) + 1 } });
  };

  // Sockets belong to one gear INSTANCE.
  const socketGem = (instanceId: string, gemId: GemId) => {
    const next = applySocketGem(saveRef.current, instanceId, gemId);
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  const unsocketGem = (instanceId: string, index: number) => {
    const next = applyUnsocketGem(saveRef.current, instanceId, index);
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  // The board is filled/refreshed right before it is shown (offers are persisted, so a reload never reshuffles them).
  const openExpedition = () => {
    playSfx('click');
    const s = saveRef.current;
    const now = Date.now();
    const next = ensureDeliveryOffers(s, now, Math.random, isBattlePassActive(s, now));
    if (next !== s) setSaveBoth(next);
    setExpeditionOpen(true);
    openContextTutorial('deliveries');
  };

  const useAutoPotion = (id: ConsumableId) => {
    const s = saveRef.current;
    const qty = s.consumables[id] ?? 0;
    if (qty <= 0) return;
    setSaveBoth({ ...s, consumables: { ...s.consumables, [id]: qty - 1 } });
  };

  const craftPotion = (recipeId: string) => {
    const recipe = getPotionRecipe(recipeId);
    if (!recipe) return;
    const s = saveRef.current;
    if (s.gold < recipe.cost) return;
    if (playerLevel(s.xp) < recipe.requiredLevel) return;
    if (!hasMaterials(s.materials, recipe.input)) return;

    const mats = { ...s.materials };
    for (const [mid, count] of Object.entries(recipe.input)) {
      mats[mid as MaterialId] = (mats[mid as MaterialId] ?? 0) - (count as number);
    }

    playSfx('click');
    setSaveBoth({
      ...s,
      gold: s.gold - recipe.cost,
      materials: mats,
      consumables: { ...s.consumables, [recipe.id]: (s.consumables[recipe.id] ?? 0) + 1 },
      quests: {
        ...s.quests,
        daily: { ...s.quests.daily, forge: (s.quests.daily.forge ?? 0) + 1 },
      },
    });
    showToast(t('forge.toBag', { n: t(`consumables.${recipe.id}`) }));
  };

  const applyXpPotion = () => {
    const s = saveRef.current;
    const qty = s.consumables.xp_potion ?? 0;
    if (qty <= 0) return;
    const atCap = playerLevel(s.xp) >= 100;
    playSfx('victory');
    setSaveBoth({
      ...s,
      consumables: { ...s.consumables, xp_potion: qty - 1 },
      xp: atCap ? s.xp : s.xp + T.battle.xpPotionAmount,
    });
    showToast(`+${T.battle.xpPotionAmount} XP`);
  };

  // Damage elixirs (elixirs.ts): using one again while it is active refreshes the full duration from now rather than
  // stacking magnitude or extending additively, so the bonus itself stays constant. One pure transition, committed and
  // persisted at once; nothing happens without a unit.
  const drinkElixir = (id: ElixirId) => {
    const next = applyElixir(saveRef.current, id, Date.now());
    if (!next) return;
    playSfx('victory');
    commitSave(next);
    showToast(t(`consumables.${id}_active`));
  };

  const useConsumableManually = (id: string) => {
    if (id === 'xp_potion') applyXpPotion();
    else if (id === 'strength_elixir' || id === 'atk_elixir') drinkElixir(id);
  };

  const claimQuest = (id: string) => {
    const s = saveRef.current;
    const def = [...QUESTS_DAILY, ...QUESTS_ACHIEVEMENTS].find((q) => q.id === id);
    if (!def || isClaimed(def, s.quests)) return;
    const ctx: QuestContext = { cp: computeCP(s), maxRefine: questMaxRefine(s) };
    if (!isComplete(def, s.quests, ctx)) return;
    const quests = { ...s.quests };
    if (def.kind === 'daily') {
      quests.dailyClaimed = [...quests.dailyClaimed, id];
    } else {
      quests.claimed = [...quests.claimed, id];
    }
    setSaveBoth({ ...s, gold: s.gold + def.gold, shards: s.shards + def.shards, quests });
    playSfx('victory');
  };

  // Delivery orders (deliveries.ts): every handler is one pure transition on the latest save, committed at once.
  const acceptDelivery = (offerId: string) => {
    const now = Date.now();
    const next = applyDeliveryAccept(saveRef.current, offerId, now, Math.random, isBattlePassActive(saveRef.current, now));
    if (!next) {
      showToast(t('deliveries.cannotAccept'));
      return;
    }
    playSfx('click');
    setSaveBoth(next);
  };

  const claimDelivery = () => {
    const now = Date.now();
    const claim = applyDeliveryClaim(saveRef.current, now);
    if (!claim) return;
    playSfx('victory');
    setSaveBoth(ensureDeliveryOffers(claim.save, now, Math.random, isBattlePassActive(claim.save, now)));
    setClaimResult({
      title: t('deliveries.rewards'),
      name: t(`deliveries.dest_${claim.offer.arch}_${claim.offer.dest}`),
      rewards: { gold: claim.offer.gold, xp: claim.xpGained, shards: claim.offer.shards },
    });
  };

  const rerollDeliveries = () => {
    const s = saveRef.current;
    const now = Date.now();
    const next = applyDeliveryReroll(s, now, Math.random, isBattlePassActive(s, now));
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  const useDeliveryTicket = (ticketId: ConsumableId) => {
    const next = applyDeliveryTicket(saveRef.current, ticketId, Date.now());
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  // LEGACY: an Expedition started before delivery orders still finishes and pays the old way (nothing new can start).
  const claimExpedition = (index: number) => {
    const s = saveRef.current;
    const exp = s.expeditions[index];
    if (!exp || Date.now() < exp.endsAt) return;
    const def = getExpedition(exp.id);
    if (!def) return;
    const rewards = expeditionRewards(def);
    const atCap = playerLevel(s.xp) >= 100;
    setSaveBoth({
      ...s,
      gold: s.gold + rewards.gold,
      xp: atCap ? s.xp : s.xp + rewards.xp,
      shards: s.shards + rewards.shards,
      expeditions: s.expeditions.filter((_, i) => i !== index),
      quests: {
        ...s.quests,
        daily: { ...s.quests.daily, expeditions: (s.quests.daily.expeditions ?? 0) + 1 },
      },
    });
    playSfx('victory');
    setClaimResult({ title: t('expedition.rewards'), name: t(`expedition.${def.nameKey}`), rewards });
  };

  const useExpeditionTicket = (index: number, ticketId: ConsumableId) => {
    const s = saveRef.current;
    const exp = s.expeditions[index];
    const skipMs = EXPEDITION_TICKET_SKIP_MS[ticketId];
    if (!exp || !skipMs) return;
    if ((s.consumables[ticketId] ?? 0) < 1) return;
    playSfx('click');
    const expeditions = [...s.expeditions];
    expeditions[index] = { ...exp, endsAt: Math.max(Date.now(), exp.endsAt - skipMs) };
    setSaveBoth({ ...s, expeditions, consumables: { ...s.consumables, [ticketId]: (s.consumables[ticketId] ?? 0) - 1 } });
  };

  const startMining = (oreId: string) => {
    const s = saveRef.current;
    const tier = getOreTier(oreId);
    if (!tier || !isOreTierUnlocked(tier, skillLevel(s.skillXp.mining, 'mining')) || s.activeOreId === oreId) return;
    if (battleFloor !== null) {
      showToast(t('mining.busyBattle'));
      return;
    }
    if (s.activeWoodId) {
      showToast(t('woodcutting.busyOther'));
      return;
    }
    if (s.activeHuntingZone) {
      showToast(t('hunting.busyOther'));
      return;
    }
    playSfx('click');
    setSaveBoth({ ...s, activeOreId: oreId, lastMiningClaim: Date.now() });
  };

  const claimMining = () => {
    const s = saveRef.current;
    if (!s.activeOreId) return;
    const status = computeMiningStatus(s, Date.now());
    if (!status.oreId) return;
    playSfx('victory');
    const hours = status.pendingMs / (3600 * 1000);
    const { battlePassLevel, battlePassXp } = addBattlePassXp(s, Math.floor(hours * T.battlePass.xpPerMiningHour));
    setSaveBoth({
      ...s,
      gold: s.gold + status.goldReady,
      materials: { ...s.materials, [status.oreId]: (s.materials[status.oreId] ?? 0) + status.oreReady },
      skillXp: { ...s.skillXp, mining: s.skillXp.mining + status.oreReady * T.skills.xpPerUnit },
      activeOreId: null,
      lastMiningClaim: Date.now(),
      battlePassLevel,
      battlePassXp,
    });
    showToast(t('mining.readyOre', { n: status.oreReady }) + ' · ' + t('mining.readyGold', { n: status.goldReady }));
  };

  const cancelMining = () => {
    const s = saveRef.current;
    if (!s.activeOreId) return;
    playSfx('click');
    setSaveBoth({ ...s, activeOreId: null });
  };

  // Mirrors startMining/claimMining/cancelMining exactly — see woodcutting.ts/computeWoodcuttingStatus.
  const startWoodcutting = (woodId: string) => {
    const s = saveRef.current;
    const tier = getWoodTier(woodId);
    if (!tier || !isWoodTierUnlocked(tier, skillLevel(s.skillXp.woodcutting, 'woodcutting')) || s.activeWoodId === woodId) return;
    if (battleFloor !== null) {
      showToast(t('woodcutting.busyBattle'));
      return;
    }
    if (s.activeOreId) {
      showToast(t('mining.busyOther'));
      return;
    }
    if (s.activeHuntingZone) {
      showToast(t('hunting.busyOther'));
      return;
    }
    playSfx('click');
    setSaveBoth({ ...s, activeWoodId: woodId, lastWoodcuttingClaim: Date.now() });
  };

  const claimWoodcutting = () => {
    const s = saveRef.current;
    if (!s.activeWoodId) return;
    const status = computeWoodcuttingStatus(s, Date.now());
    if (!status.woodId) return;
    playSfx('victory');
    setSaveBoth({
      ...s,
      gold: s.gold + status.goldReady,
      materials: { ...s.materials, [status.woodId]: (s.materials[status.woodId] ?? 0) + status.woodReady },
      skillXp: { ...s.skillXp, woodcutting: s.skillXp.woodcutting + status.woodReady * T.skills.xpPerUnit },
      activeWoodId: null,
      lastWoodcuttingClaim: Date.now(),
    });
    showToast(t('woodcutting.readyWood', { n: status.woodReady }));
  };

  const cancelWoodcutting = () => {
    const s = saveRef.current;
    if (!s.activeWoodId) return;
    playSfx('click');
    setSaveBoth({ ...s, activeWoodId: null });
  };

  // Garden (see gardenActions.ts): every action is one pure transition, committed and persisted at once. A repeated
  // click finds the plot already planted / harvested and does nothing.
  const plantInPlots = (plantId: string, slotIndices: number[]) => {
    const next = applyPlant(saveRef.current, plantId, slotIndices, Date.now());
    if (!next) {
      showToast(t('garden.busy'));
      return;
    }
    playSfx('click');
    commitSave(next);
  };

  const harvestPlots = (slotIndices: number[]) => {
    const res = applyHarvest(saveRef.current, slotIndices, Date.now());
    if (!res) return;
    playSfx('victory');
    commitSave(res.save);
    const first = res.harvested[0];
    showToast(
      res.harvested.length === 1
        ? `${t('garden.harvest')} +${first.qty} ${t(`materials.mat_${first.material}`)}`
        : t('garden.harvestedMany', { n: res.harvested.length }),
    );
  };

  const uprootPlot = (slotIndex: number) => {
    const next = applyUproot(saveRef.current, slotIndex);
    if (!next) return;
    playSfx('click');
    commitSave(next);
  };

  // Hunting lifecycle (see huntLifecycle.ts): each step is ONE pure transition committed in one go and persisted right
  // away (not only by the save effect), so a reload can never land between a step's parts. The reward a stop produces
  // lives in the save (pendingHuntReward), not in React state.
  const commitSave = (next: SaveData) => {
    setSaveBoth(next);
    persistSave(next);
  };

  const startHunt = (zoneId: string, depth: HuntingDepth = DEFAULT_HUNTING_DEPTH) => {
    const s = saveRef.current;
    const zone = getHuntingZone(zoneId);
    if (!zone || !isZoneUnlocked(zone, s.highestDungeonFloor)) return;
    if (s.activeHuntingZone === zoneId && s.activeHuntingDepth === depth) return;
    if (!isDepthUnlocked(zone, depth, computeCP(s))) return;
    if (s.pendingHuntReward) {
      showToast(t('hunting.claimFirst'));
      return;
    }
    if (s.activeOreId) {
      showToast(t('mining.busyDungeon'));
      return;
    }
    if (s.activeWoodId) {
      showToast(t('woodcutting.busyOther'));
      return;
    }
    // While another session runs this only ENDS it and opens its reward (never a silent claim): the new zone is picked
    // after collecting.
    const next = requestHuntStart(s, zoneId, depth, Date.now());
    if (!next) return;
    playSfx('click');
    commitSave(next);
    if (s.activeHuntingZone && next.pendingHuntReward) showToast(t('hunting.switchClaimFirst'));
  };

  const stopHunt = () => {
    const next = applyHuntStop(saveRef.current, Date.now());
    if (!next) return;
    playSfx('click');
    commitSave(next);
  };

  const confirmHuntReward = () => {
    const pending = saveRef.current.pendingHuntReward;
    if (!pending) return;
    const next = applyHuntClaim(saveRef.current, pending.id);
    if (!next) return;
    playSfx('victory');
    commitSave(next);
    if (huntClaimBlocked(next)) showToast(t('hunting.bagFullWarning'));
  };

  const upgradeHuntPouch = () => {
    const s = saveRef.current;
    const next = nextHuntPouchTierDef(s.huntPouch.tier);
    if (!next || !next.cost) return;
    if (s.gold < next.cost.gold || !hasMaterials(s.materials, next.cost.materials)) return;
    playSfx('click');
    const materials = { ...s.materials };
    for (const [mid, need] of Object.entries(next.cost.materials)) {
      materials[mid as MaterialId] = (materials[mid as MaterialId] ?? 0) - (need as number);
    }
    setSaveBoth({ ...s, gold: s.gold - next.cost.gold, materials, huntPouch: { ...s.huntPouch, tier: next.tier } });
  };

  const activateBattlePass = () => {
    const s = saveRef.current;
    playSfx('click');
    const now = Date.now();
    const base = isBattlePassActive(s, now) && s.battlePassExpiresAt ? s.battlePassExpiresAt : now;
    const expiresAt = base + T.battlePass.durationDays * 24 * 3600 * 1000;
    setSaveBoth({
      ...s,
      hasBattlePass: true,
      battlePassExpiresAt: expiresAt,
      // A running Hunting session only gets the pass bonus (drops, longer cap) from the activation on.
      huntSession: s.huntSession ? withSessionWindow(s.huntSession, 'pass', { from: now, to: expiresAt }) : s.huntSession,
    });
    showToast(t('battlePass.activated'));
  };

  const applyBattlePassClaim = (s: SaveData, level: number, track: 'free' | 'premium'): SaveData | null => {
    if (level > s.battlePassLevel) return null;
    if (track === 'premium' && !isBattlePassActive(s, Date.now())) return null;
    if (s.claimedPassRewards[track].includes(level)) return null;
    const def = getBattlePassLevelDef(level);
    if (!def) return null;
    const reward = def[track];
    const materials = { ...s.materials };
    const consumables = { ...s.consumables };
    const gems = { ...s.gems };
    const cosmetics = [...s.cosmetics];
    let gold = s.gold;
    let shards = s.shards;
    let oneTokenBalance = s.oneTokenBalance;
    switch (reward.kind) {
      case 'gold':
        gold += reward.amount;
        break;
      case 'shards':
        shards += reward.amount;
        break;
      case 'material':
        if (reward.id) materials[reward.id as MaterialId] = (materials[reward.id as MaterialId] ?? 0) + reward.amount;
        break;
      case 'consumable':
        if (reward.id) consumables[reward.id as ConsumableId] = (consumables[reward.id as ConsumableId] ?? 0) + reward.amount;
        break;
      case 'gem':
        if (reward.id) gems[reward.id as GemId] = (gems[reward.id as GemId] ?? 0) + reward.amount;
        break;
      case 'oneToken':
        oneTokenBalance += reward.amount;
        break;
      case 'cosmetic':
        if (reward.id && !cosmetics.includes(reward.id)) cosmetics.push(reward.id);
        break;
    }
    return {
      ...s,
      gold,
      shards,
      materials,
      consumables,
      gems,
      cosmetics,
      oneTokenBalance,
      claimedPassRewards: { ...s.claimedPassRewards, [track]: [...s.claimedPassRewards[track], level] },
    };
  };

  const claimBattlePassLevel = (level: number, track: 'free' | 'premium') => {
    const next = applyBattlePassClaim(saveRef.current, level, track);
    if (!next) return;
    playSfx('victory');
    setSaveBoth(next);
  };

  const claimAllBattlePassRewards = () => {
    let s = saveRef.current;
    let claimedAny = false;
    for (let level = 1; level <= s.battlePassLevel; level++) {
      const freeNext = applyBattlePassClaim(s, level, 'free');
      if (freeNext) {
        s = freeNext;
        claimedAny = true;
      }
      const premiumNext = applyBattlePassClaim(s, level, 'premium');
      if (premiumNext) {
        s = premiumNext;
        claimedAny = true;
      }
    }
    if (!claimedAny) return;
    playSfx('victory');
    setSaveBoth(s);
  };

  const buyConsumable = (id: ConsumableId) => {
    const def = getConsumable(id);
    if (!def) return;
    const s = saveRef.current;
    if (s.gold < def.cost) return;
    const qty = s.consumables[id] ?? 0;
    if (qty >= CONSUMABLE_STACK) {
      showToast(t('shop.stackFull'));
      return;
    }
    if (qty === 0 && isBagFull(s)) {
      showToast(t('shop.bagFull'));
      return;
    }
    playSfx('click');
    setSaveBoth({
      ...s,
      gold: s.gold - def.cost,
      consumables: { ...s.consumables, [id]: qty + 1 },
      quests: {
        ...s.quests,
        daily: { ...s.quests.daily, purchases: (s.quests.daily.purchases ?? 0) + 1 },
      },
    });
  };

  const discardItem = (kind: 'gear' | 'material' | 'consumable', id: string) => {
    const s = saveRef.current;
    if (kind === 'material') {
      const mats = { ...s.materials };
      delete mats[id as MaterialId];
      setSaveBoth({ ...s, materials: mats });
    } else if (kind === 'consumable') {
      const cons = { ...s.consumables };
      cons[id as ConsumableId] = 0;
      setSaveBoth({ ...s, consumables: cons });
    } else if (s.gearInstances[id]) {
      // A weapon / armor INSTANCE: only that piece goes (never the equipped one); its gems return to the stock.
      const next = applyDiscardInstance(s, id);
      if (next) setSaveBoth(next);
    } else {
      // Stackable gear (relic / tool).
      const inv = { ...s.inventory };
      delete inv[id];
      setSaveBoth({ ...s, inventory: inv });
    }
    playSfx('click');
  };

  // `id` is a weapon / armor INSTANCE id (or a relic template id). The equipped piece can never be salvaged,
  // another copy of the same template can; socketed gems return to the stock.
  const salvageItem = (id: string) => {
    const result = applySalvage(saveRef.current, id);
    if (!result) return;
    playSfx('click');
    setSaveBoth(result.save);
    showToast(result.bonusGranted ? t('inventory.salvageBonus') : t('inventory.salvageDone'));
  };

  // A weapon / armor craft creates ONE new independent instance (its own rarity roll). Recipe ingredients that
  // are gear consume real instances: `consumedIds` is the selection the player confirmed in the Forge, otherwise
  // the cheapest unequipped copies (see gearInstances.planForgeIngredients). Their gems go back to the stock.
  const forgeItem = (id: string, consumedIds?: string[]) => {
    const item = getGear(id);
    if (!item) return;
    const s = saveRef.current;
    const result = applyForge(s, id, { level: playerLevel(s.xp), consumedIds });
    if (!result.ok) {
      if (result.reason === 'capacity') showToast(t('forge.gearFull', { n: maxGearInstances() }));
      return;
    }
    setSaveBoth(result.save);
    playSfx('victory');
    showToast(t('forge.toBag', { n: gearText(item.nameKey) }));
  };

  const refineMaterial = (recipeId: string) => {
    const recipe = getRefiningRecipe(recipeId);
    if (!recipe) return;
    const s = saveRef.current;
    if (s.gold < recipe.cost) return;
    if (playerLevel(s.xp) < recipe.requiredLevel) return;
    if (!hasMaterials(s.materials, recipe.input)) return;

    const mats = { ...s.materials };
    for (const [mid, count] of Object.entries(recipe.input)) {
      mats[mid as MaterialId] = (mats[mid as MaterialId] ?? 0) - (count as number);
    }
    mats[recipe.output] = (mats[recipe.output] ?? 0) + recipe.outputQty;

    playSfx('click');
    setSaveBoth({
      ...s,
      gold: s.gold - recipe.cost,
      materials: mats,
      quests: {
        ...s.quests,
        daily: { ...s.quests.daily, forge: (s.quests.daily.forge ?? 0) + 1 },
      },
    });
    showToast(t('forge.toBag', { n: t(`materials.mat_${recipe.output}`) }));
  };

  // Economic reforge (reforge.ts), per INSTANCE: rerolls only that piece's substats; all-or-nothing charge.
  const reforgeItem = (id: string) => {
    const next = applyReforge(saveRef.current, id);
    if (!next) return;
    setSaveBoth(next);
    playSfx('click');
    showToast(t('forge.reforged'));
  };

  // `id` is a gear INSTANCE id: only that piece changes level.
  const performUpgrade = (id: string, useCatalyst: boolean) => {
    const s = saveRef.current;
    const hit = resolveGearInstance(s, id);
    if (!hit) return;
    const result = applyUpgrade(s, id, useCatalyst);
    if (!result) return;
    setSaveBoth(result.save);
    if (result.success) {
      playSfx('victory');
      showToast(t('forge.upgradeOk', { n: gearText(hit.item.nameKey), m: result.level + 1 }));
    } else {
      playSfx('block');
      showToast(t('forge.upgradeFail'));
    }
  };

  const upgradeItem = (id: string) => performUpgrade(id, false);
  const upgradeItemWithCatalyst = (id: string) => performUpgrade(id, true);

  const updateAutoPotionSettings = (threshold: number, priority: 'small_first' | 'large_first') => {
    setSaveBoth({ ...saveRef.current, autoPotionThreshold: threshold, autoPotionPriority: priority });
  };

  const attrChange = (attr: 'str' | 'vit' | 'agi' | 'res', delta: number) => {
    const cur = saveRef.current[attr];
    const next = cur + delta;
    if (next < 0) return;
    const totalPoints = playerLevel(saveRef.current.xp) * 3;
    const spent = saveRef.current.str + saveRef.current.vit + saveRef.current.agi + saveRef.current.res;
    if (delta > 0 && spent + 1 > totalPoints) return;
    playSfx('click');
    setSaveBoth({ ...saveRef.current, [attr]: next });
  };

  const renameHero = (name: string) => {
    setSaveBoth({ ...saveRef.current, heroName: name });
  };

  const selectTitle = (id: string | null) => {
    const s = saveRef.current;
    if (id !== null && (!getTitleDef(id) || !s.cosmetics.includes(id))) return;
    playSfx('click');
    setSaveBoth({ ...s, activeTitle: id });
  };

  const adminAddGold = () => {
    playSfx('click');
    setSaveBoth({ ...saveRef.current, gold: saveRef.current.gold + 10000 });
  };

  const adminAddShards = () => {
    playSfx('click');
    setSaveBoth({ ...saveRef.current, shards: saveRef.current.shards + 50 });
  };

  const adminUnlockAll = () => {
    playSfx('click');
    const s = saveRef.current;
    const inv = { ...s.inventory };
    const gearInstances = { ...s.gearInstances };
    for (const g of GEAR.filter((x) => x.slot !== 'relic')) {
      if (isInstancedSlot(g.slot)) {
        if (!Object.values(gearInstances).some((i) => i.templateId === g.id)) {
          const inst = createGearInstance(g.id, { origin: 'admin', createdAt: Date.now() });
          gearInstances[inst.id] = inst;
        }
      } else {
        inv[g.id] = Math.max(inv[g.id] ?? 0, 1);
      }
    }
    setSaveBoth({ ...s, inventory: inv, gearInstances });
  };

  const adminToggleCheat = () => {
    setCheatMode((c) => {
      cheatModeRef.current = !c;
      return !c;
    });
  };

  const adminReset = () => {
    playSfx('click');
    const fresh = defaultSave();
    setSaveBoth(fresh);
    cheatModeRef.current = false;
    setCheatMode(false);
    setAdminOpen(false);
    setShopOpen(false);
  };

  // `id` is a weapon / armor INSTANCE id, or a template id for stackable gear (relic, tools).
  const equipGear = (id: string) => {
    const s = saveRef.current;
    if (s.gearInstances[id]) {
      const next = applyEquipInstance(s, id);
      if (!next) return;
      playSfx('click');
      setSaveBoth(next);
      return;
    }
    const item = getGear(id);
    if (!item || isInstancedSlot(item.slot) || (s.inventory[id] ?? 0) <= 0) return;
    if (s.equipped[item.slot] === id) return;
    playSfx('click');
    setSaveBoth({ ...s, equipped: { ...s.equipped, [item.slot]: id } });
  };

  // Weapon / armor slot -> empty ("bare hands", zero-stat starter); the piece stays in the bag.
  const unequipGear = (id: string) => {
    const s = saveRef.current;
    const hit = resolveGearInstance(s, id);
    if (hit) {
      playSfx('click');
      setSaveBoth(applyUnequipSlot(s, hit.item.slot as InstancedSlot));
      return;
    }
    const item = getGear(id);
    if (!item || isInstancedSlot(item.slot)) return;
    playSfx('click');
    setSaveBoth({ ...s, equipped: { ...s.equipped, [item.slot]: null } });
  };

  const heroSpriteUrl = playerSpriteUrl();

  return (
    <div className="game-root">
      <div className="stage" data-tv={version}>
        <div className="bg" style={{ backgroundImage: `url(${Assets.background.camp.url})` }} />
        <div className="vignette" />

        <TopHud
          save={save}
          spriteUrl={heroSpriteUrl}
          onOpenProfile={() => setHeroOpen(true)}
        />

        <Campfire />
        <div className="side-actions">
          <button
            className="side-btn"
            onClick={() => {
              playSfx('click');
              setMineOpen(true);
              openContextTutorial('mining');
            }}
            data-ui
          >
            <img className="pixel-icon" src="/assets/icons/nav_mining.png" alt="" />
            <FirstViewTooltip show={activeTooltip === 'mining'} label={tooltipText('mining')} />
          </button>
          <button
            className="side-btn"
            onClick={() => {
              playSfx('click');
              setWoodOpen(true);
              openContextTutorial('woodcutting');
            }}
            data-ui
          >
            🪓
            {computeWoodcuttingStatus(save, Date.now()).full && <span className="quests-badge">•</span>}
            <FirstViewTooltip show={activeTooltip === 'woodcutting'} label={tooltipText('woodcutting')} />
          </button>
          <button
            className="side-btn garden-btn"
            onClick={() => {
              playSfx('click');
              setGardenOpen(true);
              openContextTutorial('garden');
            }}
            data-ui
          >
            🌱
            {computeGardenStatuses(save, Date.now()).some((s) => s.ready) && <span className="quests-badge">•</span>}
            <FirstViewTooltip show={activeTooltip === 'garden'} label={tooltipText('garden')} />
          </button>
          <button className="side-btn hunt-btn" data-tutorial-target="hunt" onClick={openHunt} data-ui>
            🏹
            {!!save.activeHuntingZone && <span className="quests-badge">•</span>}
            <FirstViewTooltip show={activeTooltip === 'hunt'} label={tooltipText('hunt')} />
          </button>
          <button className="side-btn expedition-btn" onClick={openExpedition} data-ui>
            🏕️
            {(isDeliveryReady(save, Date.now()) || save.expeditions.some((e) => Date.now() >= e.endsAt)) && <span className="quests-badge">•</span>}
            <FirstViewTooltip show={activeTooltip === 'expedition'} label={tooltipText('expedition')} />
          </button>
          <button
            className="side-btn"
            onClick={() => {
              playSfx('click');
              setBattlePassOpen(true);
            }}
            data-ui
          >
            <img className="pixel-icon" src="/assets/icons/nav_battlepass.png" alt="" />
            <FirstViewTooltip show={activeTooltip === 'battlepass'} label={tooltipText('battlepass')} />
          </button>
          <button
            className="side-btn"
            onClick={() => {
              playSfx('click');
              setBagOpen(true);
              openContextTutorial('reforge');
            }}
            data-ui
          >
            <img className="pixel-icon" src="/assets/icons/nav_bag.png" alt="" />
            <FirstViewTooltip show={activeTooltip === 'bag'} label={tooltipText('bag')} />
          </button>
          <button
            className="side-btn quests-btn"
            onClick={() => {
              playSfx('click');
              setQuestsOpen(true);
            }}
            data-ui
          >
            <img className="pixel-icon" src="/assets/icons/nav_quests.png" alt="" />
            {claimableCount(save.quests, { cp: computeCP(save), maxRefine: questMaxRefine(save) }) > 0 && (
              <span className="quests-badge">
                {claimableCount(save.quests, { cp: computeCP(save), maxRefine: questMaxRefine(save) })}
              </span>
            )}
            <FirstViewTooltip show={activeTooltip === 'quests'} label={tooltipText('quests')} />
          </button>
          {import.meta.env.DEV && (
            <button className="side-btn" onClick={() => setAdminOpen(true)} data-ui>
              ⚙️
            </button>
          )}
          <button className="side-btn" onClick={toggleMute} data-ui>
            {muted ? '🔇' : '🔊'}
            <FirstViewTooltip show={activeTooltip === 'mute'} label={tooltipText('mute')} />
          </button>
          <button
            className="side-btn settings-btn"
            onClick={() => {
              playSfx('click');
              setSettingsOpen(true);
            }}
            aria-label={t('settings.title')}
            data-ui
          >
            ⚙️
            <FirstViewTooltip show={activeTooltip === 'settings'} label={tooltipText('settings')} />
          </button>
        </div>
        <div className="camp-actions">
          <button
            className="camp-side-btn"
            data-tutorial-target="forge"
            onClick={() => {
              playSfx('click');
              setForgeOpen(true);
              if (Object.values(saveRef.current.gearInstances).some((item) => (getGear(item.templateId)?.tier ?? 0) >= 1)) openContextTutorial('sockets');
            }}
            data-ui
          >
            {t('ui.forge')}
          </button>
          <button className="camp-main-btn" data-tutorial-target="dungeon" onClick={openDungeon} data-ui>
            {t('camp.enterArena')}
          </button>
          <button className="camp-side-btn" onClick={() => { playSfx('click'); setShopOpen(true); }} data-ui>
            {t('ui.shop')}
          </button>
        </div>
      </div>

      {shopOpen && (
        <ShopModal
          save={save}
          onBuyConsumable={buyConsumable}
          onBuyGem={buyGem}
          onClose={() => {
            playSfx('click');
            setShopOpen(false);
          }}
        />
      )}

      {forgeOpen && (
        <ForgeModal
          save={save}
          onForge={forgeItem}
          onRefine={refineMaterial}
          onCraftPotion={craftPotion}
          onUpgrade={upgradeItem}
          onUpgradeWithCatalyst={upgradeItemWithCatalyst}
          onRepair={repairItem}
          onSocket={socketGem}
          onUnsocket={unsocketGem}
          onClose={() => {
            playSfx('click');
            setForgeOpen(false);
          }}
        />
      )}

      {bagOpen && (
        <InventoryModal
          save={save}
          onEquip={equipGear}
          onUnequip={unequipGear}
          onDiscard={discardItem}
          onReforge={reforgeItem}
          onSalvage={salvageItem}
          onUseConsumable={useConsumableManually}
          onClose={() => {
            playSfx('click');
            setBagOpen(false);
          }}
        />
      )}

      {heroOpen && (
        <HeroModal
          save={save}
          onAttrChange={attrChange}
          onRename={renameHero}
          onEquip={equipGear}
          onUnequip={unequipGear}
          onSelectTitle={selectTitle}
          onUpgradePouch={upgradeHuntPouch}
          onClose={() => {
            playSfx('click');
            setHeroOpen(false);
          }}
        />
      )}

      {dungeonOpen && (
        <DungeonMapModal
          save={save}
          onEnterDungeon={enterDungeon}
          onUpdateAutoPotionSettings={updateAutoPotionSettings}
          onClose={() => {
            playSfx('click');
            setDungeonOpen(false);
          }}
        />
      )}

      {huntOpen && (
        <HuntModal
          save={save}
          onStartHunt={startHunt}
          onStopHunt={stopHunt}
          onClose={() => {
            playSfx('click');
            setHuntOpen(false);
          }}
        />
      )}

      {expeditionOpen && (
        <DeliveryModal
          save={save}
          passActive={isBattlePassActive(save, Date.now())}
          onAccept={acceptDelivery}
          onClaim={claimDelivery}
          onReroll={rerollDeliveries}
          onUseTicket={useDeliveryTicket}
          onClaimLegacy={claimExpedition}
          onUseLegacyTicket={useExpeditionTicket}
          onClose={() => {
            playSfx('click');
            setExpeditionOpen(false);
          }}
        />
      )}

      {mineOpen && (
        <MiningModal
          save={save}
          onStartOre={startMining}
          onClaim={claimMining}
          onCancel={cancelMining}
          onClose={() => {
            playSfx('click');
            setMineOpen(false);
          }}
        />
      )}

      {woodOpen && (
        <WoodcuttingModal
          save={save}
          onStartWood={startWoodcutting}
          onClaim={claimWoodcutting}
          onCancel={cancelWoodcutting}
          onClose={() => {
            playSfx('click');
            setWoodOpen(false);
          }}
        />
      )}

      {gardenOpen && (
        <GardenModal
          save={save}
          onPlant={plantInPlots}
          onHarvest={harvestPlots}
          onUproot={uprootPlot}
          onClose={() => {
            playSfx('click');
            setGardenOpen(false);
          }}
        />
      )}

      {claimResult && (
        <ClaimModal
          title={claimResult.title}
          name={claimResult.name}
          rewards={claimResult.rewards}
          onClose={() => {
            playSfx('click');
            setClaimResult(null);
          }}
        />
      )}

      {save.pendingHuntReward && (
        <HuntRewardModal
          reward={save.pendingHuntReward}
          pouch={save.huntPouch}
          subLevels={T.hunting.subLevels}
          onClaim={confirmHuntReward}
        />
      )}

      {questsOpen && (
        <QuestsModal
          save={save}
          onClaim={claimQuest}
          onClose={() => {
            playSfx('click');
            setQuestsOpen(false);
          }}
        />
      )}

      {battlePassOpen && (
        <BattlePassModal
          save={save}
          onActivate={activateBattlePass}
          onClaim={claimBattlePassLevel}
          onClaimAll={claimAllBattlePassRewards}
          onClose={() => {
            playSfx('click');
            setBattlePassOpen(false);
          }}
        />
      )}

      {battleFloor !== null && (
        <BattleModal
          save={save}
          startFloor={battleFloor}
          onRetreat={(rewards) => finishRun(battleFloor, rewards, 'retreat')}
          onDefeat={(rewards) => finishRun(battleFloor, rewards, 'defeat')}
          onUsePotion={useAutoPotion}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      {import.meta.env.DEV && adminOpen && (
        <AdminModal
          cheatMode={cheatMode}
          onGold={adminAddGold}
          onShards={adminAddShards}
          onUnlock={adminUnlockAll}
          onToggleCheat={adminToggleCheat}
          onReset={adminReset}
          onClose={() => setAdminOpen(false)}
        />
      )}

      {tutorialStep && (
        <TutorialOverlay
          step={tutorialStep}
          onAdvance={advanceInitialTutorial}
          onSkip={skipInitialTutorial}
          onDismiss={dismissInitialTutorial}
          requiresInteraction={tutorialStep === 'hunt'}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          muted={muted}
          onChangeLocale={(locale: Locale) => setLocale(locale)}
          onToggleSound={toggleMute}
          onReplayTutorial={() => {
            setSettingsOpen(false);
            replayTutorial();
          }}
          onClose={() => {
            playSfx('click');
            setSettingsOpen(false);
          }}
        />
      )}
      {contextTutorial && <TutorialOverlay step={contextTutorial} onAdvance={closeContextTutorial} onSkip={skipAutomaticTutorials} onDismiss={dismissContextTutorial} />}
    </div>
  );
}

export default App;
