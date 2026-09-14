import { useEffect, useRef, useState } from 'react';
import T, { setTunableListener } from './game/tunables';
import {
  addBattlePassXp,
  computeCP,
  computeGardenSlotStatus,
  computeGardenStatuses,
  computeHuntingStatus,
  computeMiningStatus,
  computeWoodcuttingStatus,
  defaultSave,
  effectivePouchSlots,
  effectiveRepairCost,
  isBattlePassActive,
  loadSave,
  maxExpeditionSlots,
  persistSave,
  playerLevel,
  SaveData,
} from './game/engine';
import { getBattlePassLevelDef } from './game/battlepass';
import { DURABILITY_LOSS_PER_STAGE, GEAR, getGear, MAX_DURABILITY, MAX_REFINE, refineLevel, upgradeChance, upgradeCost } from './game/gear';
import { MaterialId, hasMaterials } from './game/materials';
import { getRefiningRecipe } from './game/refining';
import { getPotionRecipe } from './game/potions';
import { CONSUMABLE_STACK, ConsumableId, EXPEDITION_TICKET_SKIP_MS, getConsumable } from './game/consumables';
import { isBagFull, inventorySlotsUsed, MAX_SLOTS } from './game/inventory';
import { GEMS, GemId, hasGems, socketsForTier } from './game/gems';
import { getTitleDef } from './game/titles';
import { canSalvage, getSalvageReturn, SALVAGE_BONUS_CHANCE } from './game/salvage';
import { playerSpriteUrl } from './game/sprites';
import AdminModal from './components/AdminModal';
import ShopModal from './components/ShopModal';
import ForgeModal from './components/ForgeModal';
import InventoryModal from './components/InventoryModal';
import HeroModal from './components/HeroModal';
import DungeonMapModal from './components/DungeonMapModal';
import HuntModal from './components/HuntModal';
import BattleModal from './components/BattleModal';
import ExpeditionModal from './components/ExpeditionModal';
import MiningModal from './components/MiningModal';
import WoodcuttingModal from './components/WoodcuttingModal';
import GardenModal from './components/GardenModal';
import ClaimModal from './components/ClaimModal';
import HuntRewardModal from './components/HuntRewardModal';
import QuestsModal from './components/QuestsModal';
import BattlePassModal from './components/BattlePassModal';
import { crossedMilestoneFloors, dungeonRunXp, getEliteReward, getMilestoneReward, MAX_DUNGEON_FLOOR, milestoneXpBonus } from './game/dungeon';
import { RunRewards } from './game/waves';
import { DEFAULT_HUNTING_DEPTH, getHuntingZone, HuntingDepth, isDepthUnlocked, isZoneUnlocked, unlockedZoneIds } from './game/huntingZones';
import { allocateToPouch, drainPouchToMaterials, nextHuntPouchTierDef } from './game/huntPouch';
import { getOreTier, isOreTierUnlocked } from './game/ores';
import { getWoodTier, isWoodTierUnlocked } from './game/woodcutting';
import { skillLevel } from './game/skills';
import { getPlant } from './game/garden';
import { ExpeditionRewards, expeditionRewards, getExpedition } from './game/expedition';
import { claimableCount, isClaimed, isComplete, QuestContext, QUESTS_ACHIEVEMENTS, QUESTS_DAILY } from './game/quests';
import { rollRarity, rollSubstats, totalSubstatTotals } from './game/rarity';
import TopHud from './components/TopHud';
import FirstViewTooltip from './components/FirstViewTooltip';
import Campfire from './components/Campfire';
import { initAudio, loadMuted, playSfx, setMuted } from './game/audio';
import Assets from './assets.json';
import { t } from './locales';
import './App.css';

const gearText = (key: string): string => t(`gear.${key}`);

// First-view tooltips for the Camp side-rail icons — order matches the rail top-to-bottom. Admin (dev
// only) is deliberately excluded: it doesn't exist in a production build, so there's nothing to
// introduce to a real player. See FirstViewTooltip.tsx / SaveData.seenTooltips.
const TOOLTIP_IDS = ['mining', 'woodcutting', 'garden', 'hunt', 'expedition', 'battlepass', 'bag', 'quests', 'mute'] as const;
const tooltipText = (id: string): string => t(`tooltips.${id}`);

function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave());

  const [shopOpen, setShopOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  const [dungeonOpen, setDungeonOpen] = useState(false);
  const [huntOpen, setHuntOpen] = useState(false);
  const [battleFloor, setBattleFloor] = useState<number | null>(null);
  const [eliteFloor, setEliteFloor] = useState<number | null>(null);
  const [expeditionOpen, setExpeditionOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [woodOpen, setWoodOpen] = useState(false);
  const [gardenOpen, setGardenOpen] = useState(false);
  const [claimResult, setClaimResult] = useState<{ nameKey: string; rewards: ExpeditionRewards } | null>(null);
  const [huntReward, setHuntReward] = useState<{ timeMs: number; pendingMs: number; gold: number; xp: number } | null>(null);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [battlePassOpen, setBattlePassOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [muted, setMutedState] = useState<boolean>(() => loadMuted());
  const [cheatMode, setCheatMode] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [tooltipQueue, setTooltipQueue] = useState<string[]>(() => TOOLTIP_IDS.filter((id) => !save.seenTooltips.includes(id)));
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const saveRef = useRef(save);
  const cheatModeRef = useRef(false);

  const toastTimeout = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimeout.current) window.clearTimeout(toastTimeout.current);
    toastTimeout.current = window.setTimeout(() => setToast(null), 1600);
  };

  // Character XP is intentionally never shown as a number anywhere in the UI (see TopHud/HeroModal/
  // HuntModal/ExpeditionModal/HuntRewardModal) — a level-up toast is the only XP-gain feedback left,
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

  // First-view tooltip sequencing: shows one at a time from tooltipQueue (staggered, so a fresh save
  // with everything unlocked doesn't dump 9 bubbles at once), marks each seen the instant it's
  // displayed (so a reload mid-display never re-shows it — "seen" means shown, not "fully read"), and
  // never blocks the icon underneath — the icon's own onClick still fires normally either way.
  useEffect(() => {
    if (activeTooltip || tooltipQueue.length === 0) return;
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
  }, [activeTooltip, tooltipQueue]);

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
  };

  // A "session" is one full Dungeon attempt (enter -> climb until death or voluntary retreat), not
  // per-floor — only normal Dungeon runs are capped this way; Elite stays uncapped (finishEliteRun),
  // since it's a same-floor re-fight with its own separate, already-throttled reward table.
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

  const enterEliteDungeon = (floor: number) => {
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
    playSfx('click');
    setDungeonOpen(false);
    setEliteFloor(floor);
  };

  // Elite is a same-floor optional re-fight with zero effect on floor progress, milestones, or XP —
  // it only ever grants its own exclusive loot on a win, and marks the floor as elite-cleared once.
  const finishEliteRun = (floor: number, won: boolean) => {
    const s = saveRef.current;
    if (!won) {
      setEliteFloor(null);
      playSfx('hit');
      return;
    }
    const alreadyDefeated = s.dungeonEliteDefeated.includes(floor);
    const reward = getEliteReward(floor, alreadyDefeated);
    if (!reward) {
      setEliteFloor(null);
      return;
    }
    const gems = { ...s.gems };
    for (const [gid, qty] of Object.entries(reward.gems)) gems[gid as GemId] = (gems[gid as GemId] ?? 0) + (qty as number);
    setSaveBoth({
      ...s,
      gold: s.gold + reward.gold,
      gems,
      shards: s.shards + reward.shards,
      consumables: { ...s.consumables, refine_catalyst: (s.consumables.refine_catalyst ?? 0) + reward.catalysts },
      oneTokenBalance: s.oneTokenBalance + (reward.oneTokenBalance ?? 0),
      dungeonEliteDefeated: alreadyDefeated ? s.dungeonEliteDefeated : [...s.dungeonEliteDefeated, floor],
    });
    playSfx('victory');
    setEliteFloor(null);
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
    const dur = { ...(s.durability ?? {}) };
    if (stages > 0) {
      for (const slot of ['weapon', 'armor'] as const) {
        const id = s.equipped[slot];
        if (id) dur[id] = Math.max(0, (dur[id] ?? MAX_DURABILITY) - DURABILITY_LOSS_PER_STAGE * stages);
      }
    }
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
    const subs = totalSubstatTotals(s.equipped, s.itemSubstats ?? {});
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
      durability: dur,
      blessed: false,
      quests,
      battlePassLevel,
      battlePassXp,
    });
    playSfx(outcome === 'retreat' ? 'victory' : 'hit');
    setBattleFloor(null);
  };

  const repairItem = (id: string, blessed: boolean) => {
    const item = getGear(id);
    if (!item) return;
    const s = saveRef.current;
    const cost = effectiveRepairCost(s, item.tier ?? 0, Date.now());
    if (s.gold < cost) return;
    if (blessed && s.shards < 1) return;
    playSfx('victory');
    setSaveBoth({
      ...s,
      gold: s.gold - cost,
      shards: blessed ? s.shards - 1 : s.shards,
      durability: { ...(s.durability ?? {}), [id]: MAX_DURABILITY },
      blessed: blessed ? true : s.blessed,
    });
  };

  const buyGem = (id: GemId) => {
    const def = GEMS.find((g) => g.id === id);
    if (!def) return;
    const s = saveRef.current;
    if (s.shards < def.shardCost) return;
    playSfx('click');
    setSaveBoth({ ...s, shards: s.shards - def.shardCost, gems: { ...s.gems, [id]: (s.gems[id] ?? 0) + 1 } });
  };

  const socketGem = (itemId: string, gemId: GemId) => {
    const s = saveRef.current;
    const item = getGear(itemId);
    if (!item) return;
    if ((s.gems?.[gemId] ?? 0) <= 0) return;
    const sockets = { ...(s.sockets ?? {}) };
    const list = [...(sockets[itemId] ?? [])];
    if (list.length >= socketsForTier(item.tier ?? 0)) return;
    list.push(gemId);
    sockets[itemId] = list;
    playSfx('click');
    setSaveBoth({
      ...s,
      gems: { ...s.gems, [gemId]: (s.gems[gemId] ?? 0) - 1 },
      sockets,
    });
  };

  const unsocketGem = (itemId: string, index: number) => {
    const s = saveRef.current;
    const sockets = { ...(s.sockets ?? {}) };
    const list = [...(sockets[itemId] ?? [])];
    const gemId = list[index];
    if (!gemId) return;
    list.splice(index, 1);
    sockets[itemId] = list;
    playSfx('click');
    setSaveBoth({
      ...s,
      gems: { ...s.gems, [gemId]: (s.gems[gemId] ?? 0) + 1 },
      sockets,
    });
  };

  const openExpedition = () => {
    playSfx('click');
    setExpeditionOpen(true);
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

  // Using another Strength Elixir while one is active refreshes the full duration from now rather
  // than stacking magnitude or extending additively — simplest to reason about, matches how a
  // single-slot buff usually reads ("you're topped up to 30min again"), and keeps the damage bonus
  // itself constant so it can't be stacked into something the boss-fight balance wasn't tuned for.
  const applyStrengthElixir = () => {
    const s = saveRef.current;
    const qty = s.consumables.strength_elixir ?? 0;
    if (qty <= 0) return;
    playSfx('victory');
    setSaveBoth({
      ...s,
      consumables: { ...s.consumables, strength_elixir: qty - 1 },
      activeBuff: { type: 'strength', expiresAt: Date.now() + T.battle.strengthElixirMinutes * 60 * 1000 },
    });
    showToast(t('consumables.strength_elixir_active'));
  };

  const useConsumableManually = (id: string) => {
    if (id === 'xp_potion') applyXpPotion();
    else if (id === 'strength_elixir') applyStrengthElixir();
  };

  const claimQuest = (id: string) => {
    const s = saveRef.current;
    const def = [...QUESTS_DAILY, ...QUESTS_ACHIEVEMENTS].find((q) => q.id === id);
    if (!def || isClaimed(def, s.quests)) return;
    const ctx: QuestContext = { cp: computeCP(s), maxRefine: Math.max(0, ...Object.values(s.upgrades ?? {})) };
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

  const startExpedition = (id: string) => {
    const def = getExpedition(id);
    if (!def) return;
    const s = saveRef.current;
    if (s.expeditions.length >= maxExpeditionSlots(s, Date.now())) return;
    if (s.activeHuntingZone) {
      showToast(t('hunting.busyOther'));
      return;
    }
    playSfx('click');
    setSaveBoth({ ...s, expeditions: [...s.expeditions, { id, endsAt: Date.now() + def.durationMs }] });
  };

  const cancelExpedition = (index: number) => {
    const s = saveRef.current;
    if (!s.expeditions[index]) return;
    playSfx('click');
    setSaveBoth({ ...s, expeditions: s.expeditions.filter((_, i) => i !== index) });
  };

  const claimExpedition = (index: number) => {
    const s = saveRef.current;
    const exp = s.expeditions[index];
    if (!exp) return;
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
    setClaimResult({ nameKey: def.nameKey, rewards });
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
    if (!tier || !isOreTierUnlocked(tier, skillLevel(s.skillXp.mining)) || s.activeOreId === oreId) return;
    if (battleFloor !== null || eliteFloor !== null) {
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
    if (!tier || !isWoodTierUnlocked(tier, skillLevel(s.skillXp.woodcutting)) || s.activeWoodId === woodId) return;
    if (battleFloor !== null || eliteFloor !== null) {
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

  const startPlanting = (plantId: string, count: number) => {
    const s = saveRef.current;
    const def = getPlant(plantId);
    if (!def) return;
    if (skillLevel(s.skillXp.gardening) < def.requiredLevel) return;
    const emptyIndices = s.gardenSlots.reduce<number[]>((acc, slot, i) => {
      if (!slot.plantId) acc.push(i);
      return acc;
    }, []);
    const n = Math.min(Math.max(1, Math.floor(count)), emptyIndices.length);
    if (n <= 0) {
      showToast(t('garden.busy'));
      return;
    }
    playSfx('click');
    const now = Date.now();
    const gardenSlots = [...s.gardenSlots];
    for (let k = 0; k < n; k++) {
      gardenSlots[emptyIndices[k]] = { plantId: def.id, startedAt: now };
    }
    setSaveBoth({ ...s, gardenSlots });
  };

  const harvestGardenSlot = (slotIndex: number) => {
    const s = saveRef.current;
    const status = computeGardenSlotStatus(s, Date.now(), slotIndex);
    if (!status.ready || !status.plantId) return;
    const def = getPlant(status.plantId);
    if (!def) return;
    playSfx('victory');
    const gardenSlots = [...s.gardenSlots];
    gardenSlots[slotIndex] = { plantId: null, startedAt: 0 };
    setSaveBoth({
      ...s,
      materials: { ...s.materials, [def.material]: (s.materials[def.material] ?? 0) + def.qty },
      skillXp: { ...s.skillXp, gardening: s.skillXp.gardening + T.skills.xpPerHarvest },
      gardenSlots,
    });
    showToast(`${t('garden.harvest')} +${def.qty} ${t(`materials.mat_${def.material}`)}`);
  };

  const cancelGardenSlot = (slotIndex: number) => {
    const s = saveRef.current;
    if (!s.gardenSlots[slotIndex]?.plantId) return;
    playSfx('click');
    const gardenSlots = [...s.gardenSlots];
    gardenSlots[slotIndex] = { plantId: null, startedAt: 0 };
    setSaveBoth({ ...s, gardenSlots });
  };

  const startHunt = (zoneId: string, depth: HuntingDepth = DEFAULT_HUNTING_DEPTH) => {
    const s = saveRef.current;
    const zone = getHuntingZone(zoneId);
    if (!zone || !isZoneUnlocked(zone, s.highestDungeonFloor)) return;
    if (s.activeHuntingZone === zoneId && s.activeHuntingDepth === depth) return;
    if (!isDepthUnlocked(zone, depth, computeCP(s))) return;
    if (s.activeOreId) {
      showToast(t('mining.busyDungeon'));
      return;
    }
    if (s.activeWoodId) {
      showToast(t('woodcutting.busyOther'));
      return;
    }
    playSfx('click');
    let gold = s.gold;
    let xp = s.xp;
    let huntPouch = s.huntPouch;
    if (s.activeHuntingZone) {
      const priorZone = getHuntingZone(s.activeHuntingZone);
      const prior = computeHuntingStatus(s, Date.now());
      gold += prior.goldReady;
      if (playerLevel(xp) < 100) xp += prior.xpReady;
      if (priorZone) {
        huntPouch = allocateToPouch(huntPouch, prior.drops, priorZone.drops.map((d) => d.material), effectivePouchSlots(s, Date.now()));
      }
    }
    setSaveBoth({ ...s, gold, xp, huntPouch, activeHuntingZone: zoneId, activeHuntingDepth: depth, huntingOfflineStart: Date.now() });
  };

  const stopHunt = () => {
    const s = saveRef.current;
    if (!s.activeHuntingZone) return;
    const zone = getHuntingZone(s.activeHuntingZone);
    const status = computeHuntingStatus(s, Date.now());
    const timeMs = Date.now() - s.huntingOfflineStart;
    const huntPouch = zone
      ? allocateToPouch(s.huntPouch, status.drops, zone.drops.map((d) => d.material), effectivePouchSlots(s, Date.now()))
      : s.huntPouch;
    playSfx('click');
    setSaveBoth({ ...s, activeHuntingZone: null, activeHuntingDepth: null, huntPouch });
    setHuntReward({ timeMs, pendingMs: status.pendingMs, gold: status.goldReady, xp: status.xpReady });
  };

  const confirmHuntReward = () => {
    const reward = huntReward;
    if (!reward) return;
    const s = saveRef.current;
    const hours = reward.pendingMs / (3600 * 1000);
    const { battlePassLevel, battlePassXp } = addBattlePassXp(s, Math.floor(hours * T.battlePass.xpPerHuntHour));
    const atCap = playerLevel(s.xp) >= 100;
    const slotsUsed = inventorySlotsUsed(s);
    const { materials, remaining, blocked } = drainPouchToMaterials(s.huntPouch.items, s.materials, slotsUsed, MAX_SLOTS);
    playSfx('victory');
    setSaveBoth({
      ...s,
      gold: s.gold + reward.gold,
      xp: atCap ? s.xp : s.xp + reward.xp,
      materials,
      huntPouch: { ...s.huntPouch, items: remaining, lostItems: [] },
      huntingOfflineStart: Date.now(),
      battlePassLevel,
      battlePassXp,
    });
    if (blocked) showToast(t('hunting.bagFullWarning'));
    setHuntReward(null);
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
    setSaveBoth({ ...s, hasBattlePass: true, battlePassExpiresAt: base + T.battlePass.durationDays * 24 * 3600 * 1000 });
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
    } else {
      const inv = { ...s.inventory };
      delete inv[id];
      setSaveBoth({ ...s, inventory: inv });
    }
    playSfx('click');
  };

  const salvageItem = (id: string) => {
    const item = getGear(id);
    if (!item) return;
    const s = saveRef.current;
    if (!canSalvage(item, s.equipped, s.inventory)) return;

    const result = getSalvageReturn(item);
    const materials = { ...s.materials };
    for (const [mid, qty] of Object.entries(result.materials)) {
      materials[mid as MaterialId] = (materials[mid as MaterialId] ?? 0) + (qty as number);
    }

    let gems = s.gems;
    let bonusGranted = false;
    const rarity = s.itemRarity?.[id] ?? 'common';
    const bonusChance = SALVAGE_BONUS_CHANCE[rarity] ?? 0;
    if (bonusChance > 0 && Math.random() < bonusChance) {
      bonusGranted = true;
      if (Math.random() < 0.5) {
        materials.essence = (materials.essence ?? 0) + 1;
      } else {
        const gemIds: GemId[] = ['ruby', 'sapphire', 'emerald'];
        const gid = gemIds[Math.floor(Math.random() * gemIds.length)];
        gems = { ...s.gems, [gid]: (s.gems[gid] ?? 0) + 1 };
      }
    }

    const inv = { ...s.inventory };
    inv[id] = (inv[id] ?? 0) - 1;
    if (inv[id] <= 0) delete inv[id];

    playSfx('click');
    setSaveBoth({ ...s, inventory: inv, materials, gems });
    showToast(bonusGranted ? t('inventory.salvageBonus') : t('inventory.salvageDone'));
  };

  const forgeItem = (id: string) => {
    const item = getGear(id);
    if (!item) return;
    const s = saveRef.current;
    const recipe = item.recipe ?? {};
    if (s.gold < item.cost) return;
    if (playerLevel(s.xp) < (recipe.requiredLevel ?? 0)) return;
    if (!hasMaterials(s.materials, recipe.materials)) return;
    if (!hasGems(s.gems, recipe.gems)) return;
    for (const [itemId, need] of Object.entries(recipe.items ?? {})) {
      if ((s.inventory[itemId] ?? 0) < (need as number)) return;
    }
    if ((recipe.shards ?? 0) > 0 && s.shards < (recipe.shards ?? 0)) return;

    const mats = { ...s.materials };
    for (const [mid, count] of Object.entries(recipe.materials ?? {})) {
      mats[mid as MaterialId] = (mats[mid as MaterialId] ?? 0) - (count as number);
    }
    const gems = { ...s.gems };
    for (const [gid, count] of Object.entries(recipe.gems ?? {})) {
      gems[gid as GemId] = (gems[gid as GemId] ?? 0) - (count as number);
    }
    const inv = { ...s.inventory };
    for (const [itemId, need] of Object.entries(recipe.items ?? {})) {
      inv[itemId] = (inv[itemId] ?? 0) - (need as number);
    }
    const isCombatGear = item.slot === 'weapon' || item.slot === 'armor';
    const rarity = isCombatGear ? rollRarity() : undefined;
    const subs = rarity ? rollSubstats(rarity, item.tier ?? 0) : undefined;
    setSaveBoth({
      ...s,
      gold: s.gold - item.cost,
      materials: mats,
      gems,
      inventory: { ...inv, [id]: (inv[id] ?? 0) + 1 },
      shards: s.shards - (recipe.shards ?? 0),
      quests: {
        ...s.quests,
        daily: { ...s.quests.daily, forge: (s.quests.daily.forge ?? 0) + 1 },
      },
      itemRarity: rarity ? { ...(s.itemRarity ?? {}), [id]: rarity } : s.itemRarity,
      itemSubstats: subs ? { ...(s.itemSubstats ?? {}), [id]: subs } : s.itemSubstats,
    });
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

  const reforgeItem = (id: string) => {
    const item = getGear(id);
    if (!item) return;
    const s = saveRef.current;
    if (s.shards < 1) return;
    const rarity = s.itemRarity?.[id] ?? 'common';
    const subs = rollSubstats(rarity, item.tier ?? 0);
    setSaveBoth({
      ...s,
      shards: s.shards - 1,
      itemSubstats: { ...(s.itemSubstats ?? {}), [id]: subs },
    });
    playSfx('click');
    showToast(t('forge.reforged'));
  };

  const performUpgrade = (id: string, useCatalyst: boolean) => {
    const item = getGear(id);
    if (!item) return;
    const s = saveRef.current;
    const lvl = refineLevel(s.upgrades, id);
    if (lvl >= MAX_REFINE) return;
    const cost = upgradeCost(item, lvl);
    if (s.gold < cost.gold) return;
    if (!hasMaterials(s.materials, cost.materials)) return;
    if ((cost.shards ?? 0) > 0 && s.shards < (cost.shards ?? 0)) return;
    if (useCatalyst && (s.consumables.refine_catalyst ?? 0) < 1) return;

    const mats = { ...s.materials };
    for (const [mid, count] of Object.entries(cost.materials ?? {})) {
      mats[mid as MaterialId] = (mats[mid as MaterialId] ?? 0) - (count as number);
    }
    const success = useCatalyst || Math.random() < upgradeChance(lvl);
    setSaveBoth({
      ...s,
      gold: s.gold - cost.gold,
      materials: mats,
      shards: s.shards - (cost.shards ?? 0),
      consumables: useCatalyst
        ? { ...s.consumables, refine_catalyst: (s.consumables.refine_catalyst ?? 0) - 1 }
        : s.consumables,
      upgrades: success ? { ...s.upgrades, [id]: lvl + 1 } : s.upgrades,
      quests: {
        ...s.quests,
        daily: { ...s.quests.daily, forge: (s.quests.daily.forge ?? 0) + 1 },
      },
    });
    if (success) {
      playSfx('victory');
      showToast(t('forge.upgradeOk', { n: gearText(item.nameKey), m: lvl + 1 }));
    } else {
      playSfx('block');
      showToast(t('forge.upgradeFail'));
    }
  };

  const upgradeItem = (id: string) => performUpgrade(id, false);
  const upgradeItemWithCatalyst = (id: string) => performUpgrade(id, true);

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
    const all = GEAR.filter((g) => g.slot !== 'relic').map((g) => g.id);
    const inv = { ...saveRef.current.inventory };
    for (const id of all) inv[id] = Math.max(inv[id] ?? 0, 1);
    setSaveBoth({ ...saveRef.current, inventory: inv });
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

  const equipGear = (id: string) => {
    const item = getGear(id);
    if (saveRef.current.equipped[item.slot] === id) return;
    playSfx('click');
    setSaveBoth({
      ...saveRef.current,
      equipped: { ...saveRef.current.equipped, [item.slot]: id },
    });
  };

  const unequipGear = (id: string) => {
    const item = getGear(id);
    if (!item) return;
    playSfx('click');
    const fallback = item.slot === 'weapon' ? 'wooden_club' : item.slot === 'armor' ? 'ragged_clothes' : null;
    setSaveBoth({
      ...saveRef.current,
      equipped: { ...saveRef.current.equipped, [item.slot]: fallback },
    });
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
            }}
            data-ui
          >
            🌱
            {computeGardenStatuses(save, Date.now()).some((s) => s.ready) && <span className="quests-badge">•</span>}
            <FirstViewTooltip show={activeTooltip === 'garden'} label={tooltipText('garden')} />
          </button>
          <button className="side-btn hunt-btn" onClick={openHunt} data-ui>
            🏹
            {!!save.activeHuntingZone && <span className="quests-badge">•</span>}
            <FirstViewTooltip show={activeTooltip === 'hunt'} label={tooltipText('hunt')} />
          </button>
          <button className="side-btn expedition-btn" onClick={openExpedition} data-ui>
            🏕️
            {save.expeditions.some((e) => Date.now() >= e.endsAt) && <span className="quests-badge">•</span>}
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
          <button className="side-btn" onClick={() => { playSfx('click'); setBagOpen(true); }} data-ui>
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
            {claimableCount(save.quests, { cp: computeCP(save), maxRefine: Math.max(0, ...Object.values(save.upgrades ?? {})) }) > 0 && (
              <span className="quests-badge">
                {claimableCount(save.quests, { cp: computeCP(save), maxRefine: Math.max(0, ...Object.values(save.upgrades ?? {})) })}
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
        </div>
        <div className="camp-actions">
          <button className="camp-side-btn" onClick={() => { playSfx('click'); setForgeOpen(true); }} data-ui>
            {t('ui.forge')}
          </button>
          <button className="camp-main-btn" onClick={openDungeon} data-ui>
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
          onEnterElite={enterEliteDungeon}
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
        <ExpeditionModal
          save={save}
          maxSlots={maxExpeditionSlots(save, Date.now())}
          huntingActive={!!save.activeHuntingZone}
          onStart={startExpedition}
          onCancel={cancelExpedition}
          onClaim={claimExpedition}
          onUseTicket={useExpeditionTicket}
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
          onPlant={startPlanting}
          onHarvest={harvestGardenSlot}
          onCancel={cancelGardenSlot}
          onClose={() => {
            playSfx('click');
            setGardenOpen(false);
          }}
        />
      )}

      {claimResult && (
        <ClaimModal
          nameKey={claimResult.nameKey}
          rewards={claimResult.rewards}
          onClose={() => {
            playSfx('click');
            setClaimResult(null);
          }}
        />
      )}

      {huntReward && (
        <HuntRewardModal
          timeMs={huntReward.timeMs}
          gold={huntReward.gold}
          pouch={save.huntPouch}
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

      {eliteFloor !== null && (
        <BattleModal
          save={save}
          startFloor={eliteFloor}
          elite
          alreadyDefeatedElite={save.dungeonEliteDefeated.includes(eliteFloor)}
          onEliteWin={() => finishEliteRun(eliteFloor, true)}
          onRetreat={() => finishEliteRun(eliteFloor, false)}
          onDefeat={() => finishEliteRun(eliteFloor, false)}
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
    </div>
  );
}

export default App;
