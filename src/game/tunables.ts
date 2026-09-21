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
    agiHalfPoint: { value: 100, min: 10, max: 1000, step: 10, label: 'AGI at which the interval is halfway to the floor' },
    agiMax: { value: 300, min: 1, max: 1000, step: 1, label: 'AGI clamp used in combat (= max level 100 x 3 points)' },
    lungeMs: { value: 320, min: 80, max: 900, step: 20, cssVar: '--lunge-ms', unit: 'ms', label: 'Lunge animation (ms)' },
    flashMs: { value: 250, min: 50, max: 800, step: 25, cssVar: '--flash-ms', unit: 'ms', label: 'Hit flash (ms)' },
    lungeDist: { value: 18, min: 4, max: 60, step: 2, cssVar: '--lunge-dist', unit: 'px', label: 'Lunge distance' },
    waveHeal: { value: 0.1, min: 0, max: 1, step: 0.01, label: 'HP healed after wave (ratio)' },
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
    // Retuned from 1.2/0.3: at 0.3, per-hit boss damage was so far under HP scaling that a "recommended CP"
    // build's win rate barely depended on defense at all (see project memory on the CP recalibration
    // session) — 0.45/1.05 puts real risk back on a single exchange (~11% of max HP per hit at the
    // recalibrated CP, confirmed via tick-loop simulation to stay far from one-shot territory) without
    // reintroducing the pre-nerf one-shot problem that motivated dropping bossDmgMult from 1.8 in the
    // first place. bossHpMult nudged down slightly (1.2->1.05) to keep fight length comparable.
    bossHpMult: { value: 1.05, min: 0.5, max: 5, step: 0.05, label: 'Main boss HP multiplier' },
    bossDmgMult: { value: 0.45, min: 0.1, max: 4, step: 0.05, label: 'Main boss damage multiplier' },
    bossShards: { value: 5, min: 1, max: 20, step: 1, label: 'Main boss shard drop' },
    // Optional Elite re-fight of an already-beaten gate boss (same stage curve, no floor-progress
    // stakes) — reuses the pre-rebalance boss multipliers as its intentionally-brutal baseline.
    eliteHpMult: { value: 2.2, min: 1, max: 6, step: 0.1, label: 'Elite challenge HP multiplier' },
    eliteDmgMult: { value: 1.8, min: 1, max: 5, step: 0.1, label: 'Elite challenge damage multiplier' },
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
    xpGrowth: { value: 1.15, min: 1, max: 2, step: 0.01, label: 'XP growth per level' },
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
    // Deliberately its own curve, separate from character xpGrowth (progression.xpGrowth) — that one
    // is tuned for a months-long arc across hundreds of millions of XP; this one only needs to pace a
    // single sub-system (~16 real days of steady mining to hit max level under default tunables).
    xpBase: { value: 5, min: 1, max: 100, step: 1, label: 'Skill XP for level 1->2' },
    xpGrowth: { value: 1.08, min: 1, max: 1.5, step: 0.01, label: 'Skill XP growth per level' },
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
    freeSessionsPerDay: { value: 3, min: 1, max: 10, step: 1, label: 'Free Dungeon sessions per day' },
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
    // Material weight budget an order asks for, per hour of the delivery (scrap-equivalents; NOT a Gold price), by tier.
    weightPerHourT1: { value: 9, min: 1, max: 60, step: 1, label: 'Requested material weight per hour, tier 1' },
    weightPerHourT2: { value: 13, min: 1, max: 60, step: 1, label: 'Requested material weight per hour, tier 2' },
    weightPerHourT3: { value: 17, min: 1, max: 60, step: 1, label: 'Requested material weight per hour, tier 3' },
    weightPerHourT4: { value: 20, min: 1, max: 60, step: 1, label: 'Requested material weight per hour, tier 4' },
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
    xpPerHourLocal: { value: 39000, min: 0, max: 400000, step: 1000, label: 'XP per hour, Local' },
    xpPerHourCurta: { value: 45000, min: 0, max: 400000, step: 1000, label: 'XP per hour, Short' },
    xpPerHourRegional: { value: 51000, min: 0, max: 400000, step: 1000, label: 'XP per hour, Regional' },
    xpPerHourLonga: { value: 56000, min: 0, max: 400000, step: 1000, label: 'XP per hour, Long' },
    xpPerHourEspecial: { value: 60000, min: 0, max: 400000, step: 1000, label: 'XP per hour, Special' },
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
    capClaw: { value: 26, min: 1, max: 500, step: 1, label: 'Max Garras per order' },
    capBlood: { value: 14, min: 1, max: 500, step: 1, label: 'Max Sangue per order' },
    capNoble: { value: 3, min: 1, max: 50, step: 1, label: 'Max Nucleos / Cristais (each) per order' },
    capCommonHerb: { value: 5, min: 1, max: 100, step: 1, label: 'Max Erva Medicinal per order' },
    capEnergyHerb: { value: 3, min: 1, max: 100, step: 1, label: 'Max Erva Energetica per order' },
    capRoot: { value: 1, min: 1, max: 50, step: 1, label: 'Max Raiz per order' },
    capMushroom: { value: 1, min: 1, max: 50, step: 1, label: 'Max Cogumelo per order' },
    capFlower: { value: 1, min: 1, max: 50, step: 1, label: 'Max Flor Carmesim per order' },
    capRawMaterial: { value: 60, min: 1, max: 1000, step: 1, label: 'Max ore / wood per order' },
    capProcessed: { value: 6, min: 1, max: 100, step: 1, label: 'Max processed units per order' },
    shortCapFactor: { value: 0.6, min: 0.1, max: 1, step: 0.05, label: 'Quantity ceiling factor for deliveries shorter than Long' },
    bulkSpecialFactor: { value: 1.5, min: 1, max: 3, step: 0.1, label: 'Quantity ceiling factor for common/refined on Special' },
    // A processed unit costs Gold to make; an order that asks for it may never let that fee eat more than this share of its Gold.
    processedFeeMaxShare: { value: 0.5, min: 0.1, max: 1, step: 0.05, label: 'Max share of the order Gold that processing fees may represent' },
    processedFeeWeight: { value: 0.6, min: 0, max: 3, step: 0.1, label: 'Weight per Gold of processing fee (raises processed-material weight)' },
  },
  battlePass: {
    _label: 'Battle Pass',
    xpBase: { value: 100, min: 20, max: 500, step: 10, label: 'Pass XP required for level 2' },
    xpGrowth: { value: 1.08, min: 1, max: 1.5, step: 0.01, label: 'Pass XP growth per level' },
    durationDays: { value: 30, min: 1, max: 90, step: 1, label: 'Pass duration on activation (days)' },
    capHours: { value: 24, min: 4, max: 48, step: 1, label: 'Offline storage cap with pass (hours)' },
    dropRateMultiplier: { value: 1.25, min: 1, max: 3, step: 0.05, label: 'Drop rate multiplier with pass' },
    xpPerFloor: { value: 15, min: 1, max: 100, step: 1, label: 'Pass XP per dungeon floor cleared' },
    xpPerHuntHour: { value: 10, min: 1, max: 100, step: 1, label: 'Pass XP per hour of Hunting claimed' },
    xpPerMiningHour: { value: 10, min: 1, max: 100, step: 1, label: 'Pass XP per hour of Mining claimed' },
    pouchBonusSlots: { value: 2, min: 0, max: 6, step: 1, label: 'Extra Hunting Pouch slots while active' },
    repairDiscount: { value: 0.2, min: 0, max: 0.5, step: 0.05, label: 'Forge repair gold discount while active' },
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
    // Math-safety ceiling for each CP input (NOT a gameplay limit): keeps tampered values from overflowing to Infinity.
    cpInputCeiling: { value: 1000000000000, min: 1000000, max: 1000000000000000, step: 1000000, label: 'CP: per-input safety ceiling' },
    // Overflow guard only (NOT a points rule): keeps a tampered/garbage STR from overflowing the damage math to Infinity.
    strengthOverflowGuard: { value: 1000000, min: 1000, max: 1000000000, step: 1000, label: 'STR: safety ceiling used in the damage formula' },
    vitHpPerPoint: { value: 5, min: 0, max: 50, step: 1, label: 'Max HP per VIT point' },
    agiDodgePerPoint: { value: 0.005, min: 0, max: 0.05, step: 0.001, label: 'Dodge chance per AGI point' },
    resResistPerPoint: { value: 0.005, min: 0, max: 0.05, step: 0.001, label: 'Damage resist per RES point' },
    elixirDamageBonus: { value: 0.2, min: 0, max: 2, step: 0.05, label: 'Strength Elixir damage bonus' },
    playerMaxStamina: { value: 100, min: 40, max: 200, step: 5, label: 'Player max stamina' },
    shakeMs: { value: 350, min: 0, max: 1000, step: 25, label: 'Screen shake duration (ms)' },
    textFloatMs: { value: 900, min: 300, max: 2000, step: 50, label: 'Damage text float (ms)' },
    particleCount: { value: 14, min: 0, max: 40, step: 1, label: 'Hit spark count' },
  },
});

export default T;
