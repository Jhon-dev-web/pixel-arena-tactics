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
    rewardGrowth: { value: 0.05, min: 0, max: 1, step: 0.01, label: 'XP reward growth per stage (dungeon.ts stageVictoryXp only)' },
    // Kept separate from rewardGrowth (XP) so gold economy tuning never silently reflows XP pacing.
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
    boss100HpMult: { value: 1.2, min: 0.1, max: 5, step: 0.01, label: 'Floor-100 boss: extra HP multiplier' },
    boss100DmgMult: { value: 1.2, min: 0.1, max: 5, step: 0.01, label: 'Floor-100 boss: extra damage multiplier' },
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
    xpPotionAmount: { value: 150, min: 10, max: 5000, step: 10, label: 'XP Potion instant XP' },
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
    heroGrowth4: { value: 1.21, min: 1, max: 2, step: 0.01, label: 'Hero XP growth, band 4 (levels 61-80)' },
    heroGrowth5: { value: 1.27, min: 1, max: 2, step: 0.01, label: 'Hero XP growth, band 5 (levels 81-100)' },
    levelHpBonus: { value: 5, min: 0, max: 50, step: 1, label: 'Max HP bonus per level' },
  },
  mining: {
    _label: 'Idle Mining',
    capHours: { value: 4, min: 1, max: 24, step: 1, label: 'Offline storage cap (hours)' },
    oreRatePerPower: { value: 1, min: 0.1, max: 10, step: 0.1, label: 'Ore per hour per Mining Power point' },
    // Economy design: Mining is an unattended, bot-friendly loop — it must stay an exclusive
    // raw-material faucet (ore/gems) with zero liquid currency, or it hyperinflates gold.
    goldRatePerPower: { value: 0, min: 0, max: 20, step: 0.5, label: 'Gold per hour per Mining Power point (kept at 0 — see economy note)' },
  },
  woodcutting: {
    _label: 'Idle Woodcutting',
    capHours: { value: 4, min: 1, max: 24, step: 1, label: 'Offline storage cap (hours)' },
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
    professionGrowth4: { value: 1.10, min: 1, max: 1.5, step: 0.01, label: 'Mining/Woodcutting XP growth, band 4 (levels 51-75)' },
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
    _label: 'Round 12 consumables (repair kits, sharpening stone, polish, lure, prospector tonic)',
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
    hpGrowth: { value: 0.04, min: 0, max: 0.5, step: 0.005, label: 'Enemy HP growth per depth (compounding)' },
    dmgGrowth: { value: 0.03, min: 0, max: 0.5, step: 0.005, label: 'Enemy damage growth per depth (compounding)' },
    bossEvery: { value: 10, min: 2, max: 50, step: 1, label: 'Depth boss every N depths' },
    bossHpMult: { value: 1.6, min: 0.5, max: 5, step: 0.05, label: 'Depth boss: HP multiplier over a regular depth' },
    bossDmgMult: { value: 1.25, min: 0.5, max: 5, step: 0.05, label: 'Depth boss: damage multiplier over a regular depth' },
    bossShards: { value: 4, min: 0, max: 20, step: 1, label: 'Runes for a depth boss' },
    uniqueChanceBase: { value: 0.02, min: 0, max: 1, step: 0.005, label: 'Depth boss unique / relic chance at depth 0 (per boss cleared)' },
    uniqueChancePerDepth: { value: 0.001, min: 0, max: 0.05, step: 0.0005, label: 'Depth boss unique / relic chance gained per depth' },
    uniqueChanceCap: { value: 0.05, min: 0, max: 1, step: 0.005, label: 'Depth boss unique / relic chance cap' },
  },
  // Paragon (paragon.ts): after level 100 the XP keeps counting into paragon levels, each a tiny permanent damage bonus, capped.
  paragon: {
    _label: 'Paragon levels (after hero level 100)',
    xpShare: { value: 0.05, min: 0.001, max: 5, step: 0.005, label: 'XP of paragon level 1 as a share of the XP of hero level 99 -> 100' },
    xpGrowth: { value: 1.015, min: 1, max: 1.5, step: 0.005, label: 'XP growth per paragon level' },
    damagePerLevel: { value: 0.002, min: 0, max: 0.05, step: 0.0005, label: 'Damage bonus per paragon level (fraction)' },
    maxBonus: { value: 0.1, min: 0, max: 1, step: 0.01, label: 'Cap on the total paragon damage bonus (fraction)' },
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
    // Economy design: normal Dungeon runs are throttled by daily attempt count, not by XP value —
    // per-kill XP now scales with floor difficulty (dungeon.ts stageVictoryXp), which would let a
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
  // Delivery orders (deliveries.ts): materials + time -> Gold + XP (+ shards on Long/Special). Replaces the Expedition.
  // Everything a delivery pays is a function of TIER x DISTANCE x time, never of how valuable the delivered materials are.
  deliveries: {
    _label: 'Delivery orders',
    offersBase: { value: 3, min: 1, max: 6, step: 1, label: 'Visible offers (base)' },
    offersPass: { value: 4, min: 1, max: 8, step: 1, label: 'Visible offers with Battle Pass' },
    rerollsBase: { value: 1, min: 0, max: 5, step: 1, label: 'Free rerolls per day (base)' },
    rerollsPass: { value: 2, min: 0, max: 8, step: 1, label: 'Free rerolls per day with Battle Pass' },
    // The Pass no longer doubles Expedition throughput, so it gets a small XP-only bonus on deliveries (never Gold, shards,
    // materials or time). Applied when the order is ACCEPTED and frozen in the snapshot.
    passXpBonus: { value: 0.1, min: 0, max: 0.5, step: 0.05, label: 'Extra delivery XP with Battle Pass (fraction)' },
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
    // Balance pass, round 2: x0.02 on all five (was 39000 / 45000 / 51000 / 56000 / 60000). Orders were >90% of the XP a player earned from day 3
    // (300-750k/day), which left character level, the recipe level gates and the CP curve meaningless. Gold, timers and requirements untouched.
    xpPerHourLocal: { value: 780, min: 0, max: 400000, step: 10, label: 'XP per hour, Local' },
    xpPerHourCurta: { value: 900, min: 0, max: 400000, step: 10, label: 'XP per hour, Short' },
    xpPerHourRegional: { value: 1020, min: 0, max: 400000, step: 10, label: 'XP per hour, Regional' },
    xpPerHourLonga: { value: 1120, min: 0, max: 400000, step: 10, label: 'XP per hour, Long' },
    xpPerHourEspecial: { value: 1200, min: 0, max: 400000, step: 10, label: 'XP per hour, Special' },
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
    capHours: { value: 6, min: 4, max: 24, step: 1, label: 'Offline storage cap with the Pass (hours): Hunting, Mining and Woodcutting (base stays at the zone / skill cap)' },
    dropRateMultiplier: { value: 1.1, min: 1, max: 3, step: 0.05, label: 'Material yield multiplier with pass (Hunting, Mining, Woodcutting)' },
    xpPerFloor: { value: 15, min: 1, max: 100, step: 1, label: 'Pass XP per dungeon floor cleared' },
    xpPerHuntHour: { value: 10, min: 1, max: 100, step: 1, label: 'Pass XP per hour of Hunting claimed' },
    xpPerMiningHour: { value: 10, min: 1, max: 100, step: 1, label: 'Pass XP per hour of Mining AND Woodcutting claimed (one rule for both, gathering.ts)' },
    stashBonusSlots: { value: 10, min: 0, max: 40, step: 5, label: 'Extra camp stash slots for the Pass owner' },
    // The bag perk is a share of the owner's capacity (rounded up) with this many slots as the floor (inventory.ts passBagBonus): 26 -> +6, 60 -> +12, 100 -> +20.
    bagBonusPct: { value: 0.2, min: 0, max: 0.5, step: 0.05, label: 'Extra inventory capacity for the Pass owner (fraction)' },
    bagBonusSlots: { value: 5, min: 0, max: 20, step: 1, label: 'Minimum extra inventory slots for the Pass owner' },
    // Extra Gold (fraction) from the Dungeon, Hunting and delivery orders. ADDS to the gear bonus (and its cap) and the Fortune Tonic, like the tonic; the merchant is not included.
    goldBonus: { value: 0.1, min: 0, max: 0.5, step: 0.05, label: 'Extra Gold for the Pass owner: Dungeon, Hunting, deliveries (fraction)' },
    repairDiscount: { value: 0.2, min: 0, max: 0.5, step: 0.05, label: 'Forge repair gold discount while active' },
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
    crushBonusBase: { value: 0.3, min: 0, max: 1, step: 0.005, label: 'Golpe Esmagador: bonus damage, base (rank 0)' },
    crushBonusStep: { value: 0.3, min: 0, max: 1, step: 0.005, label: 'Golpe Esmagador: bonus damage per rank' },
    furyEveryMs: { value: 8000, min: 2000, max: 30000, step: 500, label: 'Golpe de Furia: interval (ms of combat)' },
    furyHits: { value: 3, min: 1, max: 8, step: 1, label: 'Golpe de Furia: extra hits per flurry' },
    furyDmgBase: { value: 0.25, min: 0, max: 1, step: 0.005, label: 'Golpe de Furia: damage of each hit, base (rank 0)' },
    furyDmgStep: { value: 0.1, min: 0, max: 1, step: 0.005, label: 'Golpe de Furia: damage of each hit per rank' },
    doubleBase: { value: 0.04, min: 0, max: 0.5, step: 0.005, label: 'Golpe Duplo: chance, base (rank 0)' },
    doubleStep: { value: 0.04, min: 0, max: 0.5, step: 0.005, label: 'Golpe Duplo: chance per rank' },
    doubleDmgPct: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'Golpe Duplo: damage of the second strike (share of the hit)' },
    counterBase: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'Contra-ataque: bonus damage, base (rank 0)' },
    counterStep: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'Contra-ataque: bonus damage per rank' },
    devastatingEvery: { value: 3, min: 2, max: 10, step: 1, label: 'Golpe Devastador: every Nth Golpe Esmagador' },
    devastatingMult: { value: 3, min: 1, max: 6, step: 0.1, label: 'Golpe Devastador: damage multiplier of that strike' },
    keenEyeCrit: { value: 0.024, min: 0, max: 0.2, step: 0.005, label: 'Olho Clinico: crit chance per rank (absolute)' },
    executionCritMult: { value: 0.11, min: 0, max: 0.5, step: 0.01, label: 'Execucao: crit multiplier per rank (absolute)' },
    bleedBase: { value: 0.01, min: 0, max: 0.3, step: 0.005, label: 'Sangria: share of the hit dealt per second, base (rank 0)' },
    bleedStep: { value: 0.03, min: 0, max: 0.3, step: 0.005, label: 'Sangria: share of the hit dealt per second, per rank' },
    bleedDurationMs: { value: 3000, min: 1000, max: 10000, step: 500, label: 'Sangria: duration after the last hit (ms)' },
    weaponMasterPct: { value: 0.035, min: 0, max: 0.3, step: 0.005, label: 'Mestre de Armas: weapon base damage per rank' },
    // Guardiao
    thickSkinHp: { value: 0.025, min: 0, max: 0.3, step: 0.005, label: 'Pele Dura: max HP per rank' },
    bulwarkRes: { value: 0.07, min: 0, max: 0.3, step: 0.005, label: 'Muralha: resistance sum per rank (multiplier)' },
    thornsReflect: { value: 0.08, min: 0, max: 0.2, step: 0.005, label: 'Espinhos: reflect per rank (absolute)' },
    secondWindRegen: { value: 0.0011, min: 0, max: 0.05, step: 0.0005, label: 'Segundo Folego: max HP regenerated per second, per rank' },
    firmStanceReduction: { value: 0.06, min: 0, max: 0.3, step: 0.005, label: 'Postura Firme: damage taken from boss and checkpoint floors, per rank' },
    blockBase: { value: 0.01, min: 0, max: 0.3, step: 0.005, label: 'Bloqueio: chance to block a hit, base (rank 0)' },
    blockStep: { value: 0.03, min: 0, max: 0.3, step: 0.005, label: 'Bloqueio: chance to block a hit per rank' },
    bastionHealPct: { value: 0.25, min: 0, max: 1, step: 0.05, label: 'Ultimo Bastiao: max HP healed after the save' },
    bastionCooldownMs: { value: 60000, min: 5000, max: 600000, step: 5000, label: 'Ultimo Bastiao: Hunting cooldown (ms of combat time)' },
    // Cacador
    greedGold: { value: 0.04, min: 0, max: 0.3, step: 0.005, label: 'Ganancia: extra Gold per rank (outside the gear cap)' },
    scentMaterials: { value: 0.07, min: 0, max: 0.3, step: 0.005, label: 'Faro: Hunting material yield per rank' },
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
  ui: {
    _label: 'UI Layout',
    spriteSize: { value: 132, min: 80, max: 240, step: 2, cssVar: '--sprite-size', unit: 'px', label: 'Combatant sprite size' },
    barW: { value: 120, min: 60, max: 220, step: 2, cssVar: '--bar-w', unit: 'px', label: 'HP/stamina bar width' },
    barH: { value: 14, min: 6, max: 30, step: 1, cssVar: '--bar-h', unit: 'px', label: 'HP/stamina bar height' },
    actionH: { value: 68, min: 44, max: 110, step: 2, cssVar: '--action-h', unit: 'px', label: 'Action button height' },
    actionGap: { value: 12, min: 0, max: 40, step: 1, cssVar: '--action-gap', unit: 'px', label: 'Action button gap' },
    fontSize: { value: 12, min: 8, max: 20, step: 1, cssVar: '--font-size', unit: 'px', label: 'UI font size' },
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
    victoryXp: { value: 60, min: 10, max: 500, step: 5, label: 'XP per victory' },
    checkpointXpBonus: { value: 200, min: 0, max: 2000, step: 10, label: 'Bonus XP per checkpoint cleared' },
    bossXpBonus: { value: 500, min: 0, max: 5000, step: 25, label: 'Bonus XP per biome boss cleared' },
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
});

export default T;
