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
  progression: {
    _label: 'Progression',
    goldMin: { value: 35, min: 5, max: 200, step: 1, label: 'Loot gold (min)' },
    goldMax: { value: 65, min: 5, max: 300, step: 1, label: 'Loot gold (max)' },
    weaponBaseCost: { value: 50, min: 10, max: 500, step: 5, label: 'Weapon upgrade base cost' },
    armorBaseCost: { value: 50, min: 10, max: 500, step: 5, label: 'Armor upgrade base cost' },
    weaponDmgPerLvl: { value: 5, min: 1, max: 30, step: 1, label: 'Weapon damage per level' },
    armorHpPerLvl: { value: 20, min: 5, max: 100, step: 1, label: 'Armor HP per level' },
    playerBaseHp: { value: 80, min: 40, max: 300, step: 5, label: 'Player base HP' },
    xpPerLevel: { value: 100, min: 10, max: 1000, step: 10, label: 'XP per level' },
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
    afkGoldPerSec: { value: 2, min: 0, max: 100, step: 1, label: 'AFK gold per second' },
    afkXpPerSec: { value: 3, min: 0, max: 100, step: 1, label: 'AFK XP per second' },
    playerMaxStamina: { value: 100, min: 40, max: 200, step: 5, label: 'Player max stamina' },
    shakeMs: { value: 350, min: 0, max: 1000, step: 25, label: 'Screen shake duration (ms)' },
    textFloatMs: { value: 900, min: 300, max: 2000, step: 50, label: 'Damage text float (ms)' },
    particleCount: { value: 14, min: 0, max: 40, step: 1, label: 'Hit spark count' },
  },
});

export default T;
