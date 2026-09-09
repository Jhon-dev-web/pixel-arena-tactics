import { useEffect, useRef, useState } from 'react';
import T, { setTunableListener } from './game/tunables';
import {
  addBattlePassXp,
  computeCP,
  computeHuntingStatus,
  computeMiningStatus,
  defaultSave,
  isBattlePassActive,
  loadSave,
  persistSave,
  playerLevel,
  SaveData,
} from './game/engine';
import { getBattlePassLevelDef } from './game/battlepass';
import { DURABILITY_LOSS_PER_STAGE, GEAR, gearSellValue, getEquipped, getGear, MAX_DURABILITY, MAX_REFINE, refineLevel, repairCost, upgradeChance, upgradeCost } from './game/gear';
import { MATERIALS, MaterialId, hasMaterials } from './game/materials';
import { CONSUMABLE_STACK, ConsumableId, getConsumable } from './game/consumables';
import { isBagFull } from './game/inventory';
import { GEMS, GemId, hasGems, socketsForTier } from './game/gems';
import { getTitleDef } from './game/titles';
import { canSalvage, getSalvageReturn, SALVAGE_BONUS_CHANCE } from './game/salvage';
import { spriteForArmorTier } from './game/sprites';
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
import ClaimModal from './components/ClaimModal';
import HuntRewardModal from './components/HuntRewardModal';
import QuestsModal from './components/QuestsModal';
import BattlePassModal from './components/BattlePassModal';
import { crossedMilestoneFloors, getMilestoneReward, MAX_DUNGEON_FLOOR, milestoneXpBonus } from './game/dungeon';
import { RunRewards } from './game/waves';
import { getHuntingZone, isZoneUnlocked, unlockedZoneIds } from './game/huntingZones';
import { getOreTier, isOreTierUnlocked } from './game/ores';
import { ExpeditionRewards, expeditionRewards, getExpedition } from './game/expedition';
import { claimableCount, isClaimed, isComplete, QuestContext, QUESTS_ACHIEVEMENTS, QUESTS_DAILY } from './game/quests';
import { rollRarity, rollSubstats, totalSubstatTotals } from './game/rarity';
import TopHud from './components/TopHud';
import Campfire from './components/Campfire';
import { initAudio, loadMuted, playSfx, setMuted } from './game/audio';
import Assets from './assets.json';
import { t } from './locales';
import './App.css';

const gearText = (key: string): string => t(`gear.${key}`);

function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave());

  const [shopOpen, setShopOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  const [dungeonOpen, setDungeonOpen] = useState(false);
  const [huntOpen, setHuntOpen] = useState(false);
  const [battleFloor, setBattleFloor] = useState<number | null>(null);
  const [expeditionOpen, setExpeditionOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [claimResult, setClaimResult] = useState<{ nameKey: string; rewards: ExpeditionRewards } | null>(null);
  const [huntReward, setHuntReward] = useState<{
    timeMs: number;
    pendingMs: number;
    gold: number;
    drops: Partial<Record<MaterialId, number>>;
  } | null>(null);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [battlePassOpen, setBattlePassOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [muted, setMutedState] = useState<boolean>(() => loadMuted());
  const [cheatMode, setCheatMode] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const saveRef = useRef(save);
  const cheatModeRef = useRef(false);

  const setSaveBoth = (s: SaveData) => {
    saveRef.current = s;
    setSave(s);
  };

  const toastTimeout = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimeout.current) window.clearTimeout(toastTimeout.current);
    toastTimeout.current = window.setTimeout(() => setToast(null), 1600);
  };

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

  const enterDungeon = () => {
    const s = saveRef.current;
    if (s.activeOreId) {
      showToast(t('mining.busyDungeon'));
      return;
    }
    if (s.activeHuntingZone) {
      showToast(t('hunting.busyOther'));
      return;
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
    const dur = { ...(s.durability ?? {}) };
    if (stages > 0) {
      for (const slot of ['weapon', 'armor'] as const) {
        const id = s.equipped[slot];
        if (id) dur[id] = Math.max(0, (dur[id] ?? MAX_DURABILITY) - DURABILITY_LOSS_PER_STAGE * stages);
      }
    }
    const nextFloor = success ? Math.min(MAX_DUNGEON_FLOOR, startFloor + stages) : s.highestDungeonFloor;
    const quests = { ...s.quests };
    let battlePassLevel = s.battlePassLevel;
    let battlePassXp = s.battlePassXp;
    if (stages > 0) {
      quests.daily = { ...quests.daily, kills: (quests.daily.kills ?? 0) + stages };
      quests.counters = { ...quests.counters, kills: (quests.counters.kills ?? 0) + stages };
      if (success) {
        quests.counters.maxFloorCleared = Math.max(quests.counters.maxFloorCleared ?? 0, nextFloor);
      }
      ({ battlePassLevel, battlePassXp } = addBattlePassXp(s, T.battlePass.xpPerFloor * stages));
    }
    const subs = totalSubstatTotals(s.equipped, s.itemSubstats ?? {});
    const goldGain = Math.round(rewards.gold * (1 + subs.goldBonus / 100));
    const unlockedHuntingZones = Array.from(new Set([...s.unlockedHuntingZones, ...unlockedZoneIds(nextFloor)]));

    // Milestone (first-clear) rewards only ever apply to a successful retreat — a run that ends in
    // defeat must never bank a checkpoint, even if a boss earlier in that same run was genuinely killed.
    const crossed = success ? crossedMilestoneFloors(startFloor, stages, s.dungeonCheckpoints) : [];
    let gold = s.gold + goldGain;
    let gems = s.gems;
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
    const xpGain = T.advanced.victoryXp * stages + milestoneXpBonus(startFloor, stages);

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
    const cost = repairCost(item.tier ?? 0);
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

  const useAutoPotion = () => {
    const s = saveRef.current;
    const qty = s.consumables.small_hp ?? 0;
    if (qty <= 0) return;
    setSaveBoth({ ...s, consumables: { ...s.consumables, small_hp: qty - 1 } });
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
    if (s.expedition) return;
    if (s.activeHuntingZone) {
      showToast(t('hunting.busyOther'));
      return;
    }
    playSfx('click');
    setSaveBoth({ ...s, expedition: { id, endsAt: Date.now() + def.durationMs } });
    setExpeditionOpen(false);
  };

  const cancelExpedition = () => {
    const s = saveRef.current;
    if (!s.expedition) return;
    playSfx('click');
    setSaveBoth({ ...s, expedition: null });
  };

  const claimExpedition = () => {
    const s = saveRef.current;
    const exp = s.expedition;
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
      expedition: null,
      quests: {
        ...s.quests,
        daily: { ...s.quests.daily, expeditions: (s.quests.daily.expeditions ?? 0) + 1 },
      },
    });
    playSfx('victory');
    setClaimResult({ nameKey: def.nameKey, rewards });
  };

  const startMining = (oreId: string) => {
    const s = saveRef.current;
    const tier = getOreTier(oreId);
    if (!tier || !isOreTierUnlocked(tier, playerLevel(s.xp), s.inventory) || s.activeOreId === oreId) return;
    if (battleFloor !== null) {
      showToast(t('mining.busyBattle'));
      return;
    }
    if (s.activeHuntingZone) {
      showToast(t('hunting.busyOther'));
      return;
    }
    playSfx('click');
    const inventory = { ...s.inventory };
    if (!inventory[tier.pickaxeId]) inventory[tier.pickaxeId] = 1;
    setSaveBoth({ ...s, inventory, activeOreId: oreId, lastMiningClaim: Date.now() });
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

  const startHunt = (zoneId: string) => {
    const s = saveRef.current;
    const zone = getHuntingZone(zoneId);
    if (!zone || !isZoneUnlocked(zone, s.highestDungeonFloor) || s.activeHuntingZone === zoneId) return;
    if (s.activeOreId) {
      showToast(t('mining.busyDungeon'));
      return;
    }
    playSfx('click');
    let gold = s.gold;
    const mats = { ...s.materials };
    if (s.activeHuntingZone) {
      const prior = computeHuntingStatus(s, Date.now());
      gold += prior.goldReady;
      for (const [mid, qty] of Object.entries(prior.drops)) {
        mats[mid as MaterialId] = (mats[mid as MaterialId] ?? 0) + (qty as number);
      }
    }
    setSaveBoth({ ...s, gold, materials: mats, activeHuntingZone: zoneId, huntingOfflineStart: Date.now() });
  };

  const stopHunt = () => {
    const s = saveRef.current;
    if (!s.activeHuntingZone) return;
    const status = computeHuntingStatus(s, Date.now());
    const timeMs = Date.now() - s.huntingOfflineStart;
    playSfx('click');
    setSaveBoth({ ...s, activeHuntingZone: null });
    setHuntReward({ timeMs, pendingMs: status.pendingMs, gold: status.goldReady, drops: status.drops });
  };

  const confirmHuntReward = () => {
    const reward = huntReward;
    if (!reward) return;
    const s = saveRef.current;
    const mats = { ...s.materials };
    for (const [mid, qty] of Object.entries(reward.drops)) {
      mats[mid as MaterialId] = (mats[mid as MaterialId] ?? 0) + (qty as number);
    }
    const hours = reward.pendingMs / (3600 * 1000);
    const { battlePassLevel, battlePassXp } = addBattlePassXp(s, Math.floor(hours * T.battlePass.xpPerHuntHour));
    playSfx('victory');
    setSaveBoth({ ...s, gold: s.gold + reward.gold, materials: mats, huntingOfflineStart: Date.now(), battlePassLevel, battlePassXp });
    setHuntReward(null);
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
    let oneTokenBalance = s.oneTokenBalance;
    switch (reward.kind) {
      case 'gold':
        gold += reward.amount;
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

  const sellItem = (kind: 'gear' | 'material' | 'consumable', id: string, qty: number) => {
    const s = saveRef.current;
    if (kind === 'material') {
      const m = MATERIALS.find((x) => x.id === id);
      const have = s.materials[id as MaterialId] ?? 0;
      const n = Math.max(1, Math.min(qty, have));
      if (!m || have <= 0) return;
      setSaveBoth({ ...s, gold: s.gold + n * m.sellValue, materials: { ...s.materials, [id as MaterialId]: have - n } });
    } else if (kind === 'consumable') {
      const c = getConsumable(id);
      const have = s.consumables[id as ConsumableId] ?? 0;
      const n = Math.max(1, Math.min(qty, have));
      if (!c || have <= 0) return;
      setSaveBoth({ ...s, gold: s.gold + n * c.sellValue, consumables: { ...s.consumables, [id as ConsumableId]: have - n } });
    } else {
      const g = getGear(id);
      const have = s.inventory[id] ?? 0;
      const n = Math.max(1, Math.min(qty, have));
      if (!g || have <= 0) return;
      setSaveBoth({ ...s, gold: s.gold + n * gearSellValue(g), inventory: { ...s.inventory, [id]: have - n } });
    }
    playSfx('click');
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

  const upgradeItem = (id: string) => {
    const item = getGear(id);
    if (!item) return;
    const s = saveRef.current;
    const lvl = refineLevel(s.upgrades, id);
    if (lvl >= MAX_REFINE) return;
    const cost = upgradeCost(item, lvl);
    if (s.gold < cost.gold) return;
    if (!hasMaterials(s.materials, cost.materials)) return;
    if ((cost.shards ?? 0) > 0 && s.shards < (cost.shards ?? 0)) return;

    const mats = { ...s.materials };
    for (const [mid, count] of Object.entries(cost.materials ?? {})) {
      mats[mid as MaterialId] = (mats[mid as MaterialId] ?? 0) - (count as number);
    }
    const success = Math.random() < upgradeChance(lvl);
    setSaveBoth({
      ...s,
      gold: s.gold - cost.gold,
      materials: mats,
      shards: s.shards - (cost.shards ?? 0),
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

  const build = getEquipped(save.equipped);
  const armorTier = build.armor?.tier ?? 0;
  const playerSpriteUrl = spriteForArmorTier(armorTier);

  return (
    <div className="game-root">
      <div className="stage" data-tv={version}>
        <div className="bg" style={{ backgroundImage: `url(${Assets.background.camp.url})` }} />
        <div className="vignette" />

        <TopHud
          save={save}
          spriteUrl={playerSpriteUrl}
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
          </button>
          <button className="side-btn hunt-btn" onClick={openHunt} data-ui>
            🏹
            {!!save.activeHuntingZone && <span className="quests-badge">•</span>}
          </button>
          <button className="side-btn expedition-btn" onClick={openExpedition} data-ui>
            🏕️
            {save.expedition && Date.now() >= save.expedition.endsAt && <span className="quests-badge">•</span>}
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
          </button>
          <button className="side-btn" onClick={() => { playSfx('click'); setBagOpen(true); }} data-ui>
            <img className="pixel-icon" src="/assets/icons/nav_bag.png" alt="" />
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
          </button>
          <button className="side-btn" onClick={() => setAdminOpen(true)} data-ui>
            ⚙️
          </button>
          <button className="side-btn" onClick={toggleMute} data-ui>
            {muted ? '🔇' : '🔊'}
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
          onUpgrade={upgradeItem}
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
          onSell={sellItem}
          onDiscard={discardItem}
          onReforge={reforgeItem}
          onSalvage={salvageItem}
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
          expedition={save.expedition}
          huntingActive={!!save.activeHuntingZone}
          onStart={startExpedition}
          onCancel={cancelExpedition}
          onClaim={claimExpedition}
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
          drops={huntReward.drops}
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

      {adminOpen && (
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
