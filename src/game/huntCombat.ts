import { MaterialId } from './materials';
import { HuntingDrop, HuntingDepth, effectiveDropChance } from './huntingZones';
import { applyDamageReduction } from './derivedStats';

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

export const HUNTING_SUBLEVELS = 10;

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
  depth: HuntingDepth;
  dropRateMult: number; // Battle Pass drop-rate multiplier, 1 if inactive
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

export interface HuntSessionResult {
  ceilingSubLevel: number; // highest sub-level fully cleared this session (never below resumeSubLevel-1)
  clearsAtCeiling: number; // additional ceiling clears farmed after first reaching it
  climbed: boolean; // true if ceilingSubLevel > resumeSubLevel - 1 (real progress happened)
  potionsUsed: HuntPotionStock;
  fightTimeUsedMs: number; // total ms across every COMPLETED (won) fight — the only time that earns reward
  xpReady: number;
  goldReady: number;
  drops: Partial<Record<MaterialId, number>>;
}

function enemyStatsAt(cfg: HuntZoneCombatCfg, subLevel: number) {
  const hp = Math.round(cfg.baseEnemyHp * cfg.depthMult * (1 + cfg.hpGrowth * (subLevel - 1)));
  const dmg = Math.round(cfg.baseEnemyDmg * cfg.depthMult * (1 + cfg.dmgGrowth * (subLevel - 1)));
  return { hp, dmg, atkMs: cfg.enemyAtkMs };
}

export function simulateHuntingSession(
  build: HuntCombatBuild,
  zoneCfg: HuntZoneCombatCfg,
  resumeSubLevel: number,
  sessionMs: number,
  potionCfg: HuntPotionCfg,
  waveHealPct: number,
  seedKey: string,
): HuntSessionResult {
  const rng = mulberry32(hashSeed(seedKey));
  const stock: HuntPotionStock = { ...potionCfg.stock };
  const potionsUsed: HuntPotionStock = { greater_elixir: 0, large_hp: 0, small_hp: 0 };
  const drops: Partial<Record<MaterialId, number>> = {};

  let timeLeft = sessionMs;
  let fightTimeUsedMs = 0;
  let potionCooldownUntil = 0;
  let ceilingSubLevel = Math.max(0, resumeSubLevel - 1);
  let clearsAtCeiling = 0;

  const rollDropsForOneClear = () => {
    for (const entry of zoneCfg.drops) {
      const chance = effectiveDropChance(entry, zoneCfg.depth) * zoneCfg.dropRateMult;
      if (rng() < chance) drops[entry.material] = (drops[entry.material] ?? 0) + entry.qty;
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
  const attempt = (subLevel: number, startHp: number) => {
    const enemy = enemyStatsAt(zoneCfg, subLevel);
    // Layer 2 (Damage Reduction) — asymptotic, see derivedStats.ts. This assembly step is mirrored
    // inline in BattleModal.tsx's monsterAttack; keep both in sync.
    const dmgTaken = applyDamageReduction(enemy.dmg, build.reduction);
    const hpRef = { hp: startHp };
    let enemyHp = enemy.hp;
    let heroNext = build.heroMs;
    let enemyNext = enemy.atkMs;
    let t = 0;
    while (hpRef.hp > 0 && enemyHp > 0) {
      const nextEvent = Math.min(heroNext, enemyNext);
      if (nextEvent > timeLeft) return null;
      t = nextEvent;
      if (heroNext <= enemyNext) {
        const crit = rng() < build.critChance;
        const dmg = Math.max(1, Math.round(build.heroDmgBase * (crit ? build.critMult : 1)));
        enemyHp -= dmg;
        if (build.lifestealPct > 0) {
          hpRef.hp = Math.min(build.playerMax, hpRef.hp + Math.max(1, Math.round(dmg * (build.lifestealPct / 100))));
        }
        heroNext += build.heroMs;
      } else {
        hpRef.hp -= dmgTaken;
        enemyNext += enemy.atkMs;
      }
      tryAutoPotion(t, hpRef);
      if (hpRef.hp <= 0) {
        timeLeft -= t;
        return { win: false, timeMs: t };
      }
    }
    timeLeft -= t;
    return { win: true, timeMs: t, hpAfter: hpRef.hp };
  };

  // Climb: sequential single attempts starting from the sub-level the player hasn't yet proven they
  // can clear. A win advances (with the same partial heal Dungeon waves use between floors); a loss
  // stops the climb for good this session — the last level actually cleared becomes the safe ceiling.
  let hp = build.playerMax;
  let sub = resumeSubLevel;
  let firstAttempt = true;
  while (timeLeft > 0 && sub <= HUNTING_SUBLEVELS) {
    const startHp = firstAttempt ? build.playerMax : Math.min(build.playerMax, hp + Math.round(build.playerMax * waveHealPct));
    firstAttempt = false;
    const r = attempt(sub, startHp);
    if (!r) break;
    if (r.win) {
      fightTimeUsedMs += r.timeMs;
      rollDropsForOneClear();
      ceilingSubLevel = sub;
      hp = r.hpAfter ?? build.playerMax;
      sub++;
    } else {
      break;
    }
  }

  // Farm: once there's a proven ceiling (or none was ever reached), keep re-attempting it — fresh HP
  // each time, like re-entering the same encounter — for whatever idle time remains.
  const farmLevel = ceilingSubLevel > 0 ? ceilingSubLevel : 1;
  while (timeLeft > 0) {
    const r = attempt(farmLevel, build.playerMax);
    if (!r) break;
    if (r.win) {
      fightTimeUsedMs += r.timeMs;
      rollDropsForOneClear();
      clearsAtCeiling++;
    }
    // A loss at the farm level just costs that attempt's time — it's already deducted from timeLeft
    // inside attempt(); the loop simply retries the same proven-safe level next.
  }

  const hours = fightTimeUsedMs / (3600 * 1000);
  return {
    ceilingSubLevel,
    clearsAtCeiling,
    climbed: ceilingSubLevel > Math.max(0, resumeSubLevel - 1),
    potionsUsed,
    fightTimeUsedMs,
    xpReady: Math.floor(hours * zoneCfg.xpPerHour),
    goldReady: Math.floor(hours * zoneCfg.goldPerHour),
    drops,
  };
}
