// Thin driver around the REAL game functions. Everything that is pure game logic (combat stats, enemy scaling, reward
// rolls, hunting sessions, forge, upgrades, deliveries, ...) is called straight from src/game. The few things below are
// *orchestration glue that lives inside React components* (App.tsx / BattleModal.tsx) and cannot be imported; they are
// mirrored here line-for-line and say which lines they mirror:
//   - BattleModal.tsx `step` loop   -> runDungeon     (the requestAnimationFrame loop, made event-driven)
//   - App.tsx finishRun (412-488)   -> applyDungeonRun
//   - App.tsx enterDungeon (380-410), (gathering is src/game/gathering.ts now),
//     attrChange (1122-1131), claimQuest (600-614)
//   (refining, Alchemy and the Shop are src/game/craftActions.ts now: the very functions App.tsx calls)
// No combat or reward MATH is re-implemented: every number comes out of src/game.
import { DURABILITY_LOSS_PER_STAGE } from '../../src/game/gear';
import {
  addBattlePassXp,
  buildCombatStats,
  combatModifiersFromSave,
  computeCP,
  normalizeSave,
  playerLevel,
  SaveData,
} from '../../src/game/engine';
import { BurnState, applyDamageModifiers, applyDamageReduction, igniteBurn, nextBurnTickAt, reflectedDamage, regenAmount, tickBurn } from '../../src/game/derivedStats';
import {
  crossedMilestoneFloors,
  dungeonEnemyKindForFloor,
  dungeonRunXp,
  getBiomeForFloor,
  getMilestoneReward,
  MAX_DUNGEON_FLOOR,
  milestoneXpBonus,
} from '../../src/game/dungeon';
import { getEnemyDef } from '../../src/game/enemies';
import { applyDurabilityLoss, equippedSubstatTotals } from '../../src/game/gearInstances';
import { GemId } from '../../src/game/gems';
import { MaterialId } from '../../src/game/materials';
import { unlockedZoneIds } from '../../src/game/huntingZones';
import { isDungeonBoss, RunRewards, stageEnemyDmg, stageEnemyHp, waveRewards } from '../../src/game/waves';
import { UniqueDrop, addRelics, addUniqueInstance } from '../../src/game/uniques';
import { applyClaimGathering, applyStartGathering } from '../../src/game/gathering';
import { applyBuyConsumable, applyCraftPotion, applyRefine } from '../../src/game/craftActions';
import { ConsumableId } from '../../src/game/consumables';
import { addForced } from '../../src/game/inventory';
import { isClaimed, isComplete, QUESTS_ACHIEVEMENTS, QUESTS_DAILY, QuestContext } from '../../src/game/quests';
import { questMaxRefine } from '../../src/game/gearInstances';
import { activeTonicStats, goldMultiplier, isBuffActive } from '../../src/game/buffs';
import T from '../../src/game/tunables';

// ---- seeded RNG ---------------------------------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The engine rolls rarity, substats, wave rewards, crits and upgrade chances with Math.random. The sim replaces it
// for the duration of a run (and only there) with a seeded generator, then puts the original back.
export function withSeededRandom<R>(seed: number, fn: () => R): R {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

// ---- reload (what opening the game again does) --------------------------------------------------------------------

export function reload(save: SaveData): SaveData {
  // Date.now() is faked by the caller (vi.setSystemTime); normalizeSave also resets the daily quests / Dungeon sessions.
  return normalizeSave(JSON.parse(JSON.stringify(save)));
}

// ---- Dungeon -------------------------------------------------------------------------------------------------------

// Policy knobs (documented in the report header).
export const LOW_HP_RETREAT = 0.2; // a player who sees the bar under 20% after a floor retreats instead of walking into the next one

export interface DungeonRun {
  startFloor: number;
  stages: number; // floors cleared this run
  outcome: 'retreat' | 'defeat';
  complete: boolean; // cleared floor 100
  seconds: number; // wall clock at 1x speed (the UI has a 2x toggle)
  rewards: RunRewards; // gold already reduced on defeat (T.battle.defeatGoldKept), exactly like BattleModal.endCombat
  potionsUsed: number;
}

// Mirrors BattleModal.tsx: both sides start their attack timers when a wave starts, the hero swings every heroMs and the
// enemy every atkSpeedMs; a cleared wave pays waveRewards, heals playerMax * waveHeal, then waits intermissionMs; boss
// floors stop for the retreat / advance choice. Auto-potion rules are tryAutoPotion's.
// `maxStages` (diagnostics only): stop with a retreat after that many cleared floors, so a probe of one floor does not keep climbing.
export function runDungeon(save: SaveData, now: number, maxStages = Infinity): DungeonRun {
  // Tonics running when the run starts (Stoneskin / Haste / Precision) cover the whole climb: a run is minutes, a tonic lasts 30.
  const combat = activeTonicStats(buildCombatStats(save), save, now);
  const playerMax = combat.maxHp;
  const heroBase = applyDamageModifiers(combat.dmgBase, combatModifiersFromSave(save, now));
  const regen = regenAmount(playerMax, combat.hpRegenPct);
  const startFloor = save.highestDungeonFloor;
  const stock = {
    greater_elixir: save.consumables?.greater_elixir ?? 0,
    large_hp: save.consumables?.large_hp ?? 0,
    small_hp: save.consumables?.small_hp ?? 0,
  };
  const startPotions = stock.greater_elixir + stock.large_hp + stock.small_hp;
  let potionCooldownUntil = 0;
  let hp = playerMax;
  let clock = 0;
  let stage = startFloor;
  let stages = 0;
  let complete = false;
  let outcome: 'retreat' | 'defeat' = 'retreat';
  const acc: { gold: number; drops: Partial<Record<MaterialId, number>>; shards: number; gems: Partial<Record<GemId, number>>; uniques: UniqueDrop[]; relics: string[] } = { gold: 0, drops: {}, shards: 0, gems: {}, uniques: [], relics: [] };

  const tryAutoPotion = (t: number) => {
    if (t < potionCooldownUntil || hp >= playerMax * save.autoPotionThreshold) return;
    let id: keyof typeof stock | null = null;
    let heal = 0;
    if (stock.greater_elixir > 0) {
      id = 'greater_elixir';
      heal = playerMax * T.battle.greaterElixirHealPct;
    } else if (save.autoPotionPriority === 'small_first') {
      if (stock.small_hp > 0) {
        id = 'small_hp';
        heal = T.battle.potionHeal;
      } else if (stock.large_hp > 0) {
        id = 'large_hp';
        heal = T.battle.largePotionHeal;
      }
    } else if (stock.large_hp > 0) {
      id = 'large_hp';
      heal = T.battle.largePotionHeal;
    } else if (stock.small_hp > 0) {
      id = 'small_hp';
      heal = T.battle.potionHeal;
    }
    if (!id) return;
    stock[id] -= 1;
    potionCooldownUntil = t + T.battle.potionCooldownMs;
    hp = Math.min(playerMax, hp + Math.max(1, Math.round(heal)));
  };

  let guard = 0;
  waves: for (;;) {
    const def = getEnemyDef(dungeonEnemyKindForFloor(stage));
    let enemyHp = stageEnemyHp(def, stage);
    const hitTaken = applyDamageReduction(stageEnemyDmg(def, stage), combat.reduction);
    const reflected = reflectedDamage(hitTaken, combat.reflect);
    let heroNext = clock + combat.heroMs;
    let enemyNext = clock + def.atkSpeedMs;
    let regenNext = regen > 0 ? clock + T.battle.effectTickMs : Infinity;
    let burn: BurnState | null = null;
    // Event order at equal times: hero hit, enemy hit, burn tick, regeneration tick (huntCombat.ts attempt uses the same).
    for (;;) {
      if (++guard > 5_000_000) throw new Error('dungeon loop did not terminate');
      const burnNext = nextBurnTickAt(burn);
      const next = Math.min(heroNext, enemyNext, burnNext, regenNext);
      clock = next;
      if (heroNext === next) {
        const crit = Math.random() < combat.critChance;
        const dmg = Math.max(1, Math.round(heroBase * (crit ? combat.critMult : 1)));
        enemyHp = Math.max(0, enemyHp - dmg);
        if (combat.burn) burn = igniteBurn(burn, clock, heroBase);
        if (combat.lifesteal > 0) hp = Math.min(playerMax, hp + Math.max(1, Math.round(dmg * (combat.lifesteal / 100))));
        heroNext += combat.heroMs;
      } else if (enemyNext === next) {
        hp = Math.max(0, hp - hitTaken);
        enemyNext += def.atkSpeedMs;
        if (hp <= 0) {
          outcome = 'defeat';
          break waves;
        }
        enemyHp = Math.max(0, enemyHp - reflected);
      } else if (burnNext === next) {
        const tick = tickBurn(burn!);
        enemyHp = Math.max(0, enemyHp - tick.damage);
        burn = tick.burn;
      } else {
        hp = Math.min(playerMax, hp + regen);
        regenNext += T.battle.effectTickMs;
      }
      if (enemyHp <= 0) break;
      tryAutoPotion(clock);
    }

    // wave cleared
    const r = waveRewards(getBiomeForFloor(stage), stage);
    acc.gold += r.gold;
    acc.shards += r.shards;
    for (const [m, q] of Object.entries(r.drops)) acc.drops[m as MaterialId] = (acc.drops[m as MaterialId] ?? 0) + (q as number);
    for (const [g, q] of Object.entries(r.gems)) acc.gems[g as GemId] = (acc.gems[g as GemId] ?? 0) + (q as number);
    acc.uniques.push(...r.uniques);
    acc.relics.push(...r.relics);
    stages += 1;
    hp = Math.min(playerMax, Math.round(hp + playerMax * T.battle.waveHeal));
    if (stages >= maxStages) break;

    if (isDungeonBoss(stage)) {
      // Tension window: bank the run when this milestone has not been claimed yet (a defeat would forfeit it), otherwise push on.
      const unclaimed = !save.dungeonCheckpoints.includes(stage);
      if (unclaimed || stage >= MAX_DUNGEON_FLOOR) {
        complete = stage >= MAX_DUNGEON_FLOOR;
        break;
      }
    } else {
      if (stage >= MAX_DUNGEON_FLOOR) {
        complete = true;
        break;
      }
      if (hp / playerMax <= LOW_HP_RETREAT) break; // voluntary retreat
      clock += T.battle.intermissionMs;
    }
    stage += 1;
  }

  const gold = outcome === 'retreat' ? acc.gold : Math.floor(acc.gold * T.battle.defeatGoldKept);
  return {
    startFloor,
    stages,
    outcome,
    complete,
    seconds: clock / 1000,
    rewards: { gold, drops: acc.drops, shards: acc.shards, gems: acc.gems, uniques: acc.uniques, relics: acc.relics, stages },
    potionsUsed: startPotions - (stock.greater_elixir + stock.large_hp + stock.small_hp),
  };
}

export interface RunApplied {
  save: SaveData;
  goldFromRun: number;
  goldFromMilestones: number;
  crossed: number[];
}

// Mirrors App.tsx finishRun (412-488).
export function applyDungeonRun(s: SaveData, run: DungeonRun, now = Date.now()): RunApplied {
  const rewards = run.rewards;
  const outcome = run.outcome;
  const startFloor = run.startFloor;
  const looted = addForced(s, { materials: rewards.drops ?? {} });
  const stages = Math.max(0, rewards.stages);
  const success = outcome === 'retreat' && stages > 0;
  const atCap = playerLevel(s.xp) >= 100;
  const worn = stages > 0 ? applyDurabilityLoss(s, DURABILITY_LOSS_PER_STAGE * stages) : s;
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
  const goldGain = Math.round(rewards.gold * goldMultiplier(subs.goldBonus, isBuffActive(s, 'fortune', now)));
  const unlockedHuntingZones = Array.from(new Set([...s.unlockedHuntingZones, ...unlockedZoneIds(nextFloor)]));
  const crossed = success ? crossedMilestoneFloors(startFloor, stages, s.dungeonCheckpoints) : [];
  let gold = s.gold + goldGain;
  let gems = s.gems;
  if (rewards.gems && Object.keys(rewards.gems).length > 0) {
    const g = { ...gems };
    for (const [gid, qty] of Object.entries(rewards.gems)) g[gid as GemId] = (g[gid as GemId] ?? 0) + (qty as number);
    gems = g;
  }
  let cosmetics = s.cosmetics;
  let dungeonCheckpoints = s.dungeonCheckpoints;
  let goldFromMilestones = 0;
  if (crossed.length > 0) {
    dungeonCheckpoints = [...s.dungeonCheckpoints, ...crossed];
    for (const floor of crossed) {
      const reward = getMilestoneReward(floor);
      if (!reward) continue;
      gold += reward.gold;
      goldFromMilestones += reward.gold;
      const g = { ...gems };
      for (const [gid, qty] of Object.entries(reward.gems)) g[gid as GemId] = (g[gid as GemId] ?? 0) + (qty as number);
      gems = g;
      if (reward.titleId && !cosmetics.includes(reward.titleId)) cosmetics = [...cosmetics, reward.titleId];
    }
  }
  const xpGain = dungeonRunXp(startFloor, stages) + milestoneXpBonus(startFloor, stages);
  // Boss uniques (App.finishRun): delivered as stored gear instances even when the bag is over capacity - never lost.
  let delivered = worn;
  for (const drop of rewards.uniques ?? []) delivered = addUniqueInstance(delivered, drop, `dg${startFloor}`, 0);
  delivered = addRelics(delivered, rewards.relics ?? []);
  const save: SaveData = {
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
    inventory: delivered.inventory,
    blessed: false,
    quests,
    battlePassLevel,
    battlePassXp,
  };
  return { save, goldFromRun: goldGain, goldFromMilestones, crossed };
}

// Mirrors App.tsx enterDungeon (380-410) for a FREE session (the policy never pays shards for extra ones).
// null = refused (busy elsewhere or the free sessions are used up).
export function enterDungeon(s: SaveData, dayKey: string): SaveData | null {
  if (s.activeOreId || s.activeWoodId || s.activeHuntingZone) return null;
  const used = s.dungeonSessionsDay === dayKey ? s.dungeonSessionsUsed : 0;
  if (used >= T.dungeon.freeSessionsPerDay) return null;
  return { ...s, dungeonSessionsDay: dayKey, dungeonSessionsUsed: used + 1 };
}

// ---- Mining / Woodcutting (src/game/gathering.ts: the very functions App.tsx calls) ---------------------------------------------

export function startGathering(s: SaveData, kind: 'mine' | 'wood', id: string, now: number): SaveData | null {
  return applyStartGathering(s, kind === 'mine' ? 'mining' : 'woodcutting', id, now)?.save ?? null;
}

export interface GatherClaim {
  save: SaveData;
  material: MaterialId;
  units: number;
  leftBehind: number;
  hours: number;
}

export function claimGathering(s: SaveData, now: number): GatherClaim | null {
  const claim = applyClaimGathering(s, s.activeOreId ? 'mining' : 'woodcutting', now);
  return claim ? { save: claim.save, material: claim.material, units: claim.units, leftBehind: claim.leftBehind, hours: claim.hours } : null;
}

// ---- small shop / station actions ---------------------------------------------------------------------------------

// Refining stations, Alchemy and the Shop (craftActions.ts): null = refused (not enough gold / level / materials, or the result does not fit the inventory).
export function refineMaterial(s: SaveData, recipeId: string): SaveData | null {
  return applyRefine(s, recipeId).save ?? null;
}

export function craftPotion(s: SaveData, recipeId: ConsumableId): SaveData | null {
  return applyCraftPotion(s, recipeId).save ?? null;
}

export function buyConsumable(s: SaveData, id: ConsumableId): SaveData | null {
  return applyBuyConsumable(s, id).save ?? null;
}

// App.tsx claimQuest, for every quest that is complete and not claimed yet.
export function claimQuests(s: SaveData): { save: SaveData; gold: number } {
  let cur = s;
  let gold = 0;
  for (const def of [...QUESTS_DAILY, ...QUESTS_ACHIEVEMENTS]) {
    if (isClaimed(def, cur.quests)) continue;
    const ctx: QuestContext = { cp: computeCP(cur), maxRefine: questMaxRefine(cur) };
    if (!isComplete(def, cur.quests, ctx)) continue;
    const quests = { ...cur.quests };
    if (def.kind === 'daily') quests.dailyClaimed = [...quests.dailyClaimed, def.id];
    else quests.claimed = [...quests.claimed, def.id];
    cur = { ...cur, gold: cur.gold + def.gold, shards: cur.shards + def.shards, quests };
    gold += def.gold;
  }
  return { save: cur, gold };
}

// App.tsx attrChange (1122-1131) applied in bulk: 3 points per level, spread by fixed weights.
export const ATTR_WEIGHTS = { str: 0.35, vit: 0.3, agi: 0.2, res: 0.15 } as const;
export function spendAttributePoints(s: SaveData): SaveData {
  const total = playerLevel(s.xp) * 3;
  const next = { str: s.str, vit: s.vit, agi: s.agi, res: s.res };
  let spent = next.str + next.vit + next.agi + next.res;
  while (spent < total) {
    let best: keyof typeof next = 'str';
    let bestGap = -Infinity;
    for (const k of Object.keys(ATTR_WEIGHTS) as (keyof typeof next)[]) {
      const gap = ATTR_WEIGHTS[k] * (spent + 1) - next[k];
      if (gap > bestGap) {
        bestGap = gap;
        best = k;
      }
    }
    next[best] += 1;
    spent += 1;
  }
  return { ...s, ...next };
}
