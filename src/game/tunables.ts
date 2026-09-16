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
    agiSpeedPerPoint: { value: 0.005, min: 0, max: 0.05, step: 0.001, label: 'Attack speed per AGI point' },
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
    xpPerHarvest: { value: 10, min: 1, max: 100, step: 1, label: 'Gardening skill XP per harvest (any plant)' },
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
    subLevelDmgGrowth: { value: 0.05, min: 0, max: 0.5, step: 0.01, label: 'Enemy damage growth per sub-level' },
    enemyAtkMs: { value: 1800, min: 800, max: 4000, step: 100, label: 'Hunting enemy attack interval (ms)' },
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
    expeditionBonusSlots: { value: 1, min: 0, max: 3, step: 1, label: 'Extra simultaneous Expedition slots while active' },
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
    strDmgPerPoint: { value: 1, min: 0, max: 10, step: 0.5, label: 'Damage per STR point' },
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
