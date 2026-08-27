const DebugPanel = (window as any).DebugPanel;

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
    rewardGrowth: { value: 0.15, min: 0, max: 1, step: 0.01, label: 'Reward growth per stage' },
    miniBossEvery: { value: 5, min: 3, max: 10, step: 1, label: 'Mini-boss every N stages' },
    miniBossHpMult: { value: 1.5, min: 1, max: 3, step: 0.1, label: 'Mini-boss HP multiplier' },
    miniBossDmgMult: { value: 1.25, min: 1, max: 3, step: 0.05, label: 'Mini-boss damage multiplier' },
    miniBossShards: { value: 2, min: 1, max: 5, step: 1, label: 'Mini-boss shard drop' },
    potionThreshold: { value: 0.35, min: 0.05, max: 0.9, step: 0.05, label: 'Auto-potion HP threshold (ratio)' },
    potionHealRatio: { value: 0.35, min: 0.05, max: 1, step: 0.05, label: 'Auto-potion heal (ratio of max HP)' },
    potionCooldownMs: { value: 5000, min: 1000, max: 15000, step: 500, label: 'Auto-potion cooldown (ms)' },
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
