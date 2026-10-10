import { useCallback, useEffect, useRef, useState } from 'react';
import T, { setTunableListener } from './game/tunables';
import {
  addBattlePassXp,
  computeCP,
  computeGardenStatuses,
  isBuffActive,
  computeWoodcuttingStatus,
  defaultSave,
  effectiveRepairCost,
  isBattlePassActive,
  playerLevel,
  ContextualTutorialId,
  InitialTutorialStep,
  SaveData,
} from './game/engine';
import { SaveConflictError, SaveRepository } from './game/saveRepository';
import { useAuth } from './auth/AuthContext';
import { applyHuntClaim, applyHuntStop, huntClaimBlocked, planHuntClaim, requestHuntStart } from './game/huntLifecycle';
import { addUniqueInstance } from './game/uniques';
import { applyFertilizer, applyHarvest, applyPlant, applyUproot } from './game/gardenActions';
import { applyElixir, applyWhetstoneOil, ElixirId, isBuffItem } from './game/elixirs';
import { goldMultiplier } from './game/buffs';
import { withSessionWindow } from './game/huntSession';
import { applyBattlePassClaim } from './game/battlepass';
import { applyBuyConsumable, applyCraftPotion, applyRefine, CraftFailure } from './game/craftActions';
import { DURABILITY_LOSS_PER_STAGE, GEAR, getGear, isInstancedSlot } from './game/gear';
import { applyReforge } from './game/reforge';
import {
  InstancedSlot,
  applyDurabilityLoss,
  applyEquipInstance,
  applyForge,
  applyRepair,
  applySalvage,
  salvageBlockReason,
  applySocketGem,
  applyUnequipSlot,
  applyUnsocketGem,
  applyUpgrade,
  createGearInstance,
  equippedSubstatTotals,
  questMaxRefine,
  resolveGearInstance,
} from './game/gearInstances';
import { getRefiningRecipe } from './game/refining';
import { ConsumableId, EXPEDITION_TICKET_SKIP_MS } from './game/consumables';
import { addForced, canAddInstances, expandInventory, inventoryCapacity } from './game/inventory';
import { StackKind, applyStashMove, applyStashUpgrade, applyStoreAll, bagCount, stashCount } from './game/stash';
import { applyMerchantSell, SellKind } from './game/merchant';
import { applyDiscard } from './game/bagActions';
import { ItemUse } from './game/itemUses';
import { RefiningStation, getRefiningRecipe as refiningRecipeById } from './game/refining';
import { BagContext } from './components/bagContext';
import { GEMS, GemId } from './game/gems';
import { getTitleDef } from './game/titles';
import { playerSpriteUrl } from './game/sprites';
import AdminModal from './components/AdminModal';
import ShopModal from './components/ShopModal';
import ForgeModal, { ForgeTab } from './components/ForgeModal';
import OficiosView from './components/OficiosView';
import InventoryModal from './components/InventoryModal';
import PersonagemView from './components/PersonagemView';
import DungeonMapModal from './components/DungeonMapModal';
import HuntModal from './components/HuntModal';
import HuntNavMini from './components/HuntNavMini';
import BattleModal from './components/BattleModal';
import DeliveryModal from './components/DeliveryModal';
import MiningModal from './components/MiningModal';
import WoodcuttingModal from './components/WoodcuttingModal';
import GardenModal from './components/GardenModal';
import { applyClaimGathering, applyStartGathering } from './game/gathering';
import ClaimModal from './components/ClaimModal';
import HuntRewardModal from './components/HuntRewardModal';
import QuestsModal from './components/QuestsModal';
import BattlePassModal from './components/BattlePassModal';
import { crossedMilestoneFloors, dungeonRunXp, getMilestoneReward, MAX_DUNGEON_FLOOR, milestoneXpBonus } from './game/dungeon';
import { RunRewards } from './game/waves';
import { DEFAULT_HUNTING_DEPTH, getHuntingZone, HuntingDepth, isDepthUnlocked, isZoneUnlocked, unlockedZoneIds } from './game/huntingZones';
import { ExpeditionRewards, expeditionRewards, getExpedition } from './game/expedition';
import { isDeliveryReady } from './game/deliveries';
import { applyDeliveryAccept, applyDeliveryClaim, applyDeliveryReroll, applyDeliveryTicket, ensureDeliveryOffers } from './game/deliveries';
import { claimableCount, isClaimed, isComplete, QuestContext, QUESTS_ACHIEVEMENTS, QUESTS_DAILY } from './game/quests';
import TutorialOverlay from './components/TutorialOverlay';
import SettingsModal from './components/SettingsModal';
import DesktopSidebar, { DesktopNavGroup } from './components/DesktopSidebar';
import DesktopTopbar from './components/DesktopTopbar';
import DesktopHome from './components/DesktopHome';
import MobileDrawer from './components/MobileDrawer';
import useIsDesktop from './hooks/useIsDesktop';
import { initAudio, loadMuted, playSfx, setMuted } from './game/audio';
import { fmtNum, Locale, setLocale, setLocaleListener, t } from './locales';
import './App.css';

const gearText = (key: string): string => t(`gear.${key}`);

// First-view tooltips for the Camp side-rail icons — order matches the rail top-to-bottom. Admin (dev
// only) is deliberately excluded: it doesn't exist in a production build, so there's nothing to
// introduce to a real player. See FirstViewTooltip.tsx / SaveData.seenTooltips.
const TOOLTIP_IDS = ['mining', 'woodcutting', 'garden', 'hunt', 'expedition', 'battlepass', 'bag', 'quests', 'mute', 'settings'] as const;

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'offline';

interface AppProps {
  repository: SaveRepository;
  initialSave: SaveData;
  initialRevision: number;
}

function App({ repository, initialSave, initialRevision }: AppProps) {
  const { user, signOut, configured } = useAuth();
  const [save, setSave] = useState<SaveData>(() => initialSave);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const revisionRef = useRef(initialRevision);
  const dirtyRef = useRef(false);
  const flushTimeoutRef = useRef<number | null>(null);

  const [shopOpen, setShopOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // "Personagem" and "Ofícios" are main-content areas now (sidebar swaps them in, like Home),
  // not modals — see PersonagemView.tsx / OficiosView.tsx.
  const [activeView, setActiveView] = useState<'home' | 'personagem' | 'oficios'>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  // The pending hunt reward screen can be set aside to make room in the inventory first (shortcut from the screen itself); the hunt screen brings it back.
  const [rewardHidden, setRewardHidden] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Forces a re-render when a dev-tunable changes (Admin panel) — nothing reads the value itself.
  const [, setVersion] = useState(0);
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
    setActiveView('home');
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

  // Phase 1 persistence: debounced, conflict-aware save through whichever repository GameShell resolved
  // (local or Supabase — see saveRepository.ts). This still sends the WHOLE SaveData object as-is on
  // every flush, same as the old direct-localStorage write; only WHERE it's stored changed, not who's
  // trusted to compute gold/gear/RNG/timers (that's a later phase, see docs/backend-phase1.md).
  const flushSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveStatus('saving');
    try {
      const result = await repository.save(saveRef.current, revisionRef.current);
      revisionRef.current = result.revision;
      setSaveStatus('saved');
    } catch (err) {
      if (err instanceof SaveConflictError) {
        // Another tab/device saved first — the server always wins (§18/§21): reload its current state
        // rather than retry-and-clobber it.
        try {
          const fresh = await repository.load();
          if (fresh) {
            saveRef.current = fresh.save;
            revisionRef.current = fresh.revision;
            setSave(fresh.save);
          }
        } catch {
          /* keep local state; next flush attempt will surface the same conflict */
        }
        setSaveStatus('error');
        showToast(t('sync.conflict'));
      } else {
        // Network/transient failure: leave it dirty so the next debounce tick (or the online-event
        // handler below) retries instead of silently dropping the change.
        dirtyRef.current = true;
        setSaveStatus(navigator.onLine ? 'error' : 'offline');
      }
    }
  }, [repository]);

  useEffect(() => {
    dirtyRef.current = true;
    setSaveStatus((s) => (s === 'saving' ? s : 'dirty'));
    if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    // §19: debounce autosave instead of firing a request per React state tick.
    flushTimeoutRef.current = window.setTimeout(() => {
      void flushSave();
    }, 800);
    return () => {
      if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    };
  }, [save, flushSave]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (dirtyRef.current) void flushSave();
    };
    const onOnline = () => void flushSave();
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('online', onOnline);
    };
  }, [flushSave]);

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

  // Escape closes the top-most open modal (reverse of render order below). Deliberately inert while a
  // dungeon run is on screen (a stray key must never retreat/abandon it), while the mandatory hunt-reward
  // claim is up, and while a tutorial overlay is visible (it handles Escape itself). Nested layers inside
  // a modal (garden picker, bag-expansion dialog) consume the key first via their own document listeners.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (tutorialStep || contextTutorial || battleFloor !== null || (save.pendingHuntReward && !rewardHidden)) return;
      const layers: Array<[boolean, () => void]> = [
        [settingsOpen, () => setSettingsOpen(false)],
        [import.meta.env.DEV && adminOpen, () => setAdminOpen(false)],
        [battlePassOpen, () => setBattlePassOpen(false)],
        [questsOpen, () => setQuestsOpen(false)],
        [claimResult !== null, () => setClaimResult(null)],
        [gardenOpen, () => setGardenOpen(false)],
        [woodOpen, () => setWoodOpen(false)],
        [mineOpen, () => setMineOpen(false)],
        [expeditionOpen, () => setExpeditionOpen(false)],
        [huntOpen, () => setHuntOpen(false)],
        [dungeonOpen, () => setDungeonOpen(false)],
        [bagOpen, () => setBagOpen(false)],
        [forgeOpen, () => setForgeOpen(false)],
        [shopOpen, () => setShopOpen(false)],
      ];
      const top = layers.find(([open]) => open);
      if (!top) return;
      e.preventDefault();
      playSfx('click');
      top[1]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    tutorialStep,
    contextTutorial,
    battleFloor,
    save.pendingHuntReward,
    rewardHidden,
    settingsOpen,
    adminOpen,
    battlePassOpen,
    questsOpen,
    claimResult,
    gardenOpen,
    woodOpen,
    mineOpen,
    expeditionOpen,
    huntOpen,
    dungeonOpen,
    bagOpen,
    forgeOpen,
    shopOpen,
  ]);

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
    setRewardHidden(false);
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
    // A finished run never refuses its loot: the drops go in even over the limit (the bag supports being over capacity until the player makes room).
    const looted = addForced(s, { materials: rewards.drops ?? {} });
    const stages = Math.max(0, rewards.stages);
    const success = outcome === 'retreat' && stages > 0;
    const atCap = playerLevel(s.xp) >= 100;
    // Only the EQUIPPED weapon / armor instances wear down; every other copy is untouched.
    const worn = stages > 0 ? applyDurabilityLoss(s, DURABILITY_LOSS_PER_STAGE * stages) : s;
    // Biome-boss unique pieces (uniques.ts) become stored gear instances. A defeat keeps them like the boss gem; a full bag never costs the drop (the
    // Mochila may briefly show over capacity until the player frees a slot).
    let delivered = worn;
    for (const drop of rewards.uniques ?? []) delivered = addUniqueInstance(delivered, drop, `dg${startFloor}_${Date.now()}`, Date.now());
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
    // Gear goldBonus (capped inside equippedSubstatTotals) and the Fortune Tonic add up, see buffs.ts goldMultiplier.
    const goldGain = Math.round(rewards.gold * goldMultiplier(subs.goldBonus, isBuffActive(s, 'fortune', Date.now())));
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
      }
    }
    const xpGain = dungeonRunXp(startFloor, stages) + milestoneXpBonus(startFloor, stages);

    setSaveBoth({
      ...s,
      gold,
      gems,
      cosmetics,
      dungeonCheckpoints,
      materials: looted.materials,
      shards: s.shards + rewards.shards,
      xp: atCap ? s.xp : s.xp + xpGain,
      victories: s.victories + (success ? 1 : 0),
      highestDungeonFloor: nextFloor,
      unlockedHuntingZones,
      gearInstances: delivered.gearInstances,
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

  // A craft / purchase that does not fit the inventory is refused with a message and charges nothing (craftActions.ts).
  const craftBlockedToast = (reason: CraftFailure | undefined) => {
    if (reason === 'bag') showToast(t('inventory.bagFullAction'));
    else if (reason === 'stack') showToast(t('shop.stackFull'));
  };

  const craftPotion = (recipeId: string) => {
    const res = applyCraftPotion(saveRef.current, recipeId);
    if (!res.ok || !res.save) {
      craftBlockedToast(res.reason);
      return;
    }
    playSfx('click');
    setSaveBoth(res.save);
    showToast(t('forge.toBag', { n: t(`consumables.${recipeId}`) }));
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

  // Whetstone Oil (elixirs.ts): +30 durability on the equipped weapon and armor, one unit, nothing spent when both are already at full durability.
  const oilGear = () => {
    const next = applyWhetstoneOil(saveRef.current);
    if (!next) {
      showToast(t('consumables.whetstone_oil_full'));
      return;
    }
    playSfx('victory');
    commitSave(next);
    showToast(t('consumables.whetstone_oil_active'));
  };

  const useConsumableManually = (id: string) => {
    if (id === 'xp_potion') applyXpPotion();
    else if (isBuffItem(id)) drinkElixir(id);
    else if (id === 'whetstone_oil') oilGear();
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
    // Switching tiers collects the running session first (gathering.ts), so nothing mined is thrown away.
    const started = applyStartGathering(s, 'mining', oreId, Date.now());
    if (!started) return;
    playSfx('click');
    setSaveBoth(started.save);
    if (started.claimed) showToast(gatherToast(started.claimed.units, started.claimed.leftBehind, 'mining.readyOre'));
  };

  // What a collect says: the units that came in and, spelled out, the ones the inventory had no room for (gathering.ts leaves them behind).
  const gatherToast = (units: number, leftBehind: number, key: string, gold = 0): string =>
    t(key, { n: units - leftBehind }) +
    (gold > 0 ? ' · ' + t('mining.readyGold', { n: gold }) : '') +
    (leftBehind > 0 ? ' · ' + t('inventory.leftBehind', { n: fmtNum(leftBehind) }) : '');

  const claimMining = () => {
    const claim = applyClaimGathering(saveRef.current, 'mining', Date.now());
    if (!claim) return;
    playSfx('victory');
    setSaveBoth(claim.save);
    showToast(gatherToast(claim.units, claim.leftBehind, 'mining.readyOre', claim.gold));
  };

  const cancelMining = () => {
    const s = saveRef.current;
    if (!s.activeOreId) return;
    playSfx('click');
    setSaveBoth({ ...s, activeOreId: null });
  };

  // Mirrors startMining/claimMining/cancelMining exactly — see gathering.ts and woodcutting.ts/computeWoodcuttingStatus.
  const startWoodcutting = (woodId: string) => {
    const s = saveRef.current;
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
    const started = applyStartGathering(s, 'woodcutting', woodId, Date.now());
    if (!started) return;
    playSfx('click');
    setSaveBoth(started.save);
    if (started.claimed) showToast(gatherToast(started.claimed.units, started.claimed.leftBehind, 'woodcutting.readyWood'));
  };

  const claimWoodcutting = () => {
    const claim = applyClaimGathering(saveRef.current, 'woodcutting', Date.now());
    if (!claim) return;
    playSfx('victory');
    setSaveBoth(claim.save);
    showToast(gatherToast(claim.units, claim.leftBehind, 'woodcutting.readyWood'));
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
    if (res.harvested.length === 0) {
      showToast(t('garden.bagFull'));
      return;
    }
    playSfx('victory');
    commitSave(res.save);
    const first = res.harvested[0];
    const done =
      res.harvested.length === 1
        ? `${t('garden.harvest')} +${first.qty} ${t(`materials.mat_${first.material}`)}`
        : t('garden.harvestedMany', { n: res.harvested.length });
    showToast(res.blocked.length > 0 ? `${done} · ${t('garden.bagFull')}` : done);
  };

  const fertilizePlot = (slotIndex: number) => {
    const next = applyFertilizer(saveRef.current, slotIndex, Date.now());
    if (!next) return;
    playSfx('click');
    commitSave(next);
    showToast(t('garden.fertilizeToast'));
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
    dirtyRef.current = true;
    if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    void flushSave();
  };

  // §22: try to flush whatever's pending before actually signing out, so a quick "sign out right after
  // an action" can't lose that action. Best-effort — signOut still proceeds even if the flush fails.
  const handleSignOut = async () => {
    if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    dirtyRef.current = true;
    try {
      await flushSave();
    } catch {
      /* proceed with sign-out regardless; nothing server-side is deleted either way */
    }
    await signOut();
  };

  const startHunt = (zoneId: string, depth: HuntingDepth = DEFAULT_HUNTING_DEPTH) => {
    const s = saveRef.current;
    const zone = getHuntingZone(zoneId);
    if (!zone || !isZoneUnlocked(zone, s.highestDungeonFloor)) return;
    if (s.activeHuntingZone === zoneId && s.activeHuntingDepth === depth) return;
    if (!isDepthUnlocked(zone, depth, computeCP(s))) return;
    if (s.pendingHuntReward) {
      setRewardHidden(false);
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
    const plan = planHuntClaim(saveRef.current, pending);
    const next = applyHuntClaim(saveRef.current, pending.id);
    if (!next) return;
    playSfx('victory');
    commitSave(next);
    setRewardHidden(false);
    // Uniques (and units owed from before the inventory rule) the bag had no room for stay pending (held); drops without room are gone and said so.
    const lostUnits = plan.leftBehind.reduce((sum, i) => sum + i.count, 0);
    if (huntClaimBlocked(next)) showToast(t('hunting.uniquesHeldToast'));
    else if (lostUnits > 0) showToast(t('hunting.leftBehindToast', { n: fmtNum(lostUnits) }));
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

  // A Pass reward that is an item must fit the inventory; if it does not it stays claimable (battlepass.ts) and the player is told.
  const claimBattlePassLevel = (level: number, track: 'free' | 'premium') => {
    const res = applyBattlePassClaim(saveRef.current, level, track, Date.now());
    if (res.blocked) showToast(t('inventory.bagFullAction'));
    if (!res.save) return;
    playSfx('victory');
    setSaveBoth(res.save);
  };

  const claimAllBattlePassRewards = () => {
    let s = saveRef.current;
    let claimedAny = false;
    let blocked = false;
    const now = Date.now();
    for (let level = 1; level <= s.battlePassLevel; level++) {
      for (const track of ['free', 'premium'] as const) {
        const res = applyBattlePassClaim(s, level, track, now);
        if (res.blocked) blocked = true;
        if (res.save) {
          s = res.save;
          claimedAny = true;
        }
      }
    }
    if (blocked) showToast(t('inventory.bagFullAction'));
    if (!claimedAny) return;
    playSfx('victory');
    setSaveBoth(s);
  };

  const buyConsumable = (id: ConsumableId) => {
    const res = applyBuyConsumable(saveRef.current, id);
    if (!res.ok || !res.save) {
      if (res.reason === 'bag') showToast(t('shop.bagFull'));
      else craftBlockedToast(res.reason);
      return;
    }
    playSfx('click');
    setSaveBoth(res.save);
  };

  // Descartar (bagActions.ts): part or all of a stack, or one stored gear instance; the screen has already asked for the confirmation.
  const discardItem = (kind: 'gear' | 'material' | 'consumable', id: string, qty: number | 'all' = 'all') => {
    const s = saveRef.current;
    const next = s.gearInstances[id] ? applyDiscard(s, 'instance', id) : applyDiscard(s, kind, id, qty);
    if (!next) return;
    setSaveBoth(next);
    playSfx('click');
  };

  // Baú (stash.ts): moving is partial by nature (what the destination has room for); say so when part stayed behind.
  const moveStash = (dir: 'store' | 'take', kind: StackKind, id: string, qty: number | 'all') => {
    const s = saveRef.current;
    const r = applyStashMove(s, dir, kind, id, qty);
    if (r.moved <= 0) {
      showToast(t(dir === 'store' ? 'stash.fullToast' : 'stash.bagFullToast'));
      return;
    }
    playSfx('click');
    setSaveBoth(r.save);
    const before = dir === 'store' ? bagCount(s, kind, id) : stashCount(s, kind, id);
    if (r.moved < (qty === 'all' ? before : Math.min(qty, before))) showToast(t(dir === 'store' ? 'stash.partialStore' : 'stash.partialTake', { n: fmtNum(r.moved) }));
  };

  const storeAllMaterials = () => {
    const r = applyStoreAll(saveRef.current, 'material');
    if (r.moved <= 0) {
      showToast(t('stash.fullToast'));
      return;
    }
    playSfx('click');
    setSaveBoth(r.save);
    showToast(t('stash.stored', { n: fmtNum(r.moved) }));
  };

  const upgradeStash = () => {
    const next = applyStashUpgrade(saveRef.current);
    if (!next) {
      showToast(t('stash.upgradeMissing'));
      return;
    }
    playSfx('victory');
    setSaveBoth(next);
    showToast(t('stash.upgraded', { n: next.stash.level }));
  };

  // Vender ao mercador (merchant.ts): a low price and a daily budget; the toast says what it paid, or that the budget is spent.
  const sellItem = (kind: SellKind, id: string, qty: number | 'all') => {
    const r = applyMerchantSell(saveRef.current, kind, id, qty, Date.now());
    if (!r.ok || !r.save) {
      showToast(t(r.reason === 'budget' ? 'merchant.budgetSpent' : 'merchant.cannotSell'));
      return;
    }
    playSfx('victory');
    setSaveBoth(r.save);
    showToast(r.capped ? t('merchant.soldCapped', { n: fmtNum(r.units ?? 0), g: fmtNum(r.gold ?? 0) }) : t('merchant.sold', { n: fmtNum(r.units ?? 0), g: fmtNum(r.gold ?? 0) }));
  };

  // "Usar em..." from an item: open the screen that consumes it, focused on the first recipe that does.
  const [forgeFocus, setForgeFocus] = useState<{ tab: ForgeTab; itemId?: string } | null>(null);
  const [oficiosFocus, setOficiosFocus] = useState<{ category: RefiningStation | 'potions'; recipeId: string } | null>(null);
  const openUse = (use: ItemUse) => {
    playSfx('click');
    const first = use.refs[0];
    if (use.kind === 'forge' || use.kind === 'upgrade') {
      setBagOpen(false);
      setForgeFocus({ tab: use.kind === 'forge' ? 'forge' : 'upgrade', itemId: use.kind === 'forge' ? first : undefined });
      setForgeOpen(true);
    } else if (use.kind === 'refine' || use.kind === 'alchemy') {
      setBagOpen(false);
      setOficiosFocus({ category: use.kind === 'alchemy' ? 'potions' : refiningRecipeById(first)?.station ?? 'furnace', recipeId: first });
      setActiveView('oficios');
    } else if (use.kind === 'delivery') {
      setBagOpen(false);
      openExpedition();
    } else if (use.kind === 'garden') {
      setBagOpen(false);
      setGardenOpen(true);
    }
  };

  // `id` is a weapon / armor INSTANCE id (or a relic template id). The equipped piece can never be salvaged,
  // another copy of the same template can; socketed gems return to the stock.
  const salvageItem = (id: string) => {
    const result = applySalvage(saveRef.current, id);
    if (!result) {
      if (salvageBlockReason(saveRef.current, id) === 'bag') showToast(t('inventory.salvageBagFull'));
      return;
    }
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
      if (result.reason === 'capacity') showToast(t('forge.gearFull', { n: inventoryCapacity(s) }));
      return;
    }
    setSaveBoth(result.save);
    playSfx('victory');
    showToast(t('forge.toBag', { n: gearText(item.nameKey) }));
  };

  const refineMaterial = (recipeId: string) => {
    const res = applyRefine(saveRef.current, recipeId);
    if (!res.ok || !res.save) {
      craftBlockedToast(res.reason);
      return;
    }
    playSfx('click');
    setSaveBoth(res.save);
    const output = getRefiningRecipe(recipeId)?.output;
    if (output) showToast(t('forge.toBag', { n: t(`materials.mat_${output}`) }));
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

  // Weapon / armor slot -> empty ("bare hands", zero-stat starter); the piece goes back into the bag —
  // which means it now needs a free slot: an equipped instance is free, a stored one is not.
  const unequipGear = (id: string) => {
    const s = saveRef.current;
    const hit = resolveGearInstance(s, id);
    if (hit) {
      if (!canAddInstances(s, 1)) {
        showToast(t('inventory.bagFullUnequip'));
        return;
      }
      playSfx('click');
      setSaveBoth(applyUnequipSlot(s, hit.item.slot as InstancedSlot));
      return;
    }
    const item = getGear(id);
    if (!item || isInstancedSlot(item.slot)) return;
    playSfx('click');
    setSaveBoth({ ...s, equipped: { ...s.equipped, [item.slot]: null } });
  };

  const expandInventoryBag = () => {
    const s = saveRef.current;
    const next = expandInventory(s);
    if (!next) {
      showToast(t('inventory.expandFailed'));
      return;
    }
    playSfx('click');
    setSaveBoth(next);
    showToast(t('inventory.expanded', { n: next.inventoryCapacity }));
  };

  const heroSpriteUrl = playerSpriteUrl();
  const isDesktop = useIsDesktop();

  const closeDrawer = () => setDrawerOpen(false);

  const desktopNavGroups: DesktopNavGroup[] = [
    {
      key: 'main',
      items: [
        { key: 'hero', icon: '🧝', label: t('nav.hero'), active: activeView === 'personagem', onClick: () => { closeDrawer(); playSfx('click'); setActiveView('personagem'); } },
        { key: 'hunt', icon: <img className="pixel-icon" src="/assets/icons/demon_claw.png" alt="" />, label: t('nav.hunt'), active: huntOpen, badge: !!save.activeHuntingZone, extra: save.activeHuntingZone ? <HuntNavMini save={save} onOpen={() => { closeDrawer(); openHunt(); }} /> : undefined, tutorialTarget: 'hunt', onClick: () => { closeDrawer(); openHunt(); } },
        { key: 'dungeon', icon: <img className="pixel-icon" src="/assets/icons/dragon_flameblade.png" alt="" />, label: t('nav.dungeon'), active: dungeonOpen, tutorialTarget: 'dungeon', onClick: () => { closeDrawer(); openDungeon(); } },
        { key: 'quests', icon: <img className="pixel-icon" src="/assets/icons/nav_quests.png" alt="" />, label: t('nav.quests'), active: questsOpen, badge: claimableCount(save.quests, { cp: computeCP(save), maxRefine: questMaxRefine(save) }) > 0, onClick: () => { closeDrawer(); playSfx('click'); setQuestsOpen(true); } },
      ],
    },
    {
      key: 'professions',
      header: t('nav.groupProfessions'),
      items: [
        { key: 'mining', icon: <img className="pixel-icon" src="/assets/icons/nav_mining.png" alt="" />, label: t('nav.mining'), active: mineOpen, onClick: () => { closeDrawer(); playSfx('click'); setMineOpen(true); openContextTutorial('mining'); } },
        { key: 'woodcutting', icon: <img className="pixel-icon" src="/assets/icons/oak_wood.png" alt="" />, label: t('nav.woodcutting'), active: woodOpen, badge: computeWoodcuttingStatus(save, Date.now()).full, onClick: () => { closeDrawer(); playSfx('click'); setWoodOpen(true); openContextTutorial('woodcutting'); } },
        { key: 'garden', icon: <img className="pixel-icon" src="/assets/icons/common_herb.png" alt="" />, label: t('nav.garden'), active: gardenOpen, badge: computeGardenStatuses(save, Date.now()).some((s) => s.ready), onClick: () => { closeDrawer(); playSfx('click'); setGardenOpen(true); openContextTutorial('garden'); } },
        { key: 'oficios', icon: <img className="pixel-icon" src="/assets/icons/refine_catalyst.png" alt="" />, label: t('nav.oficios'), active: activeView === 'oficios', onClick: () => { closeDrawer(); playSfx('click'); setActiveView('oficios'); } },
      ],
    },
    {
      key: 'equipment',
      header: t('nav.groupEquipment'),
      items: [
        { key: 'forge', icon: <img className="pixel-icon" src="/assets/icons/steel.png" alt="" />, label: t('nav.forge'), active: forgeOpen, tutorialTarget: 'forge', onClick: () => {
            closeDrawer();
            playSfx('click');
            setForgeOpen(true);
            if (Object.values(saveRef.current.gearInstances).some((item) => (getGear(item.templateId)?.tier ?? 0) >= 1)) openContextTutorial('sockets');
          } },
        { key: 'inventory', icon: <img className="pixel-icon" src="/assets/icons/nav_bag.png" alt="" />, label: t('nav.inventory'), active: bagOpen, onClick: () => { closeDrawer(); playSfx('click'); setBagOpen(true); openContextTutorial('reforge'); } },
      ],
    },
    {
      key: 'economy',
      header: t('nav.groupEconomy'),
      items: [
        { key: 'deliveries', icon: <img className="pixel-icon" src="/assets/icons/expedition_ticket_2h.png" alt="" />, label: t('nav.deliveries'), active: expeditionOpen, badge: isDeliveryReady(save, Date.now()) || save.expeditions.some((e) => Date.now() >= e.endsAt), onClick: () => { closeDrawer(); openExpedition(); } },
        { key: 'battlePass', icon: <img className="pixel-icon" src="/assets/icons/nav_battlepass.png" alt="" />, label: t('nav.battlePass'), active: battlePassOpen, onClick: () => { closeDrawer(); playSfx('click'); setBattlePassOpen(true); } },
        { key: 'shop', icon: <img className="pixel-icon" src="/assets/icons/gold.png" alt="" />, label: t('nav.shop'), active: shopOpen, onClick: () => { closeDrawer(); playSfx('click'); setShopOpen(true); } },
      ],
    },
    {
      key: 'settings',
      items: [
        { key: 'settings', icon: '⚙️', label: t('nav.settings'), active: settingsOpen, onClick: () => { closeDrawer(); playSfx('click'); setSettingsOpen(true); } },
      ],
    },
  ];

  return (
    <BagContext.Provider value={{ save, move: moveStash, storeAllMaterials, sell: sellItem, openUse, upgradeStash }}>
    <div className="game-root">
      <div className="desktop-shell">
        {isDesktop ? (
          <DesktopSidebar groups={desktopNavGroups} onLogoClick={() => setActiveView('home')} />
        ) : (
          <MobileDrawer open={drawerOpen} onClose={closeDrawer}>
            <DesktopSidebar groups={desktopNavGroups} onLogoClick={() => { closeDrawer(); setActiveView('home'); }} />
          </MobileDrawer>
        )}
        <div className="desktop-main">
          <DesktopTopbar
            save={save}
            spriteUrl={heroSpriteUrl}
            onOpenProfile={() => setActiveView('personagem')}
            onOpenSettings={() => { playSfx('click'); setSettingsOpen(true); }}
            onOpenMenu={() => setDrawerOpen(true)}
            showMenuButton={!isDesktop}
            muted={muted}
            onToggleMute={toggleMute}
            syncStatus={saveStatus}
          />
          {activeView === 'home' && (
            <DesktopHome
              save={save}
              spriteUrl={heroSpriteUrl}
              onOpenHero={() => setActiveView('personagem')}
              onOpenHunt={openHunt}
              onOpenDungeon={openDungeon}
              onOpenForge={() => { playSfx('click'); setForgeOpen(true); }}
              onOpenExpedition={openExpedition}
              onOpenMining={() => { playSfx('click'); setMineOpen(true); }}
              onOpenWoodcutting={() => { playSfx('click'); setWoodOpen(true); }}
              onOpenGarden={() => { playSfx('click'); setGardenOpen(true); }}
              onOpenInventory={() => { playSfx('click'); setBagOpen(true); }}
            />
          )}
          {activeView === 'personagem' && (
            <PersonagemView
              save={save}
              spriteUrl={heroSpriteUrl}
              onAttrChange={attrChange}
              onEquip={equipGear}
              onUnequip={unequipGear}
              onSelectTitle={selectTitle}
              onDiscard={discardItem}
              onReforge={reforgeItem}
              onSalvage={salvageItem}
              onUseConsumable={useConsumableManually}
              onExpandInventory={expandInventoryBag}
            />
          )}
          {activeView === 'oficios' && <OficiosView key={oficiosFocus?.recipeId ?? 'free'} save={save} onRefine={refineMaterial} onCraftPotion={craftPotion} focus={oficiosFocus} />}
        </div>
      </div>
      {import.meta.env.DEV && !adminOpen && (
        <button className="dev-admin-fab" onClick={() => setAdminOpen(true)} aria-label="Admin" data-ui>
          ⚙️
        </button>
      )}

      {shopOpen && (
        <ShopModal
          save={save}
          onBuyConsumable={buyConsumable}
          onBuyGem={buyGem}
          onSell={sellItem}
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
          onUpgrade={upgradeItem}
          onUpgradeWithCatalyst={upgradeItemWithCatalyst}
          onRepair={repairItem}
          onSocket={socketGem}
          onUnsocket={unsocketGem}
          initialTab={forgeFocus?.tab}
          focusItemId={forgeFocus?.itemId}
          onClose={() => {
            playSfx('click');
            setForgeOpen(false);
            setForgeFocus(null);
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
          onExpand={expandInventoryBag}
          onClose={() => {
            playSfx('click');
            setBagOpen(false);
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
          onFertilize={fertilizePlot}
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

      {save.pendingHuntReward && !rewardHidden && (
        <HuntRewardModal
          save={save}
          reward={save.pendingHuntReward}
          subLevels={T.hunting.subLevels}
          onClaim={confirmHuntReward}
          onOpenInventory={() => {
            playSfx('click');
            setRewardHidden(true);
            setHuntOpen(false);
            setBagOpen(true);
          }}
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
          accountConfigured={configured}
          accountEmail={user?.email ?? null}
          onSignOut={() => {
            setSettingsOpen(false);
            void handleSignOut();
          }}
          onClose={() => {
            playSfx('click');
            setSettingsOpen(false);
          }}
        />
      )}
      {contextTutorial && <TutorialOverlay step={contextTutorial} onAdvance={closeContextTutorial} onSkip={skipAutomaticTutorials} onDismiss={dismissContextTutorial} />}
    </div>
    </BagContext.Provider>
  );
}

export default App;
