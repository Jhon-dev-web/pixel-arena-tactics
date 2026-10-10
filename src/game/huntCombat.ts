import { MaterialId } from './materials';
import { UniqueDrop, rollUniqueDrop } from './uniques';
import { HuntingDrop, HuntingDepth, HuntingUnique, effectiveDropChance } from './huntingZones';
import { BurnState, applyDamageReduction, igniteBurn, nextBurnTickAt, reflectedDamage, regenAmount, tickBurn } from './derivedStats';
import T from './tunables';
import { economicRollFractionForFight } from './huntEconomy';
import { inRelativeWindows } from './huntSession';

// Open Hunting's idle session is now real combat instead of a smooth time-based EV formula, using the
// exact same per-hit formulas as the Dungeon (BattleModal.tsx) — this module intentionally does NOT
// reimplement that math from scratch, it's handed pre-derived combat stats by the caller (engine.ts,
// which already has playerMaxHp/getEquipped/gems/substats available) so this file stays a dependency
// of engine.ts rather than the other way around (avoids a circular import).
//
// Because this same simulation is re-run from scratch every time the UI polls for a live preview
// (computeHuntingStatus is called every ~1s while the Hunt tab is open), its RNG must be deterministic
// for a given session — otherwise the previewed sub-level/rewards would flicker on every tick. A tiny
// seeded PRNG (mulberry32) keyed off the session's own start time stands in for Math.random() here.

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HuntCombatBuild {
  playerMax: number;
  heroDmgBase: number; // pre-crit hit damage, already including weapon/str/blessed/strength-buff factors
  critChance: number;
  critMult: number;
  heroMs: number; // hero attack interval
  reduction: number; // fraction of incoming enemy damage negated
  lifestealPct: number; // 0..100, matches subs.lifesteal
  burn: boolean; // gear effects, see derivedStats.ts (igniteBurn / reflectedDamage / regenAmount)
  reflect: number;
  hpRegenPct: number;
  goldBonusPct?: number; // gear gold bonus (CombatStats.goldBonus): raises the Gold of the fight time, not the XP or the drops
}

export interface HuntZoneCombatCfg {
  baseEnemyHp: number;
  baseEnemyDmg: number;
  enemyAtkMs: number;
  hpGrowth: number; // per sub-level, compounding like stageEnemyHp/Dmg in waves.ts
  dmgGrowth: number;
  depthMult: number; // shared hp/dmg multiplier for the chosen depth
  goldPerHour: number;
  xpPerHour: number; // already includes the depth's xpMultiplier
  drops: HuntingDrop[];
  uniques?: HuntingUnique[];
  depth: HuntingDepth;
  dropRateMult: number; // Battle Pass drop-rate multiplier, 1 if inactive
}

// Time-dependent modifiers of a session, as SESSION-RELATIVE windows in ms (Infinity = open-ended): while a Strength and/or
// Attack Elixir window covers a hit the hero deals the matching pre-multiplied base (`dmgStrength` / `dmgAttack` /
// `dmgBoth`) instead of `build.heroDmgBase` (no elixir); while a Battle Pass window
// covers a cleared fight the drop chance uses `passDropMult`. Outside every window the plain values apply, so a modifier
// that was not active at that moment can never be applied retroactively. Omitted = constant (zoneCfg.dropRateMult).
export interface HuntTimeline {
  strengthWindows: [number, number][];
  attackWindows: [number, number][];
  dmgStrength: number;
  dmgAttack: number;
  dmgBoth: number;
  passWindows: [number, number][];
  passDropMult: number;
  // Garden 3.0 tonics (buffs.ts): while a window covers an action, that action uses the matching value instead of the build's (reduction for an enemy hit,
  // attack interval and crit chance for a hero hit); Fortune adds `fortuneGoldPct` to the gold of the fight time it covers. All optional = no tonics.
  stoneWindows?: [number, number][];
  hasteWindows?: [number, number][];
  precisionWindows?: [number, number][];
  fortuneWindows?: [number, number][];
  reductionStone?: number;
  heroMsHaste?: number;
  critPrecision?: number;
  fortuneGoldPct?: number;
}

export interface HuntPotionStock {
  greater_elixir: number;
  large_hp: number;
  small_hp: number;
}

export interface HuntPotionCfg {
  threshold: number;
  priority: 'small_first' | 'large_first';
  stock: HuntPotionStock;
  greaterElixirHealPct: number;
  potionHeal: number;
  largePotionHeal: number;
  cooldownMs: number;
}

// A snapshot of whichever fight the deterministic replay was mid-way through (or just about to start)
// at the moment the session's time budget ran out — this is "the current fight" for display purposes,
// e.g. HuntModal's HP bars. Not persisted; recomputed fresh (and consistently, thanks to the seeded
// RNG) every time the session is re-simulated for a live preview.
export interface HuntLiveSnapshot {
  subLevel: number;
  heroHp: number;
  heroMax: number;
  enemyHp: number;
  enemyMax: number;
}

// Persistent per zone+depth mastery state: the highest sub-level the player has proven they can clear
// (`ceiling`, the level being farmed) and how many wins at that level they've banked toward the next
// promotion attempt. It only ever changes through simulateHuntingSession's result — never by claiming.
export interface HuntProgress {
  ceiling: number;
  promotionWins: number;
}

export interface HuntPromotionCfg {
  maxLevel: number;
  requiredWins: (ceiling: number) => number; // wins needed AT `ceiling` before attempting ceiling + 1
}

export interface HuntSessionResult {
  ceilingSubLevel: number; // ceiling at the end of the session (start ceiling + promotions won)
  promotionWins: number; // wins banked at that ceiling toward the next attempt (0 at max level)
  promotions: number; // promotion attempts won this session
  promotionLosses: number; // promotion attempts lost this session
  kills: number; // fights won this session (promotion wins included) - display only, nothing else reads it
  defeats: number; // fights lost this session (promotion losses included) - display only
  potionsUsed: HuntPotionStock;
  fightTimeUsedMs: number; // total ms across every COMPLETED (won) fight — the only time that earns reward
  xpReady: number;
  goldReady: number;
  drops: Partial<Record<MaterialId, number>>;
  uniques: UniqueDrop[]; // unique pieces rolled this session (their own seeded stream, see rollDropsForOneClear)
  liveSnapshot: HuntLiveSnapshot | null;
}

function enemyStatsAt(cfg: HuntZoneCombatCfg, subLevel: number) {
  const hp = Math.round(cfg.baseEnemyHp * cfg.depthMult * (1 + cfg.hpGrowth * (subLevel - 1)));
  const dmg = Math.round(cfg.baseEnemyDmg * cfg.depthMult * (1 + cfg.dmgGrowth * (subLevel - 1)));
  return { hp, dmg, atkMs: cfg.enemyAtkMs };
}

export function simulateHuntingSession(
  build: HuntCombatBuild,
  zoneCfg: HuntZoneCombatCfg,
  start: HuntProgress,
  sessionMs: number,
  potionCfg: HuntPotionCfg,
  seedKey: string,
  promotion: HuntPromotionCfg,
  timeline?: HuntTimeline,
): HuntSessionResult {
  const rng = mulberry32(hashSeed(seedKey));
  const stock: HuntPotionStock = { ...potionCfg.stock };
  const potionsUsed: HuntPotionStock = { greater_elixir: 0, large_hp: 0, small_hp: 0 };
  const drops: Partial<Record<MaterialId, number>> = {};
  // Uniques roll on a SEPARATE seeded stream so adding them changed no fight, crit, material or promotion outcome of the main one.
  const uniqueRng = mulberry32(hashSeed(seedKey + ':unique'));
  // Drop entries flagged `ownStream` (a zone's later additions) draw from their own stream too, for the same reason.
  const ownRng = mulberry32(hashSeed(seedKey + ':zone'));
  const uniques: UniqueDrop[] = [];

  let timeLeft = sessionMs;
  let fightTimeUsedMs = 0;
  let fortuneFightMs = 0; // fight time that ended inside a Fortune Tonic window (extra gold)
  let potionCooldownUntil = 0;
  let ceiling = Math.min(promotion.maxLevel, Math.max(1, Math.floor(start.ceiling)));
  let promotionWins = ceiling >= promotion.maxLevel ? 0 : Math.max(0, Math.floor(start.promotionWins));
  let promotions = 0;
  let promotionLosses = 0;
  let kills = 0;
  let defeats = 0;
  let liveSnapshot: HuntLiveSnapshot | null = null;

  // `subLevel` is the sub-level of the enemy that was just defeated (a promotion win counts at the new level)
  // and `fightMs` how long that fight lasted. Chance = base x depth x sub-level x Battle Pass (as before), then
  // the economic normalization (huntEconomy.ts) scales it by the fraction of kills that count for that fight's
  // pace. RNG: the SAME single draw per drop entry, in the same order, as before the economic model — the
  // fraction only scales the threshold the draw is compared against. So the fight/crit sequence (and every
  // kill, XP, Gold and promotion outcome) is bit-for-bit unchanged, and every drop that still happens is a drop
  // that would also have happened without the model. Promotion wins go through the exact same gate.
  // `timeLeft` is already reduced by the fight when this runs, so sessionMs - timeLeft is the moment the fight ended.
  const rollDropsForOneClear = (subLevel: number, fightMs: number) => {
    const economicFraction = economicRollFractionForFight(fightMs, subLevel);
    const dropMult = timeline ? (inRelativeWindows(timeline.passWindows, sessionMs - timeLeft) ? timeline.passDropMult : 1) : zoneCfg.dropRateMult;
    for (const entry of zoneCfg.drops) {
      const chance = effectiveDropChance(entry, zoneCfg.depth, subLevel) * dropMult * economicFraction;
      if ((entry.ownStream ? ownRng() : rng()) < chance) drops[entry.material] = (drops[entry.material] ?? 0) + entry.qty;
    }
    // Unique pieces: base chance x the same economic fraction as the materials (no depth / sub-level / Battle Pass multiplier). They never touch
    // the material stacks (they are not materials); the claim delivers them as gear instances.
    for (const u of zoneCfg.uniques ?? []) {
      if (uniqueRng() < u.chance * economicFraction) uniques.push(rollUniqueDrop(u.itemId, uniqueRng));
    }
  };

  const tryAutoPotion = (now: number, hpRef: { hp: number }) => {
    if (now < potionCooldownUntil) return;
    if (hpRef.hp >= build.playerMax * potionCfg.threshold) return;
    let healed = 0;
    let used: keyof HuntPotionStock | null = null;
    if (stock.greater_elixir > 0) {
      used = 'greater_elixir';
      healed = build.playerMax * potionCfg.greaterElixirHealPct;
    } else if (potionCfg.priority === 'small_first') {
      if (stock.small_hp > 0) {
        used = 'small_hp';
        healed = potionCfg.potionHeal;
      } else if (stock.large_hp > 0) {
        used = 'large_hp';
        healed = potionCfg.largePotionHeal;
      }
    } else if (stock.large_hp > 0) {
      used = 'large_hp';
      healed = potionCfg.largePotionHeal;
    } else if (stock.small_hp > 0) {
      used = 'small_hp';
      healed = potionCfg.potionHeal;
    }
    if (!used) return;
    stock[used]--;
    potionsUsed[used]++;
    hpRef.hp = Math.min(build.playerMax, hpRef.hp + Math.max(1, Math.round(healed)));
    potionCooldownUntil = now + potionCfg.cooldownMs;
  };

  // One full, fresh-HP attempt at `subLevel`. Returns null if the session's remaining idle time ran
  // out mid-fight (that attempt doesn't count either way — nothing to persist from an unfinished fight).
  // Event order at equal times: hero hit, enemy hit, burn tick, regeneration tick (scripts/sim/driver.ts runDungeon uses the same).
  const attempt = (subLevel: number, startHp: number) => {
    const enemy = enemyStatsAt(zoneCfg, subLevel);
    // Layer 2 (Damage Reduction) — asymptotic, see derivedStats.ts. This assembly step is mirrored
    // inline in BattleModal.tsx's monsterAttack; keep both in sync.
    const dmgTakenBase = applyDamageReduction(enemy.dmg, build.reduction);
    const regen = regenAmount(build.playerMax, build.hpRegenPct);
    const hpRef = { hp: startHp };
    let enemyHp = enemy.hp;
    let heroNext = build.heroMs;
    let enemyNext = enemy.atkMs;
    let regenNext = regen > 0 ? T.battle.effectTickMs : Infinity;
    let burn: BurnState | null = null;
    let t = 0;
    // Snapshot at fight start too, so a brand-new attempt has something to show even before its
    // first hit lands (e.g. the very first poll of a freshly-started session).
    liveSnapshot = { subLevel, heroHp: hpRef.hp, heroMax: build.playerMax, enemyHp, enemyMax: enemy.hp };
    while (hpRef.hp > 0 && enemyHp > 0) {
      const burnNext = nextBurnTickAt(burn);
      const nextEvent = Math.min(heroNext, enemyNext, burnNext, regenNext);
      if (nextEvent > timeLeft) return null;
      t = nextEvent;
      if (heroNext === nextEvent) {
        const atHit = sessionMs - timeLeft + t;
        const precise = !!timeline?.precisionWindows && inRelativeWindows(timeline.precisionWindows, atHit);
        const crit = rng() < (precise ? (timeline!.critPrecision ?? build.critChance) : build.critChance);
        let hitBase = build.heroDmgBase;
        if (timeline) {
          const at = atHit;
          const str = inRelativeWindows(timeline.strengthWindows, at);
          const atk = inRelativeWindows(timeline.attackWindows, at);
          hitBase = str && atk ? timeline.dmgBoth : str ? timeline.dmgStrength : atk ? timeline.dmgAttack : build.heroDmgBase;
        }
        const dmg = Math.max(1, Math.round(hitBase * (crit ? build.critMult : 1)));
        enemyHp -= dmg;
        if (build.burn) burn = igniteBurn(burn, t, hitBase);
        if (build.lifestealPct > 0) {
          hpRef.hp = Math.min(build.playerMax, hpRef.hp + Math.max(1, Math.round(dmg * (build.lifestealPct / 100))));
        }
        const hasted = !!timeline?.hasteWindows && inRelativeWindows(timeline.hasteWindows, atHit);
        heroNext += hasted ? (timeline!.heroMsHaste ?? build.heroMs) : build.heroMs;
      } else if (enemyNext === nextEvent) {
        const stoned = !!timeline?.stoneWindows && inRelativeWindows(timeline.stoneWindows, sessionMs - timeLeft + t);
        const dmgTaken = stoned ? applyDamageReduction(enemy.dmg, timeline!.reductionStone ?? build.reduction) : dmgTakenBase;
        hpRef.hp -= dmgTaken;
        if (hpRef.hp > 0) enemyHp -= reflectedDamage(dmgTaken, build.reflect);
        enemyNext += enemy.atkMs;
      } else if (burnNext === nextEvent) {
        const tick = tickBurn(burn!);
        enemyHp -= tick.damage;
        burn = tick.burn;
      } else {
        hpRef.hp = Math.min(build.playerMax, hpRef.hp + regen);
        regenNext += T.battle.effectTickMs;
      }
      tryAutoPotion(t, hpRef);
      liveSnapshot = { subLevel, heroHp: Math.max(0, hpRef.hp), heroMax: build.playerMax, enemyHp: Math.max(0, enemyHp), enemyMax: enemy.hp };
      if (hpRef.hp <= 0) {
        timeLeft -= t;
        return { win: false, timeMs: t };
      }
    }
    timeLeft -= t;
    return { win: true, timeMs: t, hpAfter: hpRef.hp };
  };

  // The session starts directly at the saved ceiling — there is no climb and no free attempt at higher
  // levels. Every win at the ceiling banks progress; once the current level's requirement is met, the
  // next loop iteration is a single full-HP promotion attempt against ceiling + 1. It costs real session
  // time like any fight, only pays out (and promotes) if won, and either way restarts the win counter.
  while (timeLeft > 0) {
    if (ceiling < promotion.maxLevel && promotionWins >= promotion.requiredWins(ceiling)) {
      const r = attempt(ceiling + 1, build.playerMax);
      if (!r) break;
      promotionWins = 0;
      if (r.win) {
        kills++;
        fightTimeUsedMs += r.timeMs;
        if (timeline?.fortuneWindows && inRelativeWindows(timeline.fortuneWindows, sessionMs - timeLeft)) fortuneFightMs += r.timeMs;
        rollDropsForOneClear(ceiling + 1, r.timeMs);
        ceiling++;
        promotions++;
      } else {
        promotionLosses++;
        defeats++;
      }
      continue;
    }
    const r = attempt(ceiling, build.playerMax);
    if (!r) break;
    if (r.win) {
      kills++;
      fightTimeUsedMs += r.timeMs;
      if (timeline?.fortuneWindows && inRelativeWindows(timeline.fortuneWindows, sessionMs - timeLeft)) fortuneFightMs += r.timeMs;
      rollDropsForOneClear(ceiling, r.timeMs);
      if (ceiling < promotion.maxLevel) promotionWins++;
    } else {
      defeats++;
    }
    // A loss at the farm level just costs that attempt's time — it's already deducted from timeLeft
    // inside attempt(); the loop simply retries the same level next.
  }

  const hours = fightTimeUsedMs / (3600 * 1000);
  return {
    ceilingSubLevel: ceiling,
    promotionWins,
    promotions,
    promotionLosses,
    kills,
    defeats,
    potionsUsed,
    fightTimeUsedMs,
    xpReady: Math.floor(hours * zoneCfg.xpPerHour),
    goldReady: Math.floor((hours * (1 + (build.goldBonusPct ?? 0) / 100) + (fortuneFightMs / (3600 * 1000)) * (timeline?.fortuneGoldPct ?? 0)) * zoneCfg.goldPerHour),
    drops,
    uniques,
    liveSnapshot,
  };
}
