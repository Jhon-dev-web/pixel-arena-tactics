type Tunable<T> = T extends { value: infer V }
  ? V
  : T extends object
    ? { [K in keyof T]: Tunable<T[K]> }
    : T;

interface DebugPanelApi {
  define<S extends object>(schema: S): Tunable<S>;
}

declare global {
  interface Window {
    DebugPanel: DebugPanelApi;
  }
}

const DebugPanel = window.DebugPanel;

/* TUNABLES CONTRACT — read before editing this file.
   1. Every gameplay/UI constant lives in the DebugPanel.define schema below. Never inline new literals.
   2. Tuning requests and [TUNING] pastes edit these defaults ONLY — never restructure other code.
   3. The panel library is platform-injected; never add a local copy or a script tag for it.
   4. New feature => add its constants to the schema; the panel picks them up automatically. */

let onBump: (() => void) | null = null;
export function setTunableListener(fn: (() => void) | null) {
  onBump = fn;
}
const bump = () => {
  if (onBump) onBump();
};

const T = DebugPanel.define({
  combat: {
    _label: 'Combat',
    attackMin: { value: 10, min: 5, max: 80, step: 1, label: 'Attack damage (min)' },
    attackMax: { value: 15, min: 5, max: 100, step: 1, label: 'Attack damage (max)' },
    critMult: { value: 2, min: 1.5, max: 4, step: 0.1, label: 'Critical multiplier (×)' },
    attackStamina: { value: 15, min: 0, max: 60, step: 1, label: 'Attack stamina cost', onChange: bump },
    shieldStamina: { value: 25, min: 0, max: 60, step: 1, label: 'Shield stamina cost', onChange: bump },
    shieldReduction: { value: 0.7, min: 0.1, max: 0.95, step: 0.05, label: 'Shield damage reduction' },
    focusStamina: { value: 40, min: 5, max: 100, step: 1, label: 'Focus stamina recovery', onChange: bump },
    focusHp: { value: 12, min: 1, max: 60, step: 1, label: 'Focus HP recovery', onChange: bump },
    enemyAtkMin: { value: 18, min: 5, max: 80, step: 1, label: 'Enemy damage (min)' },
    enemyAtkMax: { value: 26, min: 5, max: 100, step: 1, label: 'Enemy damage (max)' },
  },
  battle: {
    _label: 'Auto-Battle',
    heroAttackMs: { value: 1200, min: 300, max: 3000, step: 50, label: 'Hero attack interval (ms)' },
    // AGI -> attack interval (see derivedStats.ts heroAttackIntervalMs): hyperbolic approach from heroAttackMs
    // (AGI 0) down to heroMinMs, halfway there at agiHalfPoint AGI. Replaces the old linear agiSpeedPerPoint.
    heroMinMs: { value: 400, min: 100, max: 1200, step: 50, label: 'Hero attack interval floor (ms, AGI asymptote)' },
    agiHalfPoint: { value: 80, min: 10, max: 1000, step: 10, label: 'AGI at which the interval is halfway to the floor' },
    agiMax: { value: 300, min: 1, max: 1000, step: 1, label: 'AGI clamp used in combat (= max level 100 x 3 points)' },
    lungeMs: { value: 320, min: 80, max: 900, step: 20, cssVar: '--lunge-ms', unit: 'ms', label: 'Lunge animation (ms)' },
    flashMs: { value: 250, min: 50, max: 800, step: 25, cssVar: '--flash-ms', unit: 'ms', label: 'Hit flash (ms)' },
    lungeDist: { value: 18, min: 4, max: 60, step: 2, cssVar: '--lunge-dist', unit: 'px', label: 'Lunge distance' },
    waveHeal: { value: 0.3, min: 0, max: 1, step: 0.01, label: 'HP healed after wave (ratio)' },
    // Gear effects over time (derivedStats.ts igniteBurn / regenAmount). Burn: a weapon with `burn` sets or refreshes it on every hit, it lasts burnDurationMs
    // and deals burnPctPerSec of that hit's final damage (before crit) once per effectTickMs, never stacking. Regen (relic hpRegenPct) uses the same tick.
    burnPctPerSec: { value: 0.06, min: 0.01, max: 0.5, step: 0.01, label: 'Burn damage per second (share of the hit)' },
    burnDurationMs: { value: 3000, min: 1000, max: 10000, step: 500, label: 'Burn duration (ms)' },
    effectTickMs: { value: 1000, min: 250, max: 3000, step: 250, label: 'Burn / regeneration tick (ms)' },
    // Share of a Dungeon run's gold the hero keeps when the run ends in defeat (a retreat keeps 100%). BattleModal.endCombat.
    defeatGoldKept: { value: 0.75, min: 0, max: 1, step: 0.05, label: 'Gold kept on Dungeon defeat (ratio)' },
    intermissionMs: { value: 1000, min: 300, max: 3000, step: 100, label: 'Wave interval (ms)' },
    hpGrowth: { value: 0.15, min: 0, max: 1, step: 0.01, label: 'Monster HP growth per stage' },
    dmgGrowth: { value: 0.12, min: 0, max: 1, step: 0.01, label: 'Monster damage growth per stage' },
    // Round 15: floors 51+ get one more factor on top of the base curve, piecewise linear and continuous: 1 + late * (stages past 50, at most 25) + late2 * (stages past 75), so the
    // second half of the Dungeon (and the Profundezas, which scale the floor-99 monster) can be paced on its own without touching floors 1-50.
    // Round 17: floors 76-100 were retuned (0.07 / 0.041 -> 0.125 / 0.078, the floor-100 boss 1.2 -> 1.17) once the sim player refined properly (the late-game sinks of round 16): arrival at floor 100
    // moved from day 75 to day 123 and the boss from day 95 to day 143 (owner: 86 and 102); the floor-100 boss stays 1.5x the floor before it (balance.test.ts). Floors 1-75 are untouched.
    lateHpGrowth: { value: 0.012, min: 0, max: 1, step: 0.005, label: 'Extra monster HP growth per stage, floors 51-75' },
    lateHpGrowth2: { value: 0.125, min: 0, max: 1, step: 0.005, label: 'Extra monster HP growth per stage, floors 76-100' },
    lateDmgGrowth: { value: 0.009, min: 0, max: 1, step: 0.005, label: 'Extra monster damage growth per stage, floors 51-75' },
    lateDmgGrowth2: { value: 0.078, min: 0, max: 1, step: 0.005, label: 'Extra monster damage growth per stage, floors 76-100' },
    goldRewardGrowth: { value: 0.012, min: 0, max: 1, step: 0.001, label: 'Gold/drop-qty growth per stage' },
    miniBossEvery: { value: 10, min: 3, max: 20, step: 1, label: 'Dungeon checkpoint every N floors' },
    miniBossHpMult: { value: 1.5, min: 1, max: 3, step: 0.1, label: 'Checkpoint HP multiplier' },
    miniBossDmgMult: { value: 1.25, min: 1, max: 3, step: 0.05, label: 'Checkpoint damage multiplier' },
    miniBossShards: { value: 2, min: 1, max: 5, step: 1, label: 'Checkpoint shard drop' },
    bossEvery: { value: 25, min: 10, max: 50, step: 5, label: 'Dungeon main boss every N floors' },
    // Applied on top of the already-compounded hpGrowth/dmgGrowth curve (see stageEnemyHp/Dmg in waves.ts) —
    // at high stages that curve alone already tracks a level-appropriate build's power, so these stay low:
    // bossHpMult keeps HP moderately above a same-stage mob (fight length), bossDmgMult intentionally sits
    // under 1x so a boss's per-hit damage doesn't outscale what a same-tier build's defense can absorb.
    // Balance pass (docs/BALANCE_CHANGES.md): the floor-25 boss was 13x the HP and 6x the hit of floor 24 and no seed beat it in 14 days. The
    // fix is NOT here and NOT in the boss EnemyDef base stats (that def is also the regular mob of floors 76-99, which must stay as they
    // were): bossHpMult / bossDmgMult below apply to every boss floor and to floors 76-99, so each of the four biome bosses has its own
    // multiplier on top (bossNNHpMult / bossNNDmgMult, waves.ts bossFloorMult). bossDmgMult must stay >= ~0.25 so floor 76 never drops
    // below floor 74 (balance.test.ts).
    // Earlier history, retuned from 1.2/0.3: at 0.3, per-hit boss damage was so far under HP scaling that a "recommended CP"
    // build's win rate barely depended on defense at all (see project memory on the CP recalibration
    // session) — 0.45/1.05 puts real risk back on a single exchange (~11% of max HP per hit at the
    // recalibrated CP, confirmed via tick-loop simulation to stay far from one-shot territory) without
    // reintroducing the pre-nerf one-shot problem that motivated dropping bossDmgMult from 1.8 in the
    // first place. bossHpMult nudged down slightly (1.2->1.05) to keep fight length comparable.
    bossHpMult: { value: 1.05, min: 0.5, max: 5, step: 0.05, label: 'Main boss HP multiplier' },
    bossDmgMult: { value: 0.45, min: 0.1, max: 4, step: 0.05, label: 'Main boss damage multiplier' },
    // Per-boss-floor multipliers, applied ONLY on the four biome-boss floors (isDungeonBoss) on top of bossHpMult / bossDmgMult.
    // 25: the wall (was 13x the HP of floor 24 with 1x); 50: sized so the first kills land around day 12-16; 75: untouched; 100: 1.44x power so the
    // last boss is >= 1.5x floor 99 (the regular boss-mob floors 76-99 are exactly as they were before the balance pass).
    boss25HpMult: { value: 0.3, min: 0.1, max: 5, step: 0.01, label: 'Floor-25 boss: extra HP multiplier' },
    boss25DmgMult: { value: 1, min: 0.1, max: 5, step: 0.01, label: 'Floor-25 boss: extra damage multiplier' },
    boss50HpMult: { value: 0.88, min: 0.1, max: 5, step: 0.01, label: 'Floor-50 boss: extra HP multiplier' },
    boss50DmgMult: { value: 0.88, min: 0.1, max: 5, step: 0.01, label: 'Floor-50 boss: extra damage multiplier' },
    boss75HpMult: { value: 1, min: 0.1, max: 5, step: 0.01, label: 'Floor-75 boss: extra HP multiplier' },
    boss75DmgMult: { value: 1, min: 0.1, max: 5, step: 0.01, label: 'Floor-75 boss: extra damage multiplier' },
    boss100HpMult: { value: 1.17, min: 0.1, max: 5, step: 0.01, label: 'Floor-100 boss: extra HP multiplier' },
    boss100DmgMult: { value: 1.17, min: 0.1, max: 5, step: 0.01, label: 'Floor-100 boss: extra damage multiplier' },
    bossShards: { value: 5, min: 1, max: 20, step: 1, label: 'Main boss shard drop' },
    // Chance that clearing a biome boss (floors 25 / 50 / 75 / 100) also drops that boss's unique piece (uniques.ts). Rolled on every victory, repeatable.
    uniqueBossChance: { value: 0.03, min: 0, max: 1, step: 0.01, label: 'Biome boss unique drop chance (per victory)' },
    // Chance that the same victory also drops that boss's relic (uniques.ts BOSS_RELIC_DROPS), rolled on its own, independent of the unique piece.
    relicBossChance: { value: 0.03, min: 0, max: 1, step: 0.01, label: 'Biome boss relic drop chance (per victory)' },
    miniBossGoldMult: { value: 2.5, min: 1, max: 10, step: 0.5, label: 'Checkpoint wave gold multiplier' },
    bossGoldMult: { value: 5, min: 1, max: 15, step: 0.5, label: 'Main boss wave gold multiplier' },
    potionThreshold: { value: 0.35, min: 0.05, max: 0.9, step: 0.05, label: 'Auto-potion HP threshold (ratio)' },
    potionHeal: { value: 50, min: 10, max: 500, step: 10, label: 'Auto-potion heal (HP, small_hp)' },
    largePotionHeal: { value: 150, min: 10, max: 1000, step: 10, label: 'Auto-potion heal (HP, large_hp)' },
    greaterElixirHealPct: { value: 0.5, min: 0.1, max: 1, step: 0.05, label: 'Greater Elixir heal (% of max HP)' },
    potionCooldownMs: { value: 5000, min: 1000, max: 15000, step: 500, label: 'Auto-potion cooldown (ms)' },
    strengthElixirDmgPct: { value: 0.2, min: 0.05, max: 1, step: 0.05, label: 'Strength Elixir damage bonus (%)' },
    strengthElixirMinutes: { value: 30, min: 1, max: 180, step: 1, label: 'Strength Elixir duration (minutes)' },
    // Attack (Battle) Elixir: a second, independent timed damage buff. It never stacks with itself (using it again only
    // renews the duration); it multiplies with the Strength Elixir / Blessed like every other damage modifier.
    attackElixirDmgPct: { value: 0.1, min: 0.05, max: 1, step: 0.05, label: 'Attack (Battle) Elixir damage bonus (%)' },
    attackElixirMinutes: { value: 30, min: 1, max: 180, step: 1, label: 'Attack (Battle) Elixir duration (minutes)' },
  },
  progression: {
    _label: 'Progression',
    goldMin: { value: 35, min: 5, max: 200, step: 1, label: 'Loot gold (min)' },
    goldMax: { value: 65, min: 5, max: 300, step: 1, label: 'Loot gold (max)' },
    weaponBaseCost: { value: 50, min: 10, max: 500, step: 5, label: 'Weapon upgrade base cost' },
    armorBaseCost: { value: 50, min: 10, max: 500, step: 5, label: 'Armor upgrade base cost' },
    weaponDmgPerLvl: { value: 5, min: 1, max: 30, step: 1, label: 'Weapon damage per level' },
    armorHpPerLvl: { value: 20, min: 5, max: 100, step: 1, label: 'Armor HP per level' },
    playerBaseHp: { value: 80, min: 40, max: 300, step: 5, label: 'Player base HP' },
    xpBase: { value: 100, min: 10, max: 1000, step: 10, label: 'Base XP (level 1)' },
    // Hero XP-per-level recalibration for the 45-day championship (Modelo C, approved in
    // CHAMPIONSHIP_45_DAY_CURVE_OPTIONS.md / CHAMPIONSHIP_45_DAY_OPTIMAL_STRATEGIES.md): a single flat
    // exponential let Lv50 arrive in under a day and then compressed every competitive strategy into a
    // narrow Lv81-85 band by Day 45. Replaced by 5 bands, each with its own growth rate, so the curve
    // stays fast at the very start (band 1, same shape as before) and decelerates hard exactly where a
    // 45-day tournament actually plays out (bands 3-5). This changes ONLY how much career XP a level
    // costs — XP granted by Hunting/Dungeon/Pedidos/quests/Battle Pass is untouched.
    heroBand1To: { value: 15, min: 1, max: 98, step: 1, label: 'Hero curve band 1 end level' },
    heroBand2To: { value: 35, min: 2, max: 99, step: 1, label: 'Hero curve band 2 end level' },
    heroBand3To: { value: 60, min: 3, max: 99, step: 1, label: 'Hero curve band 3 end level' },
    heroBand4To: { value: 80, min: 4, max: 99, step: 1, label: 'Hero curve band 4 end level' },
    heroGrowth1: { value: 1.12, min: 1, max: 2, step: 0.01, label: 'Hero XP growth, band 1 (levels 1-15)' },
    heroGrowth2: { value: 1.14, min: 1, max: 2, step: 0.01, label: 'Hero XP growth, band 2 (levels 16-35)' },
    heroGrowth3: { value: 1.17, min: 1, max: 2, step: 0.01, label: 'Hero XP growth, band 3 (levels 36-60)' },
    // Round 15 (docs/BALANCE_CHANGES.md): bands 4 and 5 were 1.21 and 1.27, which made level 100 cost 3.3 billion XP against ~200 thousand XP a day. Both are 1.03 now, so the
    // XP a level asks climbs 3% a level from the 255 thousand of level 60 (levels 1-60 are exactly what they were; xpCurve.ts maps an older save onto the new curve).
    // Rodada 20 (the League, docs/BALANCE_CHANGES.md): band 4 grows 2.3% a level instead of 3%. Hero XP comes only from Hunting now (and the Knowledge Elixir): with this the Pass owner's median is
    // level 87 on day 60 and the fastest seed 90, nobody reaches 100; levels 1-60 are untouched. xpCurve.ts maps a save from the 3% curve onto this one, keeping its level.
    heroGrowth4: { value: 1.023, min: 1, max: 2, step: 0.01, label: 'Hero XP growth, band 4 (levels 61-80)' },
    heroGrowth5: { value: 1.03, min: 1, max: 2, step: 0.01, label: 'Hero XP growth, band 5 (levels 81-100)' },
    // Rodada 28 (docs/BALANCE_CHANGES.md): the first levels were too fast (a new hero went from level 1 to 24 in one 6 hour hunt). Levels 2 to 16 ask 3.3x the XP of the bands, then the
    // multiplier falls by a constant ratio and is gone at level 27, so from there the curve is the plain one plus a fixed, small extra (about 17 thousand XP). xpCurve.ts maps an older save.
    heroEarlyMult: { value: 3.3, min: 1, max: 10, step: 0.1, label: 'Hero XP multiplier, early levels (1 = off)' },
    heroEarlyPlateauTo: { value: 16, min: 2, max: 60, step: 1, label: 'Early multiplier holds through level' },
    heroEarlyFadeTo: { value: 27, min: 3, max: 80, step: 1, label: 'Early multiplier is gone at level' },
    levelHpBonus: { value: 5, min: 0, max: 50, step: 1, label: 'Max HP bonus per level' },
  },
  mining: {
    _label: 'Idle Mining',
    capHours: { value: 6, min: 1, max: 24, step: 1, label: 'Offline storage cap (hours)' },
    oreRatePerPower: { value: 1, min: 0.1, max: 10, step: 0.1, label: 'Ore per hour per Mining Power point' },
    // Economy design: Mining is an unattended, bot-friendly loop — it must stay an exclusive
    // raw-material faucet (ore/gems) with zero liquid currency, or it hyperinflates gold.
    goldRatePerPower: { value: 0, min: 0, max: 20, step: 0.5, label: 'Gold per hour per Mining Power point (kept at 0 — see economy note)' },
  },
  woodcutting: {
    _label: 'Idle Woodcutting',
    capHours: { value: 6, min: 1, max: 24, step: 1, label: 'Offline storage cap (hours)' },
    woodRatePerPower: { value: 1, min: 0.1, max: 10, step: 0.1, label: 'Wood per hour per Woodcutting Power point' },
    // Same economy rule as Mining — an idle, bot-friendly loop, raw material only, zero gold.
    goldRatePerPower: { value: 0, min: 0, max: 20, step: 0.5, label: 'Gold per hour per Woodcutting Power point (kept at 0 — see economy note)' },
  },
  skills: {
    _label: 'Gathering Skills (Mining/Woodcutting/Gardening)',
    // Gardening-only curve now (see professionXpCoeff/professionXpExponent below for Mining/Woodcutting,
    // recalibrated separately for the 45-day championship). Deliberately its own shape, separate from
    // character xpGrowth — this one only needs to pace a single sub-system, not a months-long arc.
    // Gardening was intentionally NOT touched by the Modelo C recalibration (separate design task).
    xpBase: { value: 5, min: 1, max: 100, step: 1, label: 'Gardening XP for level 1->2' },
    xpGrowth: { value: 1.08, min: 1, max: 1.5, step: 0.01, label: 'Gardening XP growth per level' },
    // Rodada 20 (the League ranks the professions by total XP): from this level the cost of a Gardening level grows by xpGrowthLate instead. The fastest specialist (six plots, the longest
    // plant that is ready by each visit, Fertilizer) must be level 65 to 72, not the 75 cap, on day 60 (docs/BALANCE_CHANGES.md, Rodada 20).
    gardenLateFrom: { value: 45, min: 1, max: 74, step: 1, label: 'Gardening level where the steeper XP growth starts' },
    xpGrowthLate: { value: 1.14, min: 1, max: 1.5, step: 0.01, label: 'Gardening XP growth per level above gardenLateFrom' },
    // Mining/Woodcutting XP-per-level recalibration for the 45-day championship. First pass (Modelo C,
    // a single cumulative power-law curve) pushed the Lv75 cap out past the tournament window, but also
    // made the curve uniformly steep from Lv2 onward — the resulting slowdown in gatherPower (which
    // scales with derived Level, not raw XP) throttled crafting/CP/Dungeon far more than intended. C2-B
    // (approved in CHAMPIONSHIP_45_DAY_C2_MODELING.md / CHAMPIONSHIP_45_DAY_C2B_SEPARATION_VALIDATION.md)
    // replaces it with 4 bands — fast Lv1-10, moderate Lv11-25, slow Lv26-50, very slow Lv51-75 — so
    // early/mid-game gear tiers stay reachable while the Lv75 cap remains out of reach for the whole
    // tournament. Same curve for Mining and Woodcutting (Gardening keeps its own xpBase/xpGrowth above,
    // untouched). This changes ONLY how much XP a level costs — gatherPower, XP-per-unit-gathered and
    // drop rates are untouched.
    professionXpBase: { value: 5, min: 1, max: 100, step: 1, label: 'Mining/Woodcutting XP for level 1->2 (band 1)' },
    professionBand1To: { value: 10, min: 1, max: 24, step: 1, label: 'Mining/Woodcutting curve band 1 end level' },
    professionBand2To: { value: 25, min: 2, max: 49, step: 1, label: 'Mining/Woodcutting curve band 2 end level' },
    professionBand3To: { value: 50, min: 3, max: 74, step: 1, label: 'Mining/Woodcutting curve band 3 end level' },
    professionGrowth1: { value: 1.06, min: 1, max: 1.5, step: 0.01, label: 'Mining/Woodcutting XP growth, band 1 (levels 1-10)' },
    professionGrowth2: { value: 1.1, min: 1, max: 1.5, step: 0.01, label: 'Mining/Woodcutting XP growth, band 2 (levels 11-25)' },
    // Profession pacing pass (docs/PROFESSIONS_AUDIT.md). Bands 3-4 were the problem: with 1.15 / 1.2 growth Nv50 cost 181 h of coleta and Nv59->60 alone 80 h
    // (target: under 24 h per level up to Nv60). 1.06 / 1.10 give Nv50 / Nv60 / Nv70 in ~69 / 109 / 200 h and no level-up over ~6 h up to Nv60. Levels 1-25 (bands 1-2) and the
    // XP per unit are deliberately UNCHANGED: a "fast profile" (xpPerUnit 4, growth 1.12 / 1.15) opens every profession gate within a day of its character-level gate
    // but moves the first Tier 3 pieces ~4 days earlier, and the first simulated seed reaches floor 50 on day 6 instead of day 10 (progression target T6), see the audit.
    professionGrowth3: { value: 1.06, min: 1, max: 1.5, step: 0.01, label: 'Mining/Woodcutting XP growth, band 3 (levels 26-50)' },
    professionGrowth4: { value: 1.10, min: 1, max: 1.5, step: 0.01, label: 'Mining/Woodcutting XP growth, band 4 (levels 51-60)' },
    // Rodada 20 (the League ranks Mining, Woodcutting and Gardening by TOTAL XP): levels 1-60 cost exactly what they cost (the ore tiers, obsidian included, open when they did and the gear
    // does not slow down); above 60 a level costs 50% more than the one before. The fastest specialist (Pass owner, brews, 20 h of gathering a day) is level 70 to 72 on day 60, the
    // median one a couple of levels lower, and the cap (75) takes more than 60 days even at the theoretical rate (professionRace.test.ts). XP keeps counting past the cap.
    professionBand4To: { value: 60, min: 4, max: 74, step: 1, label: 'Mining/Woodcutting curve band 4 end level' },
    professionGrowth5: { value: 1.5, min: 1, max: 2, step: 0.01, label: 'Mining/Woodcutting XP growth, band 5 (levels 61-75)' },
    maxLevel: { value: 75, min: 10, max: 200, step: 1, label: 'Max skill level (matches the old tier-4 character-level gate)' },
    xpPerUnit: { value: 1, min: 0.1, max: 20, step: 0.1, label: 'Mining/Woodcutting skill XP per unit gathered' },
    // Gardening XP per harvest = growth hours x this, the same XP per plot-hour for every plant (garden.ts plantHarvestXp): no
    // plant is worth farming for XP over another, so the choice is about which material you need. 5 keeps the fastest plant
    // (2 h herb = 10 XP) exactly where the old flat 10 XP per harvest put it; long plants are no longer under-paid.
    gardenXpPerHour: { value: 5, min: 1, max: 50, step: 1, label: 'Gardening skill XP per growth hour (any plant)' },
    // Replaces the old per-tool power table (rusty=5 -> runic=60) now that there's only one tool per
    // profession forever — 0.75/level lands right on the old tier checkpoints (level10 ~= old iron
    // tier's 12 power, level25 ~= steel's 22, level50 ~= mithril's 38ish, level75 ~= runic's 60ish).
    powerPerLevel: { value: 0.75, min: 0, max: 5, step: 0.05, label: 'Mining/Woodcutting power gained per skill level' },
  },
  // Garden 3.0 consumables (docs/GARDEN_2_0.md, "Horta 3.0"). Timed tonics share the elixir machinery (buffs.ts); none of them is sold in the Shop.
  tonics: {
    _label: 'Garden tonics (timed buffs, whetstone oil, fertilizer)',
    stoneskinMinutes: { value: 30, min: 5, max: 240, step: 5, label: 'Stoneskin Tonic duration (min)' },
    stoneskinReduction: { value: 0.1, min: 0, max: 1, step: 0.01, label: 'Stoneskin Tonic: added to the Layer-2 reduction sum' },
    fortuneMinutes: { value: 60, min: 5, max: 240, step: 5, label: 'Fortune Tonic duration (min)' },
    fortuneGoldPct: { value: 0.2, min: 0, max: 1, step: 0.01, label: 'Fortune Tonic: extra Hunting / Dungeon gold (outside the 25% gear cap, additive with it)' },
    hasteMinutes: { value: 30, min: 5, max: 240, step: 5, label: 'Haste Tonic duration (min)' },
    hasteAttackSpeed: { value: 0.09, min: 0, max: 1, step: 0.01, label: 'Haste Tonic: attack speed bonus (through heroAttackIntervalMs and its floor)' },
    gathererMinutes: { value: 120, min: 5, max: 480, step: 5, label: 'Gatherer Brew duration (min)' },
    gathererYieldPct: { value: 0.25, min: 0, max: 1, step: 0.01, label: 'Gatherer Brew: extra Mining / Woodcutting units (and so XP) while it covers the session' },
    precisionMinutes: { value: 30, min: 5, max: 240, step: 5, label: 'Precision Elixir duration (min)' },
    precisionCritPoints: { value: 0.08, min: 0, max: 0.5, step: 0.01, label: 'Precision Elixir: absolute crit chance points' },
    whetstoneDurability: { value: 30, min: 1, max: 100, step: 1, label: 'Whetstone Oil: durability points restored to the equipped weapon AND armor' },
    fertilizerSkipPct: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'Fertilizer: share of the REMAINING growth time removed (once per planting)' },
  },
  // Round 12 consumables (docs/BALANCE_CHANGES.md, Rodada 12). They reuse the timed-buff machinery of the tonics above. CAP: all the NEW consumables that can be active at once
  // raise the hero's damage by at most newConsumableCap (only the Sharpening Stone does) and the yield of any one activity by at most newConsumableCap (the Lure for Hunting,
  // the Prospector's Tonic for Mining / Woodcutting); the Polish only touches the Layer-2 reduction SUM (asymptotic, adds to Stoneskin). A test pins the cap.
  consumables: {
    _label: 'Round 12 consumables (repair kits, sharpening stone, polish, lure, prospector tonic) and the Knowledge Elixir',
    // Rodada 20 (the League): the old instant XP potion is gone. The Knowledge Elixir is a crafted buff of HUNTING XP only: +knowledgeXpPct for knowledgeMinutes of real time, one at a
    // time (drinking one while it runs does nothing and costs nothing). A stock of the old potion turns into this much Gold each when a save loads (legacyXpPotion.ts).
    knowledgeXpPct: { value: 0.25, min: 0, max: 1, step: 0.01, label: 'Knowledge Elixir: extra Hunting XP while it runs (fraction)' },
    knowledgeMinutes: { value: 240, min: 10, max: 1440, step: 10, label: 'Knowledge Elixir duration (minutes)' },
    legacyXpPotionGold: { value: 40, min: 0, max: 1000, step: 5, label: 'Gold paid for each old XP potion found in a loaded save' },
    newConsumableCap: { value: 0.1, min: 0, max: 0.5, step: 0.01, label: 'Cap on what all NEW consumables active together add to damage / to the yield of one activity' },
    repairKitDurability: { value: 60, min: 1, max: 100, step: 1, label: 'Repair Kit: durability points restored to the equipped weapon AND armor' },
    sharpenMinutes: { value: 30, min: 5, max: 240, step: 5, label: 'Sharpening Stone duration (min)' },
    sharpenDmgPct: { value: 0.04, min: 0, max: 0.5, step: 0.01, label: 'Sharpening Stone: extra damage (multiplies like the other damage buffs)' },
    polishMinutes: { value: 30, min: 5, max: 240, step: 5, label: 'Armor Polish duration (min)' },
    polishReduction: { value: 0.05, min: 0, max: 1, step: 0.01, label: 'Armor Polish: added to the Layer-2 reduction sum (with Stoneskin they simply add up)' },
    baitMinutes: { value: 60, min: 5, max: 240, step: 5, label: 'Hunter Lure duration (min); it only covers the zone it was used in' },
    baitDropPct: { value: 0.1, min: 0, max: 0.5, step: 0.01, label: 'Hunter Lure: extra drop chance of the UNCOMMON and RARE materials of that zone' },
    prospectMinutes: { value: 120, min: 5, max: 480, step: 5, label: "Prospector's Tonic duration (min)" },
    prospectYieldPct: { value: 0.1, min: 0, max: 0.5, step: 0.01, label: "Prospector's Tonic: extra Mining / Woodcutting units while it covers the session (adds to the Gatherer Brew)" },
  },
  // Profundezas (depths.ts): the endless floors after floor 100. Depth d is stage 100 + d; its enemy is the floor-99 monster scaled by a FIXED percentage per depth, so the curve is
  // a plain geometric one with no table. A boss every bossEvery depths (the four biome boss sheets in turn, tinted). A depth is banked once (the next run starts one below the deepest
  // cleared), so its rewards, including the boss unique / relic roll, are paid once per depth: the long-run unique rate cannot exceed the pace at which depths are cleared.
  depths: {
    _label: 'Depths (Profundezas, after floor 100)',
    // Round 15: depth 0 is the floor-99 monster times these (the floors 76-100 got a late factor, battle.lateHpGrowth2, that the depths would otherwise inherit whole).
    // Round 17: the floor-99 monster became 1.5x stronger, so depth 0 went from 0.51 to 0.31 / 0.32 of it (the same absolute enemy), and the growth per depth from 2.8% / 2.2% to 3.3% / 2.6%:
    // with the refinement past +8 (up to +12) the top end of the old curve was within reach of a legendary hero at paragon 30, now depth 50 asks near-max paragon and +10..+12 (docs/BALANCE_CHANGES.md).
    baseHpMult: { value: 0.31, min: 0.1, max: 3, step: 0.05, label: 'Depth 0 enemy HP as a multiple of the floor-99 monster' },
    baseDmgMult: { value: 0.32, min: 0.1, max: 3, step: 0.05, label: 'Depth 0 enemy damage as a multiple of the floor-99 monster' },
    hpGrowth: { value: 0.033, min: 0, max: 0.5, step: 0.005, label: 'Enemy HP growth per depth (compounding)' },
    dmgGrowth: { value: 0.026, min: 0, max: 0.5, step: 0.001, label: 'Enemy damage growth per depth (compounding)' },
    bossEvery: { value: 10, min: 2, max: 50, step: 1, label: 'Depth boss every N depths' },
    bossHpMult: { value: 1, min: 0.5, max: 5, step: 0.05, label: 'Depth boss: HP multiplier over a regular depth' },
    bossDmgMult: { value: 1, min: 0.5, max: 5, step: 0.05, label: 'Depth boss: damage multiplier over a regular depth' },
    bossShards: { value: 4, min: 0, max: 20, step: 1, label: 'Aether for a depth boss' },
    uniqueChanceBase: { value: 0.02, min: 0, max: 1, step: 0.005, label: 'Depth boss unique / relic chance at depth 0 (per boss cleared)' },
    uniqueChancePerDepth: { value: 0.001, min: 0, max: 0.05, step: 0.0005, label: 'Depth boss unique / relic chance gained per depth' },
    uniqueChanceCap: { value: 0.05, min: 0, max: 1, step: 0.005, label: 'Depth boss unique / relic chance cap' },
  },
  // Paragon (paragon.ts): after level 100 the XP keeps counting into paragon levels, each a tiny permanent damage bonus, capped.
  paragon: {
    _label: 'Paragon levels (after hero level 100)',
    xpShare: { value: 0.6, min: 0.001, max: 5, step: 0.005, label: 'XP of paragon level 1 as a share of the XP of hero level 99 -> 100' },
    xpGrowth: { value: 1.01, min: 1, max: 1.5, step: 0.005, label: 'XP growth per paragon level' },
    damagePerLevel: { value: 0.01, min: 0, max: 0.1, step: 0.0005, label: 'Damage bonus per paragon level (fraction)' },
    maxBonus: { value: 0.5, min: 0, max: 3, step: 0.01, label: 'Cap on the total paragon damage bonus (fraction)' },
  },
  // Profession mastery (mastery.ts): perks at fixed profession levels, all deterministic (no rolls), so a claim is reproducible and the simulator stays byte-identical.
  mastery: {
    _label: 'Profession mastery (Mining / Woodcutting / Gardening perks at 50 / 60 / 70 / 75)',
    levelA: { value: 50, min: 1, max: 75, step: 1, label: 'Mastery perk 1 level' },
    levelB: { value: 60, min: 1, max: 75, step: 1, label: 'Mastery perk 2 level' },
    levelC: { value: 70, min: 1, max: 75, step: 1, label: 'Mastery perk 3 level' },
    levelD: { value: 75, min: 1, max: 75, step: 1, label: 'Mastery perk 4 level' },
    gatherYieldPct: { value: 0.04, min: 0, max: 0.5, step: 0.01, label: 'Mining / Woodcutting: extra units at perk 1 and again at perk 3' },
    gatherDustUnits: { value: 40, min: 5, max: 500, step: 5, label: 'Mining / Woodcutting perk 2: one Refining Dust for every N units collected' },
    gatherGemUnits: { value: 250, min: 25, max: 2000, step: 25, label: 'Mining / Woodcutting perk 4: one gem for every N units collected' },
    gardenSpeedPct: { value: 0.05, min: 0, max: 0.5, step: 0.01, label: 'Gardening perks 1 and 2: each makes every plant grow this much faster' },
    gardenDustHours: { value: 4, min: 1, max: 24, step: 1, label: 'Gardening perk 3: one Refining Dust per N growth hours of every harvest' },
    gardenRareBonus: { value: 1, min: 0, max: 3, step: 1, label: 'Gardening perk 4: extra units from every harvest of a RARE plant' },
  },
  hunting: {
    _label: 'Open Zone Hunting',
    tickMs: { value: 2200, min: 800, max: 6000, step: 100, label: 'Visual attack pulse interval (ms)' },
    subLevels: { value: 10, min: 3, max: 20, step: 1, label: 'Sub-levels per depth' },
    // Gentler than the Dungeon's 100-floor curve (0.15/0.12) on purpose — only 10 sub-levels, and the
    // combat engine's high hit-count-per-fight nature makes outcomes near-deterministic per level (see
    // huntCombat.ts), so a shallow slope is what actually produces a spread-out ceiling across sessions
    // instead of every level being a hard 0%-or-100% wall clustered at one point.
    subLevelHpGrowth: { value: 0.08, min: 0, max: 0.5, step: 0.01, label: 'Enemy HP growth per sub-level' },
    // Economic normalization of material rolls (see huntEconomy.ts): kills stay fully real, but a build that
    // kills faster than the reference pace only gets sqrt-growing, capped, material rolls.
    // K_ref(subLevel) = economicReferenceKillsPerHour / (1 + subLevelHpGrowth x (subLevel - 1)).
    economicReferenceKillsPerHour: { value: 220, min: 10, max: 2000, step: 10, label: 'Reference kills/h (sub-level 1) for economic material rolls' },
    economicRollCap: { value: 1.75, min: 1, max: 5, step: 0.05, label: 'Max economic roll multiplier over the reference pace' },
    // Rodada 31: hero XP is paid per KILL (zone xpPerKill, huntingZones.ts). A hero that takes monster HP down slower than the zone's xpRefKph (kills/h of the reference monster) earns in proportion to his kills; above
    // it the extra speed pays sqrt() more, never more than xpPaceCap times the zone's reference-pace rate (huntEconomy.ts xpPaceFractionForFight). xpReferenceKillsPerHour is only the fallback for a zone config without one.
    xpReferenceKillsPerHour: { value: 150, min: 10, max: 2000, step: 10, label: 'Fallback reference kills/h for a zone without its own xpRefKph' },
    xpPaceCap: { value: 1.2, min: 1, max: 5, step: 0.05, label: 'Most hourly XP a fast build earns, as a multiple of the zone rate at the reference pace' },
    subLevelDmgGrowth: { value: 0.05, min: 0, max: 0.5, step: 0.01, label: 'Enemy damage growth per sub-level' },
    enemyAtkMs: { value: 1800, min: 800, max: 4000, step: 100, label: 'Hunting enemy attack interval (ms)' },
    // Sub-level mastery: wins banked at the CURRENT ceiling sub-level before the hunt automatically
    // attempts the next one (a single full-HP fight; winning is still required to be promoted, a loss
    // just restarts the counter). huntPromotionWinsN = wins needed at level N to try N -> N+1. Progress is
    // persisted per zone+depth and never touched by claiming. Levels past the table reuse the last entry.
    // Extra drop chance per sub-level above 1 (chance x (1 + bonus x (subLevel - 1))). Common stays flat so
    // going deeper in sub-levels improves QUALITY, not the volume of the surplus material.
    subLevelDropBonusCommon: { value: 0, min: 0, max: 0.5, step: 0.01, label: 'Common drop chance bonus per sub-level' },
    subLevelDropBonusUncommon: { value: 0.08, min: 0, max: 0.5, step: 0.01, label: 'Uncommon (Refined) drop chance bonus per sub-level' },
    subLevelDropBonusRare: { value: 0.12, min: 0, max: 0.5, step: 0.01, label: 'Rare (Noble) drop chance bonus per sub-level' },
    huntPromotionWins1: { value: 4, min: 1, max: 1000, step: 1, label: 'Wins at level 1 before trying level 2' },
    huntPromotionWins2: { value: 8, min: 1, max: 1000, step: 1, label: 'Wins at level 2 before trying level 3' },
    huntPromotionWins3: { value: 13, min: 1, max: 1000, step: 1, label: 'Wins at level 3 before trying level 4' },
    huntPromotionWins4: { value: 22, min: 1, max: 1000, step: 1, label: 'Wins at level 4 before trying level 5' },
    huntPromotionWins5: { value: 36, min: 1, max: 1000, step: 1, label: 'Wins at level 5 before trying level 6' },
    huntPromotionWins6: { value: 56, min: 1, max: 1000, step: 1, label: 'Wins at level 6 before trying level 7' },
    huntPromotionWins7: { value: 95, min: 1, max: 1000, step: 1, label: 'Wins at level 7 before trying level 8' },
    huntPromotionWins8: { value: 145, min: 1, max: 1000, step: 1, label: 'Wins at level 8 before trying level 9' },
    huntPromotionWins9: { value: 220, min: 1, max: 1000, step: 1, label: 'Wins at level 9 before trying level 10' },
  },
  dungeon: {
    _label: 'Dungeon Access',
    // Economy design: normal Dungeon runs are throttled by daily attempt count, not by reward value —
    // the Gold per kill grows with the floor, which would let a
    // player farm it endlessly if entries weren't capped. Extra sessions cost Shards (not Gold/ONE):
    // Shards are the one resource Dungeon already earns and already spends on gear refinement, so
    // this stays a closed loop inside Dungeon's own economy instead of touching the gold/ONE faucets.
    // Was 3: with a 10-33 s session that ends in defeat, three a day were over in under two minutes (docs/BALANCE_BASELINE_2026-10-10_pre.md).
    freeSessionsPerDay: { value: 10, min: 1, max: 10, step: 1, label: 'Free Dungeon sessions per day' },
    extraSessionShardCost: { value: 5, min: 1, max: 50, step: 1, label: 'Shard cost per Dungeon session beyond the free daily allowance' },
  },
  gear: {
    _label: 'Gear Instances',
    // DEFAULT TÉCNICO / TECHNICAL DEFAULT (60) so crafting can be capped at all — NOT a balance decision and not
    // the final number; it is to be tuned separately.
    // Only ever blocks CREATING a new weapon/armor instance (net of ingredients consumed); loading or migrating a
    // save never deletes or truncates equipment because of it. Materials/consumables keep the 20-slot bag.
    maxInstances: { value: 60, min: 10, max: 500, step: 1, label: 'Max weapon/armor instances (technical default, unbalanced)' },
    // Technical protection for the v1 -> v2 migration only: a forged inventory count must not create millions of
    // objects. It is NOT a gameplay limit (no real save gets near it) and is unrelated to maxInstances.
    migrationSafetyCeiling: { value: 10000, min: 100, max: 1000000, step: 100, label: 'Migration safety ceiling: max copies migrated per template' },
  },
  // Round 16: late-game sinks (deep refine +9..+12, Lapidar). Sized from the discard ledger of `npm run sim:long` (docs/BALANCE_CHANGES.md, Rodada 16): from day 60 the last zone
  // brings about 3 000 units a day, 20 to 50 times what any recipe asks for, and 90% of it was thrown away. A "farm hour" is what one hour of the last zone (Abismo de Sangue)
  // gives, measured in that ledger; every cost below is written in farm hours and turned into units by the four `hour*` numbers (Bone Fragments are left out: they are junk that dust already absorbs, and a sink that asks for 400 of them stalls whenever the bag has just been cleared), so retuning the zone retunes the sinks.
  lateSinks: {
    _label: 'Late-game sinks (round 16)',
    minLevel: { value: 60, min: 1, max: 100, step: 1, label: 'Hero level that opens Lapidar and the refinement past +8' },
    hourBlood: { value: 19.5, min: 0.1, max: 500, step: 1, label: 'Farm hour: Concentrated Blood' },
    hourMarrow: { value: 7.2, min: 0.1, max: 500, step: 1, label: 'Farm hour: Abyssal Marrow' },
    hourCrystal: { value: 3.79, min: 0.1, max: 100, step: 1, label: 'Farm hour: Corrupted Crystal' },
    hourHeart: { value: 1.44, min: 0.1, max: 100, step: 1, label: 'Farm hour: Blood Heart' },
    // Refinement past +8 (tier 5 and 6 pieces only): the attempt from +8 to +9, +9 to +10, +10 to +11 and +11 to +12. Each level is worth deepBonus of the base stat (the first eight are worth 10%).
    // Refining a tier 5 or 6 piece from +3 to +8 asks this share of the Gold the same step costs on a lower tier piece: from day 60 the player is Gold-bound (1.5 thousand a day against 25 thousand
    // a piece), not material-bound, and the chase past +8 has to be paid with the surplus, not with the Gold that builds the next tier.
    lateRefineMinTier: { value: 5, min: 1, max: 7, step: 1, label: 'Lowest gear tier whose +4..+8 refine steps get the late-game Gold share and Aether below' },
    lateRefineShards: { value: 0, min: 0, max: 5, step: 1, label: 'Aether of the +7 and +8 refine steps for those pieces (a lower tier piece pays 2)' },
    lateRefineGoldShare: { value: 0.15, min: 0.05, max: 1, step: 0.05, label: 'Gold share of the +4..+8 refine steps of tier 5 and 6 pieces' },
    deepMinTier: { value: 5, min: 1, max: 6, step: 1, label: 'Lowest gear tier that can be refined past +8' },
    deepBonus: { value: 0.06, min: 0, max: 0.1, step: 0.01, label: 'Base stat per refine level past +8 (fraction)' },
    deepChance9: { value: 0.4, min: 0.01, max: 1, step: 0.01, label: 'Refine +8 -> +9: chance' },
    deepChance10: { value: 0.3, min: 0.01, max: 1, step: 0.01, label: 'Refine +9 -> +10: chance' },
    deepChance11: { value: 0.22, min: 0.01, max: 1, step: 0.01, label: 'Refine +10 -> +11: chance' },
    deepChance12: { value: 0.15, min: 0.01, max: 1, step: 0.01, label: 'Refine +11 -> +12: chance' },
    deepDrop10: { value: 0.2, min: 0, max: 1, step: 0.05, label: 'Failed +9 -> +10 attempt: chance of dropping back to +8' },
    deepDrop11: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'Failed +10 -> +11 attempt: chance of dropping one level' },
    deepDrop12: { value: 0.4, min: 0, max: 1, step: 0.05, label: 'Failed +11 -> +12 attempt: chance of dropping one level' },
    deepHours9: { value: 1.5, min: 0, max: 100, step: 0.5, label: 'Refine +9: farm hours per attempt (tier 6; tier 5 pays deepTier5Share of it)' },
    deepHours10: { value: 3, min: 0, max: 100, step: 0.5, label: 'Refine +10: farm hours per attempt' },
    deepHours11: { value: 4.5, min: 0, max: 100, step: 0.5, label: 'Refine +11: farm hours per attempt' },
    deepHours12: { value: 7.5, min: 0, max: 100, step: 0.5, label: 'Refine +12: farm hours per attempt' },
    deepTier5Share: { value: 0.6, min: 0.1, max: 1, step: 0.05, label: 'Tier 5 pieces pay this share of the tier 6 hours' },
    deepGold9: { value: 150, min: 0, max: 20000, step: 50, label: 'Refine +9: Gold per attempt' },
    deepGold10: { value: 200, min: 0, max: 20000, step: 50, label: 'Refine +10: Gold per attempt' },
    deepGold11: { value: 250, min: 0, max: 20000, step: 50, label: 'Refine +11: Gold per attempt' },
    deepGold12: { value: 300, min: 0, max: 20000, step: 50, label: 'Refine +12: Gold per attempt' },
    deepShards: { value: 0, min: 0, max: 10, step: 1, label: 'Refine +11 and +12: Aether per attempt' },
    // Lapidar: lock one substat of an Epic or Legendary piece (tier 4 and up) and reroll the others. Every earlier lapidation on the same piece makes the next one lapidarGrowth dearer.
    lapidarMinTier: { value: 4, min: 1, max: 6, step: 1, label: 'Lowest gear tier that can be lapidated' },
    lapidarHours4: { value: 1, min: 0, max: 100, step: 0.5, label: 'Lapidar: farm hours, tier 4 piece, first lapidation' },
    lapidarHours5: { value: 2, min: 0, max: 100, step: 0.5, label: 'Lapidar: farm hours, tier 5 piece, first lapidation' },
    lapidarHours6: { value: 3, min: 0, max: 100, step: 0.5, label: 'Lapidar: farm hours, tier 6 piece, first lapidation' },
    lapidarGrowth: { value: 0.25, min: 0, max: 2, step: 0.05, label: 'Lapidar: extra cost per earlier lapidation on the same piece (fraction of the first)' },
    lapidarMaxGrowth: { value: 12, min: 1, max: 100, step: 1, label: 'Lapidar: lapidations after which the cost stops rising' },
    lapidarGoldPerTier: { value: 50, min: 0, max: 5000, step: 10, label: 'Lapidar: Gold per piece tier' },
    lapidarShards: { value: 1, min: 0, max: 10, step: 1, label: 'Lapidar: Aether per lapidation' },
  },
  economySinks: {
    _label: 'Material sinks',
    // Economic reforge (reforge.ts), per gear INSTANCE. Tiers below reforgeAdvancedTier pay the basic bundle
    // (dust + refined), the rest pay the advanced one (dust + refined + noble). Gold is escalated by that instance's
    // reforgeCount (gear.reforgeGoldCost) and every attempt also costs 1 shard.
    reforgeAdvancedTier: { value: 3, min: 1, max: 6, step: 1, label: 'First gear tier with advanced reforge costs' },
    reforgeBasicDust: { value: 2, min: 0, max: 100, step: 1, label: 'Basic reforge: dust' },
    reforgeBasicRefined: { value: 6, min: 0, max: 200, step: 1, label: 'Basic reforge: claw/blood' },
    reforgeAdvancedDust: { value: 6, min: 0, max: 100, step: 1, label: 'Advanced reforge: dust' },
    reforgeAdvancedRefined: { value: 24, min: 0, max: 200, step: 1, label: 'Advanced reforge: claw/blood' },
    reforgeAdvancedNoble: { value: 2, min: 0, max: 100, step: 1, label: 'Advanced reforge: core/crystal' },
    // Salvage returns floor(recipeQuantity x rate) of each recipe material, with NO minimum of 1.
    salvageRecoveryRate: { value: 0.45, min: 0, max: 0.9, step: 0.05, label: 'Salvage material recovery (rounded down; no minimum)' },
  },
  // Delivery orders (deliveries.ts): materials + time -> Gold (+ shards on Long/Special). Replaces the Expedition. Since the League (Rodada 20) an order pays NO hero XP: the hero earns XP only from Hunting.
  // Everything a delivery pays is a function of TIER x DISTANCE x time, never of how valuable the delivered materials are.
  deliveries: {
    _label: 'Delivery orders',
    offersBase: { value: 3, min: 1, max: 6, step: 1, label: 'Visible offers (base)' },
    offersPass: { value: 4, min: 1, max: 8, step: 1, label: 'Visible offers with Battle Pass' },
    rerollsBase: { value: 1, min: 0, max: 5, step: 1, label: 'Free rerolls per day (base)' },
    rerollsPass: { value: 2, min: 0, max: 8, step: 1, label: 'Free rerolls per day with Battle Pass' },
    // Round 14: Gold of an order scales with the hero's level, so a level-100 hero is not offered a 30 minute order for +20 Gold. The factor is 1 up to
    // levelScaleFrom (the first sessions are untouched) and grows linearly between the anchors below to what an hour of Hunting pays at that level when the
    // whole haul is sold to the merchant (the order stays about as good as hunting for the same time: scripts/sim/orderScale.sim.ts measures it, and the
    // test in round14.test.ts keeps it inside 0.8 to 1.2). The cargo an order asks for is NOT scaled: it stays a bonus on top of what the player already has.
    levelScaleFrom: { value: 40, min: 1, max: 100, step: 1, label: 'Character level where order rewards start to scale' },
    levelScale50: { value: 3.2, min: 1, max: 20, step: 0.1, label: 'Order reward factor at character level 50' },
    levelScale75: { value: 5.5, min: 1, max: 20, step: 0.1, label: 'Order reward factor at character level 75' },
    levelScale100: { value: 7.7, min: 1, max: 30, step: 0.1, label: 'Order reward factor at character level 100' },
    // Rodada 20: in place of the XP an order used to pay (about half of what Hunting pays per hour in the first weeks), every order pays this much more Gold. The cargo is still sized
    // from the Gold WITHOUT it (an order does not ask for more), so it is a pure bonus and the order stays inside the 0.8 to 1.2 band of round14.test.ts (about 0.9 to 1.19 now; 0.15 pushed level 50 to 1.25).
    goldBonus: { value: 0.1, min: 0, max: 1, step: 0.01, label: 'Extra Gold on every order, in place of the XP orders no longer pay (fraction)' },
    offerTtlHours: { value: 24, min: 1, max: 168, step: 1, label: 'Hours before an unaccepted offer is replaced' },
    durationJitter: { value: 0.1, min: 0, max: 0.4, step: 0.05, label: 'Duration variation around the distance reference (+/-)' },
    tier2Floor: { value: 26, min: 1, max: 100, step: 1, label: 'Highest Dungeon floor for order tier 2' },
    tier3Floor: { value: 51, min: 1, max: 100, step: 1, label: 'Highest Dungeon floor for order tier 3' },
    tier4Floor: { value: 76, min: 1, max: 100, step: 1, label: 'Highest Dungeon floor for order tier 4' },
    processedMinLevel: { value: 25, min: 1, max: 100, step: 1, label: 'Character level to receive orders that ask for processed materials' },
    // Cargo sizing: an order asks for materials whose economic reference value (economy.ts baseGoldValue) is about
    // reward Gold / rewardRatio(distance). Longer trips tie the slot up longer, so they pay slightly more per unit of cargo.
    // The Gold itself never depends on the cargo (it is tier x time).
    ratioLocal: { value: 1.05, min: 0.5, max: 3, step: 0.01, label: 'Reward Gold / cargo reference value, Local' },
    ratioCurta: { value: 1.1, min: 0.5, max: 3, step: 0.01, label: 'Reward Gold / cargo reference value, Short' },
    ratioRegional: { value: 1.15, min: 0.5, max: 3, step: 0.01, label: 'Reward Gold / cargo reference value, Regional' },
    ratioLonga: { value: 1.2, min: 0.5, max: 3, step: 0.01, label: 'Reward Gold / cargo reference value, Long' },
    ratioEspecial: { value: 1.25, min: 0.5, max: 3, step: 0.01, label: 'Reward Gold / cargo reference value, Special' },
    // Round 17: orders of the last tier (floor 76+) count one Bone / Blood / Crystal as this many times its reference value when the cargo is sized. The Abyss drops 2.9 / 3.3 / 4 times fewer (huntingZones.ts);
    // the factor is about twice that because an order is only taken from what the next craft does not need: with the exact factor the orders dried up (A: -15% Gold, 3 to 4 of 12 seeds without the tier 6 set), with 6 / 7 / 8 the Gold is back (+13% over days 100-180, 12 seeds)
    abyssCargoBone: { value: 6, min: 1, max: 10, step: 0.1, label: 'Last order tier: reference value of a Bone Fragment in the cargo, times' },
    abyssCargoBlood: { value: 7, min: 1, max: 10, step: 0.1, label: 'Last order tier: reference value of a Concentrated Blood in the cargo, times' },
    abyssCargoCrystal: { value: 8, min: 1, max: 10, step: 0.1, label: 'Last order tier: reference value of a Corrupted Crystal in the cargo, times' },
    ratioTolerance: { value: 0.15, min: 0.02, max: 0.5, step: 0.01, label: 'Allowed deviation of the cargo value from its target (+/-, whole units)' },
    // Gold per hour = base + perTier * (tier - 1) + distance bonus.
    goldPerHourBase: { value: 30, min: 5, max: 200, step: 1, label: 'Gold per hour (tier 1, Local)' },
    goldPerHourTier: { value: 1.5, min: 0, max: 20, step: 0.5, label: 'Extra Gold per hour per tier' },
    hoursLocal: { value: 0.5, min: 0.1, max: 48, step: 0.1, label: 'Local delivery time (h)' },
    hoursCurta: { value: 1.5, min: 0.1, max: 48, step: 0.1, label: 'Short delivery time (h)' },
    hoursRegional: { value: 4.5, min: 0.1, max: 48, step: 0.1, label: 'Regional delivery time (h)' },
    hoursLonga: { value: 10, min: 0.1, max: 48, step: 0.1, label: 'Long delivery time (h)' },
    hoursEspecial: { value: 21, min: 0.1, max: 48, step: 0.1, label: 'Special delivery time (h)' },
    goldBonusLocal: { value: 0, min: 0, max: 30, step: 0.5, label: 'Extra Gold per hour, Local' },
    goldBonusCurta: { value: 1, min: 0, max: 30, step: 0.5, label: 'Extra Gold per hour, Short' },
    goldBonusRegional: { value: 2, min: 0, max: 30, step: 0.5, label: 'Extra Gold per hour, Regional' },
    goldBonusLonga: { value: 3.5, min: 0, max: 30, step: 0.5, label: 'Extra Gold per hour, Long' },
    goldBonusEspecial: { value: 5, min: 0, max: 30, step: 0.5, label: 'Extra Gold per hour, Special' },
    // Shards: fixed when the offer is generated, only on Long / Special, by tier.
    shardsLongaT1: { value: 0, min: 0, max: 10, step: 1, label: 'Shards, Long, tier 1' },
    shardsLongaT2: { value: 1, min: 0, max: 10, step: 1, label: 'Shards, Long, tier 2' },
    shardsLongaT3: { value: 1, min: 0, max: 10, step: 1, label: 'Shards, Long, tier 3' },
    shardsLongaT4: { value: 2, min: 0, max: 10, step: 1, label: 'Shards, Long, tier 4' },
    shardsEspecialT1: { value: 1, min: 0, max: 10, step: 1, label: 'Shards, Special, tier 1' },
    shardsEspecialT2: { value: 2, min: 0, max: 10, step: 1, label: 'Shards, Special, tier 2' },
    shardsEspecialT3: { value: 3, min: 0, max: 10, step: 1, label: 'Shards, Special, tier 3' },
    shardsEspecialT4: { value: 3, min: 0, max: 10, step: 1, label: 'Shards, Special, tier 4' },
    // Per-order quantity ceilings (Long delivery; shorter ones use the short factor, Special uses the bulk factor for common/refined only).
    capScrap: { value: 60, min: 1, max: 500, step: 1, label: 'Max Farrapos per order' },
    capBone: { value: 50, min: 1, max: 500, step: 1, label: 'Max Ossos per order' },
    capClaw: { value: 30, min: 1, max: 500, step: 1, label: 'Max Garras per order' },
    capBlood: { value: 24, min: 1, max: 500, step: 1, label: 'Max Sangue per order' },
    capNoble: { value: 3, min: 1, max: 50, step: 1, label: 'Max Nucleos / Cristais (each) per order' },
    capCommonHerb: { value: 5, min: 1, max: 100, step: 1, label: 'Max Erva Medicinal per order' },
    capEnergyHerb: { value: 3, min: 1, max: 100, step: 1, label: 'Max Erva Energetica per order' },
    capRoot: { value: 2, min: 1, max: 50, step: 1, label: 'Max Raiz per order' },
    capMushroom: { value: 2, min: 1, max: 50, step: 1, label: 'Max Cogumelo per order' },
    capFlower: { value: 2, min: 1, max: 50, step: 1, label: 'Max Flor Carmesim per order' },
    capRawMaterial: { value: 60, min: 1, max: 1000, step: 1, label: 'Max ore / wood per order' },
    capProcessed: { value: 6, min: 1, max: 100, step: 1, label: 'Max processed units per order' },
    shortCapFactor: { value: 0.6, min: 0.1, max: 1, step: 0.05, label: 'Quantity ceiling factor for deliveries shorter than Long' },
    bulkSpecialFactor: { value: 1.5, min: 1, max: 3, step: 0.1, label: 'Quantity ceiling factor for common/refined on Special' },
    agroSpecialFactor: { value: 1.5, min: 1, max: 3, step: 0.1, label: 'Quantity ceiling factor for Garden plants on Special' },
    // A processed unit costs Gold to make; an order that asks for it may never let that fee eat more than this share of its Gold.
    processedFeeMaxShare: { value: 0.65, min: 0.1, max: 1, step: 0.05, label: 'Max share of the order Gold that processing fees may represent' },
  },
  battlePass: {
    _label: 'Adventurer Pass',
    xpBase: { value: 100, min: 20, max: 500, step: 10, label: 'Pass XP required for level 2' },
    xpGrowth: { value: 1.08, min: 1, max: 1.5, step: 0.01, label: 'Pass XP growth per level' },
    // The Pass is a one-time unlock (entitlements.ts); only the 30-level TRACK runs in seasons. Season 1 starts at seasons.ts SEASON_EPOCH_MS.
    seasonDays: { value: 60, min: 7, max: 180, step: 1, label: 'Season length (days)' },
    // Convenience, not power (players trade gear on the Steam market): a moderately longer offline window (capHours) and a small yield bump. Uniques and relics never use the multiplier.
    // Round 12: 6 -> 8 h (every zone and skill then keeps the full 8 h an owner can be away), gold 10 -> 15% and delivery XP 10 -> 20%: the owner had fallen to 2.5 days ahead at floor 50 (docs/BALANCE_CHANGES.md, Rodada 12).
    capHours: { value: 10, min: 4, max: 24, step: 1, label: 'Offline storage cap with the Pass (hours): Hunting, Mining and Woodcutting (base stays at the zone / skill cap, 6 h for everyone)' },
    dropRateMultiplier: { value: 1.1, min: 1, max: 3, step: 0.05, label: 'Material yield multiplier with pass (Hunting, Mining, Woodcutting)' },
    xpPerFloor: { value: 15, min: 1, max: 100, step: 1, label: 'Pass XP per dungeon floor cleared' },
    xpPerHuntHour: { value: 10, min: 1, max: 100, step: 1, label: 'Pass XP per hour of Hunting claimed' },
    xpPerMiningHour: { value: 10, min: 1, max: 100, step: 1, label: 'Pass XP per hour of Mining AND Woodcutting claimed (one rule for both, gathering.ts)' },
    stashBonusSlots: { value: 10, min: 0, max: 40, step: 5, label: 'Extra camp stash slots for the Pass owner' },
    // The bag perk is a share of the owner's capacity (rounded up) with this many slots as the floor (inventory.ts passBagBonus): 26 -> +6, 60 -> +12, 100 -> +20.
    bagBonusPct: { value: 0.2, min: 0, max: 0.5, step: 0.05, label: 'Extra inventory capacity for the Pass owner (fraction)' },
    bagBonusSlots: { value: 5, min: 0, max: 20, step: 1, label: 'Minimum extra inventory slots for the Pass owner' },
    // Extra Gold (fraction) from the Dungeon, Hunting and delivery orders. ADDS to the gear bonus (and its cap) and the Fortune Tonic, like the tonic; the merchant is not included.
    goldBonus: { value: 0.15, min: 0, max: 0.5, step: 0.05, label: 'Extra Gold for the Pass owner: Dungeon, Hunting, deliveries (fraction)' },
    repairDiscount: { value: 0.2, min: 0, max: 0.5, step: 0.05, label: 'Forge repair gold discount while active' },
    // Round 12: a Repair Kit (consumables.repairKitDurability) delivered once per local day to the owner, when the game loads on a new day or is open across midnight (entitlements.ts grantDailyPassKit).
    dailyRepairKits: { value: 1, min: 0, max: 5, step: 1, label: 'Repair Kits the Pass owner receives each new day' },
    dailyRepairKitStock: { value: 5, min: 1, max: 20, step: 1, label: 'The daily kit stops while the owner already holds this many unused Repair Kits' },
    // Round 13: the streak saver keeps a login streak alive through ONE missed day, once per UTC week (weekly.ts streakStatus).
    streakSavers: { value: 1, min: 0, max: 3, step: 1, label: 'Streak savers the Pass owner gets each week (a missed login day does not reset the streak)' },
  },
  // Round 13 (weekly.ts): four weekly goals (drawn from five activities) and a 7-day login streak. Claimed by the player; the progression simulator never claims them.
  weekly: {
    _label: 'Weekly goals',
    // Round 14: four bands by character level (1-24, 25-49, 50-99, 100 and paragon). The band is fixed when the week begins. Band 1 is the original Round 13 numbers.
    // The un-numbered keys are band 1, the 2 / 3 / 4 keys the other bands; goldMult2-4 multiply the Gold of a goal, of the bonus and of the login streak. Aether never scales.
    huntHours: { value: 6, min: 1, max: 40, step: 1, label: 'Goal, band 1: hours spent hunting (counted when a hunt ends)' },
    deliveries: { value: 3, min: 1, max: 20, step: 1, label: 'Goal, band 1: delivery orders completed' },
    gathered: { value: 150, min: 10, max: 2000, step: 10, label: 'Goal, band 1: units gathered (ore + wood + plants)' },
    forged: { value: 4, min: 1, max: 50, step: 1, label: 'Goal, band 1: pieces forged' },
    floors: { value: 25, min: 5, max: 200, step: 5, label: 'Goal, band 1: dungeon floors cleared (Profundezas included)' },
    huntHours2: { value: 8, min: 1, max: 40, step: 1, label: 'Goal, band 2 (level 25-49): hours spent hunting' },
    deliveries2: { value: 4, min: 1, max: 20, step: 1, label: 'Goal, band 2: delivery orders completed' },
    gathered2: { value: 250, min: 10, max: 2000, step: 10, label: 'Goal, band 2: units gathered' },
    forged2: { value: 5, min: 1, max: 50, step: 1, label: 'Goal, band 2: pieces forged' },
    floors2: { value: 35, min: 5, max: 200, step: 5, label: 'Goal, band 2: dungeon floors cleared' },
    huntHours3: { value: 10, min: 1, max: 40, step: 1, label: 'Goal, band 3 (level 50-99): hours spent hunting' },
    deliveries3: { value: 5, min: 1, max: 20, step: 1, label: 'Goal, band 3: delivery orders completed' },
    gathered3: { value: 400, min: 10, max: 2000, step: 10, label: 'Goal, band 3: units gathered' },
    forged3: { value: 6, min: 1, max: 50, step: 1, label: 'Goal, band 3: pieces forged' },
    floors3: { value: 50, min: 5, max: 200, step: 5, label: 'Goal, band 3: dungeon floors cleared' },
    huntHours4: { value: 12, min: 1, max: 40, step: 1, label: 'Goal, band 4 (level 100 and paragon): hours spent hunting' },
    deliveries4: { value: 6, min: 1, max: 20, step: 1, label: 'Goal, band 4: delivery orders completed' },
    gathered4: { value: 600, min: 10, max: 2000, step: 10, label: 'Goal, band 4: units gathered' },
    forged4: { value: 7, min: 1, max: 50, step: 1, label: 'Goal, band 4: pieces forged' },
    floors4: { value: 60, min: 5, max: 200, step: 5, label: 'Goal, band 4: dungeon floors cleared (Profundezas depths count)' },
    goldPerGoal: { value: 150, min: 0, max: 2000, step: 10, label: 'Gold for each goal (band 1)' },
    bonusGold: { value: 400, min: 0, max: 5000, step: 50, label: 'Gold for finishing all four (band 1)' },
    bonusShards: { value: 3, min: 0, max: 20, step: 1, label: 'Aether for finishing all four (every band)' },
    goldMult2: { value: 2, min: 1, max: 50, step: 0.5, label: 'Gold multiplier, band 2 (goals, bonus, login streak)' },
    goldMult3: { value: 6, min: 1, max: 50, step: 0.5, label: 'Gold multiplier, band 3' },
    goldMult4: { value: 10, min: 1, max: 50, step: 0.5, label: 'Gold multiplier, band 4' },
  },
  streak: {
    _label: 'Login streak',
    gold1: { value: 80, min: 0, max: 2000, step: 10, label: 'Day 1: Gold' },
    gold2: { value: 120, min: 0, max: 2000, step: 10, label: 'Day 2: Gold (day 3 is a Hunter Lure)' },
    gold4: { value: 160, min: 0, max: 2000, step: 10, label: 'Day 4: Gold (day 5 is a Repair Kit)' },
    gold6: { value: 240, min: 0, max: 2000, step: 10, label: 'Day 6: Gold' },
    gold7: { value: 300, min: 0, max: 5000, step: 10, label: 'Day 7: Gold (with an Armor Polish)' },
    shards7: { value: 3, min: 0, max: 20, step: 1, label: 'Day 7: Aether' },
  },
  // Hero skills (heroSkills.ts): three paths of passive skills, 1 point every pointEveryLevels character levels. Every number below is PER RANK; the screen
  // and the descriptions are generated from them. Tuned by scripts/sim (docs/BALANCE_CHANGES.md Rodada 7).
  heroSkills: {
    _label: 'Hero skills',
    pointEveryLevels: { value: 5, min: 1, max: 20, step: 1, label: 'Character levels per skill point' },
    tier2Req: { value: 2, min: 0, max: 20, step: 1, label: 'Points in the path needed for tier 2' },
    tier3Req: { value: 5, min: 0, max: 20, step: 1, label: 'Points in the path needed for tier 3' },
    capstoneReq: { value: 10, min: 0, max: 20, step: 1, label: 'Points in the path needed for the capstone' },
    // Guerreiro
    // Golpes (auto-triggered strikes): Golpe Esmagador every crushEvery hits (+crushBonusBase + rank x crushBonusStep damage on that hit), Golpe de Furia every furyEveryMs of
    // combat (furyHits extra hits at furyDmgBase + rank x furyDmgStep of the hit), Golpe Duplo (doubleBase + rank x doubleStep chance, the echo hits for doubleDmgPct), Contra-ataque
    // (the next hit after a block, counterBase + rank x counterStep damage) and Golpe Devastador (every devastatingEvery-th crush deals devastatingMult x instead of its bonus).
    crushEvery: { value: 5, min: 2, max: 20, step: 1, label: 'Golpe Esmagador: every Nth hit of the hero' },
    crushBonusBase: { value: 0.14, min: 0, max: 1, step: 0.005, label: 'Golpe Esmagador: bonus damage, base (rank 0)' },
    crushBonusStep: { value: 0.14, min: 0, max: 1, step: 0.005, label: 'Golpe Esmagador: bonus damage per rank' },
    furyEveryMs: { value: 8000, min: 2000, max: 30000, step: 500, label: 'Golpe de Furia: interval (ms of combat)' },
    furyHits: { value: 3, min: 1, max: 8, step: 1, label: 'Golpe de Furia: extra hits per flurry' },
    furyDmgBase: { value: 0.25, min: 0, max: 1, step: 0.005, label: 'Golpe de Furia: damage of each hit, base (rank 0)' },
    furyDmgStep: { value: 0.1, min: 0, max: 1, step: 0.005, label: 'Golpe de Furia: damage of each hit per rank' },
    doubleBase: { value: 0.04, min: 0, max: 0.5, step: 0.005, label: 'Golpe Duplo: chance, base (rank 0)' },
    doubleStep: { value: 0.04, min: 0, max: 0.5, step: 0.005, label: 'Golpe Duplo: chance per rank' },
    doubleDmgPct: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'Golpe Duplo: damage of the second strike (share of the hit)' },
    counterBase: { value: 0.2, min: 0, max: 1, step: 0.05, label: 'Contra-ataque: bonus damage, base (rank 0)' },
    counterStep: { value: 0.2, min: 0, max: 1, step: 0.05, label: 'Contra-ataque: bonus damage per rank' },
    devastatingEvery: { value: 3, min: 2, max: 10, step: 1, label: 'Golpe Devastador: every Nth Golpe Esmagador' },
    devastatingMult: { value: 3, min: 1, max: 6, step: 0.1, label: 'Golpe Devastador: damage multiplier of that strike' },
    keenEyeCrit: { value: 0.026, min: 0, max: 0.2, step: 0.005, label: 'Olho Clinico: crit chance per rank (absolute)' },
    executionCritMult: { value: 0.125, min: 0, max: 0.5, step: 0.01, label: 'Execucao: crit multiplier per rank (absolute)' },
    bleedBase: { value: 0.015, min: 0, max: 0.3, step: 0.005, label: 'Sangria: share of the hit dealt per second, base (rank 0)' },
    bleedStep: { value: 0.045, min: 0, max: 0.3, step: 0.005, label: 'Sangria: share of the hit dealt per second, per rank' },
    bleedDurationMs: { value: 3000, min: 1000, max: 10000, step: 500, label: 'Sangria: duration after the last hit (ms)' },
    weaponMasterPct: { value: 0.035, min: 0, max: 0.3, step: 0.005, label: 'Mestre de Armas: weapon base damage per rank' },
    // Guardiao
    thickSkinHp: { value: 0.025, min: 0, max: 0.3, step: 0.005, label: 'Pele Dura: max HP per rank' },
    bulwarkRes: { value: 0.07, min: 0, max: 0.3, step: 0.005, label: 'Muralha: resistance sum per rank (multiplier)' },
    thornsReflect: { value: 0.08, min: 0, max: 0.2, step: 0.005, label: 'Espinhos: reflect per rank (absolute)' },
    secondWindRegen: { value: 0.002, min: 0, max: 0.05, step: 0.0005, label: 'Segundo Folego: max HP regenerated per second, per rank' },
    firmStanceReduction: { value: 0.08, min: 0, max: 0.3, step: 0.005, label: 'Postura Firme: damage taken from boss and checkpoint floors (Dungeon) and from promotion / Target fights (Hunting), per rank' },
    blockBase: { value: 0.01, min: 0, max: 0.3, step: 0.005, label: 'Bloqueio: chance to block a hit, base (rank 0)' },
    blockStep: { value: 0.02, min: 0, max: 0.3, step: 0.005, label: 'Bloqueio: chance to block a hit per rank' },
    bastionHealPct: { value: 0.25, min: 0, max: 1, step: 0.05, label: 'Ultimo Bastiao: max HP healed after the save' },
    bastionCooldownMs: { value: 60000, min: 5000, max: 600000, step: 5000, label: 'Ultimo Bastiao: Hunting cooldown (ms of combat time)' },
    // Cacador
    greedGold: { value: 0.04, min: 0, max: 0.3, step: 0.005, label: 'Ganancia: extra Gold per rank (outside the gear cap)' },
    scentMaterials: { value: 0.0334, min: 0, max: 0.3, step: 0.0001, label: 'Faro: Hunting material yield per rank (3 ranks = +10%, the same as the Pass)' },
    quickLearnerXp: { value: 0.04, min: 0, max: 0.3, step: 0.005, label: 'Aprendiz Veloz: character XP per rank' },
    packerSlots: { value: 2, min: 0, max: 10, step: 1, label: 'Mochileiro: inventory slots per rank' },
    gathererYield: { value: 0.06, min: 0, max: 0.3, step: 0.005, label: 'Coletor: Mining and Woodcutting yield per rank' },
    luckHuntUnique: { value: 1.5, min: 1, max: 3, step: 0.05, label: 'Sorte Grande: Hunting unique drop chance multiplier' },
    luckBossDrop: { value: 1.25, min: 1, max: 3, step: 0.05, label: 'Sorte Grande: Dungeon boss unique / relic chance multiplier' },
    // Respec: free once, then respecGoldPerPoint x points spent x character level / respecLevelDivisor (rounded).
    respecGoldPerPoint: { value: 50, min: 0, max: 1000, step: 5, label: 'Respec: Gold per skill point spent (at the level divisor)' },
    respecLevelDivisor: { value: 10, min: 1, max: 100, step: 1, label: 'Respec: character level divisor' },
  },
  merchant: {
    _label: 'Merchant (selling surplus)',
    priceRate: { value: 0.15, min: 0.02, max: 0.5, step: 0.01, label: 'Material sell price as a share of the economic reference value (economy.ts baseGoldValue), rounded down, min 1' },
    baseBudget: { value: 30, min: 0, max: 2000, step: 5, label: 'Gold the merchant pays per local day, base' },
    budgetPerLevel: { value: 2, min: 0, max: 20, step: 0.1, label: 'Extra daily merchant Gold per character level' },
  },
  // Round 18 (wholesale.ts): the Mercador Atacadista. No daily Gold budget; a low price (a share of the normal merchant's unit price) that falls with each unit of the SAME material sold
  // the same local day: the first freeUnits units pay the full wholesale price, then every further block of blockUnits units pays blockDrop less (a share of the wholesale price), down
  // to floorRate of the NORMAL merchant price. Selling is always manual. docs/BALANCE_CHANGES.md Rodada 18 has the income math.
  wholesale: {
    _label: 'Wholesale merchant (surplus, manual only)',
    unlockFloor: { value: 75, min: 1, max: 100, step: 1, label: 'Dungeon boss floor that opens the wholesale merchant (25, 50, 75 or 100)' },
    priceRate: { value: 0.25, min: 0.02, max: 1, step: 0.01, label: 'Wholesale unit price as a share of the normal merchant unit price' },
    freeUnits: { value: 100, min: 0, max: 5000, step: 10, label: 'Units of one material per local day paid at the full wholesale price' },
    blockUnits: { value: 50, min: 1, max: 2000, step: 5, label: 'Units per block after the free units (each block pays blockDrop less)' },
    blockDrop: { value: 0.2, min: 0, max: 1, step: 0.01, label: 'Price drop per block (share of the wholesale price)' },
    floorRate: { value: 0.08, min: 0, max: 1, step: 0.01, label: 'Lowest unit price as a share of the NORMAL merchant price' },
  },
  // Round 18 (goldPouch.ts): the Gold Pouch turns Gold into a tradeable bag item. Anyone creates them (the Pass owner pays the lower fee); anyone can open one for exactly its face value.
  goldPouch: {
    _label: 'Gold Pouch (tradeable Gold)',
    denomSmall: { value: 2000, min: 100, max: 10000000, step: 100, label: 'Face value of the small pouch (also the minimum amount of a pouch)' },
    denomMedium: { value: 5000, min: 100, max: 10000000, step: 100, label: 'Face value of the medium pouch' },
    denomLarge: { value: 20000, min: 100, max: 10000000, step: 100, label: 'Face value of the large pouch' },
    feePct: { value: 0.05, min: 0, max: 0.5, step: 0.01, label: 'Fee paid in Gold on top when an Adventurer Pass owner creates a pouch (a Gold sink)' },
    feePctFree: { value: 0.1, min: 0, max: 0.5, step: 0.01, label: 'Fee paid in Gold on top when a player without the Pass creates a pouch (a Gold sink)' },
    perDay: { value: 3, min: 1, max: 20, step: 1, label: 'Pouches one hero can create per local day' },
  },
  ui: {
    _label: 'UI Layout',
    spriteSize: { value: 132, min: 80, max: 240, step: 2, cssVar: '--sprite-size', unit: 'px', label: 'Combatant sprite size' },
    barW: { value: 120, min: 60, max: 220, step: 2, cssVar: '--bar-w', unit: 'px', label: 'HP/stamina bar width' },
    barH: { value: 14, min: 6, max: 30, step: 1, cssVar: '--bar-h', unit: 'px', label: 'HP/stamina bar height' },
    actionH: { value: 68, min: 44, max: 110, step: 2, cssVar: '--action-h', unit: 'px', label: 'Action button height' },
    actionGap: { value: 12, min: 0, max: 40, step: 1, cssVar: '--action-gap', unit: 'px', label: 'Action button gap' },
    fontSize: { value: 12, min: 8, max: 20, step: 1, cssVar: '--font-size', unit: 'px', label: 'UI font size' },
  },
  // Class affinity (affinity.ts; classes reform, phase 6, docs/CLASSES_E_EQUIPAMENTOS.md 2.3): 3 / 5 pieces of the same armor WEIGHT over the five weight slots (armor, helmet, gloves, boots, shield), any tier, and a
  // matching weapon on top of the five. Each step REPLACES the one below it (the five-piece line is the whole bonus at 5, not 3 + 5), except the weapon step, which ADDS to the five-piece bonus. Units are SetEffect's.
  // EVERY NUMBER IS SMALL ON PURPOSE, and this is a design decision, not an economy one: do NOT "fix" them upwards. The game already pays uniformity once, with the set bonus (same TIER), and the owner asked that
  // mixing pieces be GOOD (leather boots with an iron helm). If the affinity (same WEIGHT) were large too, the two would add up and push everybody towards one pure set, against that. So the three-piece step is
  // about half of the first step of a set, the five-piece one about the first step, and the weapon a small extra. What makes mixing worth it is the stat profile of each weight (docs section 2.4), not this bonus.
  // The ceiling is a RULE, tested (affinity.test.ts): every stat of the affinity stays below the same stat of the WEAKEST set of that weight (bronze / iron for plate, hide for leather, linen for cloth), so completing a set
  // always pays more than just wearing the weight: the set is the progression reward, the affinity only a nudge. If a number ends up above it, lower the number, never the test. maxHpPct has no set to compare with (no tier family
  // carries it), so it is kept small by the same logic.
  // Provisional: phase 8 calibrates with the classes in play.
  affinity: {
    _label: 'Class affinity (small on purpose, see the comment; provisional, phase 8)',
    warriorResist3: { value: 0.012, min: 0, max: 0.2, step: 0.005, label: 'Warrior, 3 plate pieces: resistance' },
    warriorResist5: { value: 0.02, min: 0, max: 0.2, step: 0.005, label: 'Warrior, 5 plate pieces: resistance' },
    warriorHp5: { value: 0.02, min: 0, max: 0.3, step: 0.005, label: 'Warrior, 5 plate pieces: max HP (share)' },
    warriorHpClass: { value: 0.01, min: 0, max: 0.3, step: 0.005, label: 'Warrior, 5 + sword/axe: extra max HP (share)' },
    archerSpeed3: { value: 0.012, min: 0, max: 0.2, step: 0.005, label: 'Archer, 3 leather pieces: attack speed' },
    archerSpeed5: { value: 0.02, min: 0, max: 0.2, step: 0.005, label: 'Archer, 5 leather pieces: attack speed' },
    archerCrit5: { value: 0.03, min: 0, max: 0.5, step: 0.005, label: 'Archer, 5 leather pieces: crit damage' },
    archerSpeedClass: { value: 0.01, min: 0, max: 0.2, step: 0.005, label: 'Archer, 5 + bow/crossbow: extra attack speed' },
    mageCrit3: { value: 0.02, min: 0, max: 0.5, step: 0.005, label: 'Mage, 3 cloth pieces: crit damage' },
    mageCrit5: { value: 0.03, min: 0, max: 0.5, step: 0.005, label: 'Mage, 5 cloth pieces: crit damage' },
    mageRegen5: { value: 0.001, min: 0, max: 0.02, step: 0.0005, label: 'Mage, 5 cloth pieces: regeneration (max HP share per second)' },
    mageRegenClass: { value: 0.0005, min: 0, max: 0.02, step: 0.0005, label: 'Mage, 5 + staff/scepter: extra regeneration' },
  },
  // Equipment abilities and the rotation (abilities.ts; classes reform, phase 4, docs/CLASSES_E_EQUIPAMENTOS.md 2.2). EVERY NUMBER BELOW IS PROVISIONAL: phase 8 (the balance pass) calibrates them against the class parity
  // and the role edge of section 2.5; until then they only have to be sane, not tuned. Percentages are shares of the hero's swing (the basic attack they replace), times are combat-clock ms.
  abilities: {
    _label: 'Equipment abilities (provisional, phase 8 calibrates)',
    rotationSlots: { value: 4, min: 1, max: 6, step: 1, label: 'Rotation: abilities the hero can line up' },
    // carry: the damage that spills over into the NEXT enemy. The bucket fills during a fight; the next enemy enters with min(bucket, its max HP x carryCapPct) already taken, and the bucket is emptied
    // either way (what is left over does not chain into the fight after).
    carryCapPct: { value: 0.7, min: 0, max: 0.9, step: 0.05, label: 'Carry: most of the next enemy max HP the spill can take (share)' },
    // Golpe Firme (sword, strike): this swing hits for firmStrikePct of the damage.
    firmStrikePct: { value: 2.7, min: 1, max: 5, step: 0.1, label: 'Golpe Firme: damage of the swing (x)' },
    firmStrikeCdMs: { value: 4500, min: 1000, max: 60000, step: 500, label: 'Golpe Firme: cooldown (ms)' },
    // Chuva de Flechas (bow, volley): arrowRainHits hits of arrowRainPct each.
    arrowRainHits: { value: 3, min: 2, max: 8, step: 1, label: 'Chuva de Flechas: hits' },
    arrowRainPct: { value: 0.6, min: 0.1, max: 2, step: 0.05, label: 'Chuva de Flechas: damage of each hit (x)' },
    arrowRainCdMs: { value: 8000, min: 1000, max: 60000, step: 500, label: 'Chuva de Flechas: cooldown (ms)' },
    // Chamas (staff, dot): a burn of flamesPct of the hit per tick (T.battle.effectTickMs) for flamesDurationMs, in its own slot beside the weapon burn and Sangria.
    flamesPct: { value: 0.12, min: 0.01, max: 0.5, step: 0.01, label: 'Chamas: damage per tick (share of the hit)' },
    flamesDurationMs: { value: 4000, min: 1000, max: 10000, step: 500, label: 'Chamas: duration (ms)' },
    flamesCdMs: { value: 7000, min: 1000, max: 60000, step: 500, label: 'Chamas: cooldown (ms)' },
    // Explosao Arcana (staff, carry): the swing is a normal one and arcaneBurstPct of it goes to the bucket.
    arcaneBurstPct: { value: 2.1, min: 0.1, max: 3, step: 0.05, label: 'Explosao Arcana: share of the swing that spills over' },
    arcaneBurstCdMs: { value: 5000, min: 1000, max: 60000, step: 500, label: 'Explosao Arcana: cooldown (ms)' },
    // Bencao (scepter, heal + haste).
    blessingHealPct: { value: 0.15, min: 0, max: 1, step: 0.01, label: 'Bencao: max HP healed (share)' },
    blessingHastePct: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'Bencao: attack speed bonus' },
    blessingHasteMs: { value: 5000, min: 1000, max: 30000, step: 500, label: 'Bencao: haste duration (ms)' },
    blessingCdMs: { value: 20000, min: 1000, max: 120000, step: 500, label: 'Bencao: cooldown (ms)' },
    // Postura de Ferro (plate chestpiece, guard).
    ironStanceReduction: { value: 0.4, min: 0, max: 0.9, step: 0.05, label: 'Postura de Ferro: damage taken cut (share)' },
    ironStanceMs: { value: 5000, min: 1000, max: 30000, step: 500, label: 'Postura de Ferro: duration (ms)' },
    ironStanceCdMs: { value: 18000, min: 1000, max: 120000, step: 500, label: 'Postura de Ferro: cooldown (ms)' },
    // Tiro de Abertura (bow, opener): delays the enemy's FIRST attack of the fight; it is only ready while the enemy has not acted yet.
    openingShotDelayMs: { value: 2000, min: 0, max: 10000, step: 250, label: 'Tiro de Abertura: delay of the first enemy attack (ms)' },
    openingShotCdMs: { value: 5000, min: 0, max: 60000, step: 500, label: 'Tiro de Abertura: cooldown (ms)' },
    // The 14 abilities of phase 5 (the rest of the 21 of docs/CLASSES_E_EQUIPAMENTOS.md 2.2). PROVISIONAL like the rest: a bigger effect has a longer cooldown; phase 8 calibrates all of them.
    // Estocada Dupla (sword, volley).
    doubleThrustHits: { value: 2, min: 2, max: 8, step: 1, label: 'Estocada Dupla: hits' },
    doubleThrustPct: { value: 0.9, min: 0.1, max: 2, step: 0.05, label: 'Estocada Dupla: damage of each hit (x)' },
    doubleThrustCdMs: { value: 5000, min: 1000, max: 120000, step: 500, label: 'Estocada Dupla: cooldown (ms)' },
    // Brecha (sword, strike + guard).
    breachPct: { value: 1.3, min: 1, max: 5, step: 0.1, label: 'Brecha: damage of the swing (x)' },
    breachReduction: { value: 0.25, min: 0, max: 0.9, step: 0.05, label: 'Brecha: damage taken cut (share)' },
    breachGuardMs: { value: 3000, min: 1000, max: 30000, step: 500, label: 'Brecha: guard duration (ms)' },
    breachCdMs: { value: 12000, min: 1000, max: 120000, step: 500, label: 'Brecha: cooldown (ms)' },
    // Rachadura (axe, a very strong strike with a long cooldown).
    riftPct: { value: 2.8, min: 1, max: 6, step: 0.1, label: 'Rachadura: damage of the swing (x)' },
    riftCdMs: { value: 14000, min: 1000, max: 120000, step: 500, label: 'Rachadura: cooldown (ms)' },
    // Giro Brutal (axe, carry).
    brutalSpinPct: { value: 1, min: 0.1, max: 3, step: 0.05, label: 'Giro Brutal: share of the swing that spills over' },
    brutalSpinCdMs: { value: 10000, min: 1000, max: 120000, step: 500, label: 'Giro Brutal: cooldown (ms)' },
    // Sangria (axe, dot): a burn of its own in the ability slot, a bleed in words.
    laceratePct: { value: 0.15, min: 0.01, max: 0.5, step: 0.01, label: 'Sangria: damage per tick (share of the hit)' },
    lacerateDurationMs: { value: 5000, min: 1000, max: 10000, step: 500, label: 'Sangria: duration (ms)' },
    lacerateCdMs: { value: 9000, min: 1000, max: 120000, step: 500, label: 'Sangria: cooldown (ms)' },
    // Tiro Potente (bow, strike; the doc calls it Tiro Certeiro, "always a crit"). The 8 effects have no guaranteed crit, so it is a plain heavy strike of the size of one crit (T.battle.critMult = 2), named for its force, not its aim. It stacks with a crit that rolls on the same swing.
    trueShotPct: { value: 1.7, min: 1, max: 5, step: 0.1, label: 'Tiro Potente: damage of the swing (x)' },
    trueShotCdMs: { value: 9000, min: 1000, max: 120000, step: 500, label: 'Tiro Potente: cooldown (ms)' },
    // Virote Perfurante (crossbow, heavy strike).
    piercingBoltPct: { value: 2.4, min: 1, max: 6, step: 0.1, label: 'Virote Perfurante: damage of the swing (x)' },
    piercingBoltCdMs: { value: 10000, min: 1000, max: 120000, step: 500, label: 'Virote Perfurante: cooldown (ms)' },
    // Tiro Duplo (crossbow, volley).
    doubleShotHits: { value: 2, min: 2, max: 8, step: 1, label: 'Tiro Duplo: hits' },
    doubleShotPct: { value: 0.9, min: 0.1, max: 2, step: 0.05, label: 'Tiro Duplo: damage of each hit (x)' },
    doubleShotCdMs: { value: 8000, min: 1000, max: 120000, step: 500, label: 'Tiro Duplo: cooldown (ms)' },
    // Tiro Fatal (crossbow, strike + crit damage). "Crit damage" has no effect of its own either: it is the heaviest strike of the game, with the longest cooldown of the weapon abilities.
    fatalShotPct: { value: 3.2, min: 1, max: 8, step: 0.1, label: 'Tiro Fatal: damage of the swing (x)' },
    fatalShotCdMs: { value: 16000, min: 1000, max: 120000, step: 500, label: 'Tiro Fatal: cooldown (ms)' },
    // Nova (staff, carry + guard).
    novaPct: { value: 2.1, min: 0.1, max: 3, step: 0.05, label: 'Nova: share of the swing that spills over' },
    novaReduction: { value: 0.25, min: 0, max: 0.9, step: 0.05, label: 'Nova: damage taken cut (share)' },
    novaGuardMs: { value: 3000, min: 1000, max: 30000, step: 500, label: 'Nova: guard duration (ms)' },
    novaCdMs: { value: 6000, min: 1000, max: 120000, step: 500, label: 'Nova: cooldown (ms)' },
    // Drenar Vida (scepter, strike + heal).
    drainLifePct: { value: 1.4, min: 1, max: 5, step: 0.1, label: 'Drenar Vida: damage of the swing (x)' },
    drainLifeHealPct: { value: 0.06, min: 0, max: 1, step: 0.01, label: 'Drenar Vida: max HP healed (share)' },
    drainLifeCdMs: { value: 10000, min: 1000, max: 120000, step: 500, label: 'Drenar Vida: cooldown (ms)' },
    // Pulso Sombrio (scepter, carry).
    darkPulsePct: { value: 0.8, min: 0.1, max: 3, step: 0.05, label: 'Pulso Sombrio: share of the swing that spills over' },
    darkPulseCdMs: { value: 9000, min: 1000, max: 120000, step: 500, label: 'Pulso Sombrio: cooldown (ms)' },
    // Esquiva (leather chestpiece, haste).
    dodgeHastePct: { value: 0.35, min: 0, max: 1, step: 0.05, label: 'Esquiva: attack speed bonus' },
    dodgeHasteMs: { value: 4000, min: 1000, max: 30000, step: 500, label: 'Esquiva: haste duration (ms)' },
    dodgeCdMs: { value: 16000, min: 1000, max: 120000, step: 500, label: 'Esquiva: cooldown (ms)' },
    // Folego Arcano (cloth chestpiece, heal).
    arcaneBreathHealPct: { value: 0.12, min: 0, max: 1, step: 0.01, label: 'Folego Arcano: max HP healed (share)' },
    arcaneBreathCdMs: { value: 18000, min: 1000, max: 120000, step: 500, label: 'Folego Arcano: cooldown (ms)' },
  },
  advanced: {
    _label: 'Advanced',
    enemyBaseHp: { value: 100, min: 30, max: 400, step: 5, label: 'Enemy base HP' },
    enemyHpScale: { value: 0.15, min: 0, max: 1, step: 0.05, label: 'Enemy HP growth per round' },
    enemyHeal: { value: 18, min: 1, max: 80, step: 1, label: 'Enemy Focus heal' },
    enemyShieldReduction: { value: 0.7, min: 0.1, max: 0.95, step: 0.05, label: 'Enemy shield reduction' },
    burnDamage: { value: 5, min: 1, max: 30, step: 1, label: 'Burn damage per turn' },
    burnTurns: { value: 2, min: 1, max: 6, step: 1, label: 'Burn duration (turns)' },
    poisonDamage: { value: 6, min: 1, max: 30, step: 1, label: 'Poison damage per turn' },
    poisonTurns: { value: 2, min: 1, max: 6, step: 1, label: 'Poison duration (turns)' },
    // League design (docs/BALANCE_CHANGES.md, Rodada 20): the hero earns XP ONLY from Hunting. What the Dungeon used to pay in XP at its checkpoints and bosses is a flat
    // Gold bonus on those waves now (inside waveRewards, so a defeat keeps the same share of it as of the rest of the run's Gold).
    checkpointGoldBonus: { value: 40, min: 0, max: 1000, step: 5, label: 'Extra Gold on a checkpoint wave (floor 10, 20, 30...)' },
    bossGoldBonus: { value: 100, min: 0, max: 2000, step: 5, label: 'Extra Gold on a biome boss wave (floor 25, 50, 75, 100)' },
    // NO LONGER read by combat, CP or the HeroModal (they all use strengthFlatDamage + strengthWeaponScalePerPoint
    // below via derivedStats.ts strengthAdjustedDamage). Only the inactive legacy arena still reads it.
    strDmgPerPoint: { value: 1, min: 0, max: 10, step: 0.5, label: 'Damage per STR point (legacy arena only)' },
    // STR -> damage, hybrid: dmgBase = (baseHit + W) * (1 + STR * scale) + STR * flat
    strengthFlatDamage: { value: 0.5, min: 0, max: 5, step: 0.05, label: 'STR: flat damage per point' },
    strengthWeaponScalePerPoint: { value: 0.003, min: 0, max: 0.02, step: 0.0005, label: 'STR: (base hit + weapon) damage scaling per point' },
    // CP (see derivedStats.ts combatPowerCore). Sustain: sigma = min(cap, lifesteal% * (1 + reduction)) is the share of
    // incoming damage healed in a symmetric duel; the survival multiplier is 1/(1-sigma), so cap 0.5 => at most x2.
    cpSustainSigmaCap: { value: 0.5, min: 0, max: 0.9, step: 0.05, label: 'CP: max sustain share (sigma cap)' },
    // CP value of the gear effects, each the fraction of its closed-form combat value (scripts/sim/effects audit, docs/ITEM_BALANCE_AUDIT.md Rodada 4)
    // that CP credits: burn counts as dmgBase x burnPctPerSec damage per tick time (x weight for the first tick and overkill lost), reflect as a share
    // of the damage dealt equal to weight x reflect / (1 + reduction), regeneration as sustain: weight x regen per second x (ehp / dps), the
    // seconds a symmetric duel lasts. All three go through the same sqrt(dps x ehp / (1 - sigma)) as every other stat.
    cpBurnWeight: { value: 0.95, min: 0, max: 2, step: 0.05, label: 'CP: burn weight' },
    cpReflectWeight: { value: 0.5, min: 0, max: 2, step: 0.05, label: 'CP: reflect weight' },
    cpRegenWeight: { value: 1.8, min: 0, max: 4, step: 0.05, label: 'CP: regeneration weight' },
    // Hero skills in CP (derivedStats.ts combatPowerCore), weights measured with scripts/sim/itemAudit.sim.ts section I. Bleed counts like burn; the Devastating Strike as the
    // extra damage of its hit share; Block as the share of hits that never land; Firm Stance as the share of fights that are boss / checkpoint floors; Last Bastion as the
    // heal it gives, available in a share of the fights.
    cpBleedWeight: { value: 0.95, min: 0, max: 2, step: 0.05, label: 'CP: bleed weight' },
    cpStrikeWeight: { value: 1, min: 0, max: 2, step: 0.05, label: 'CP: Devastating Strike weight' },
    cpBlockWeight: { value: 1, min: 0, max: 2, step: 0.05, label: 'CP: Block weight' },
    cpBossShare: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'CP: weight of Firm Stance (share of fights against bosses)' },
    cpBastionWeight: { value: 0.3, min: 0, max: 2, step: 0.05, label: 'CP: Last Bastion weight' },
    // Equipment abilities in CP (abilities.ts rotationCpTerms; provisional like the abilities, phase 8 calibrates). Strike / volley damage counts in full, the spill of a carry at carryWeight (the cap, the fights it never reaches
    // and the queue it cannot chain through take the rest), the ability burn at cpBurnWeight, heal as regeneration (cpRegenWeight), guard and haste for the share of the time they are up.
    cpAbilityStrikeWeight: { value: 1, min: 0, max: 2, step: 0.05, label: 'CP: ability strike / volley weight' },
    cpAbilityCarryWeight: { value: 0.5, min: 0, max: 2, step: 0.05, label: 'CP: ability carry weight' },
    cpAbilityGuardWeight: { value: 1, min: 0, max: 2, step: 0.05, label: 'CP: ability guard weight' },
    cpAbilityHasteWeight: { value: 1, min: 0, max: 2, step: 0.05, label: 'CP: ability haste weight' },
    // Math-safety ceiling for each CP input (NOT a gameplay limit): keeps tampered values from overflowing to Infinity.
    cpInputCeiling: { value: 1000000000000, min: 1000000, max: 1000000000000000, step: 1000000, label: 'CP: per-input safety ceiling' },
    // Overflow guard only (NOT a points rule): keeps a tampered/garbage STR from overflowing the damage math to Infinity.
    strengthOverflowGuard: { value: 1000000, min: 1000, max: 1000000000, step: 1000, label: 'STR: safety ceiling used in the damage formula' },
    // VIT -> max HP: vitHpPerPoint + vitHpPerLevel x character level per point (4.5 at level 0, 7.5 at level 100). Rodada 8: a flat 5 made a point worth 2% of an early
    // hero's HP and 0.2% of a level-100 hero's; growing with the level keeps it worth about the same share (docs/BALANCE_CHANGES.md).
    vitHpPerPoint: { value: 4.5, min: 0, max: 50, step: 0.5, label: 'Max HP per VIT point (before the level part)' },
    agiDodgePerPoint: { value: 0.005, min: 0, max: 0.05, step: 0.001, label: 'Dodge chance per AGI point' },
    resResistPerPoint: { value: 0.005, min: 0, max: 0.05, step: 0.001, label: 'Damage resist per RES point' },
    resHpPerPoint: { value: 2, min: 0, max: 20, step: 0.25, label: 'Max HP per RES point (the secondary benefit of RES)' },
    vitHpPerLevel: { value: 0.03, min: 0, max: 1, step: 0.005, label: 'Extra max HP per VIT point for each character level' },
    elixirDamageBonus: { value: 0.2, min: 0, max: 2, step: 0.05, label: 'Strength Elixir damage bonus' },
    playerMaxStamina: { value: 100, min: 40, max: 200, step: 5, label: 'Player max stamina' },
    shakeMs: { value: 350, min: 0, max: 1000, step: 25, label: 'Screen shake duration (ms)' },
    textFloatMs: { value: 900, min: 300, max: 2000, step: 50, label: 'Damage text float (ms)' },
    particleCount: { value: 14, min: 0, max: 40, step: 1, label: 'Hit spark count' },
  },
  // Forge / Oficios batch production (craftJob.ts): the hero makes the units one after another, this many seconds each.
  crafting: {
    _label: 'Crafting (batch production)',
    secondsPerUnit: { value: 1, min: 0.1, max: 60, step: 0.1, label: 'Seconds the hero takes to make one unit' },
    maxBatch: { value: 999, min: 1, max: 9999, step: 1, label: 'Technical ceiling: units in one batch' },
  },
});

// Per-recipe override of the seconds one unit takes (key = refining recipe id, potion recipe key or gear template id). Empty on purpose: every recipe uses crafting.secondsPerUnit for now.
export const CRAFT_SECONDS_OVERRIDES: Record<string, number> = {};

export default T;
