import T from './tunables';
import { EquippedGear, DEFAULT_EQUIPPED, DEFAULT_OWNED, getEquipped } from './gear';

export type PlayerAction = 'attack' | 'shield' | 'focus';
export type EnemyAction = 'attack' | 'shield' | 'focus';

export interface FighterState {
  maxHp: number;
  hp: number;
  stamina: number;
  maxStamina: number;
  shielding: boolean;
  focusReady: boolean;
  burnTurns: number;
}

export type CombatEventKind = 'damage' | 'crit' | 'blocked' | 'heal' | 'stamina' | 'reflect' | 'burn';

export interface CombatEvent {
  target: 'player' | 'enemy';
  kind: CombatEventKind;
  value: number;
}

export interface SaveData {
  gold: number;
  victories: number;
  weaponLevel: number;
  armorLevel: number;
  owned: string[];
  equipped: EquippedGear;
}

export interface TurnResult {
  enemyAction: EnemyAction;
  playerMid: FighterState;
  enemyMid: FighterState;
  playerEnd: FighterState;
  enemyEnd: FighterState;
  playerEvents: CombatEvent[];
  enemyEvents: CombatEvent[];
}

const SAVE_KEY = 'arena-rpg-save-v1';

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export function rollEnemyAction(): EnemyAction {
  const r = Math.random();
  if (r < 0.5) return 'attack';
  if (r < 0.75) return 'shield';
  return 'focus';
}

export function playerMaxHp(save: SaveData): number {
  const { armor } = getEquipped(save.equipped);
  return (
    T.progression.playerBaseHp +
    (save.armorLevel - 1) * T.progression.armorHpPerLvl +
    (armor?.maxHp ?? 0)
  );
}

export function effectiveAttackStamina(save: SaveData): number {
  const { relic } = getEquipped(save.equipped);
  return Math.max(0, T.combat.attackStamina - (relic?.attackStaminaReduction ?? 0));
}

export function enemyHpForRound(round: number): number {
  return Math.round(T.advanced.enemyBaseHp * (1 + T.advanced.enemyHpScale * (round - 1)));
}

export function makePlayer(save: SaveData): FighterState {
  const maxHp = playerMaxHp(save);
  return {
    maxHp,
    hp: maxHp,
    stamina: T.advanced.playerMaxStamina,
    maxStamina: T.advanced.playerMaxStamina,
    shielding: false,
    focusReady: false,
    burnTurns: 0,
  };
}

export function makeEnemy(round: number): FighterState {
  const maxHp = enemyHpForRound(round);
  return { maxHp, hp: maxHp, stamina: 0, maxStamina: 0, shielding: false, focusReady: false, burnTurns: 0 };
}

export function resolveTurn(
  action: PlayerAction,
  player: FighterState,
  enemy: FighterState,
  save: SaveData,
): TurnResult {
  const enemyAction = rollEnemyAction();
  const enemyShielded = enemyAction === 'shield';

  const { weapon, armor, relic } = getEquipped(save.equipped);
  const attackStamina = Math.max(0, T.combat.attackStamina - (relic?.attackStaminaReduction ?? 0));
  const critMult = T.combat.critMult + (relic?.critMultBonus ?? 0);

  const playerEvents: CombatEvent[] = [];
  const enemyEvents: CombatEvent[] = [];

  let pMid: FighterState = { ...player, shielding: false };
  let eMid: FighterState = { ...enemy, shielding: false };

  // -- Player action --
  if (action === 'attack') {
    pMid = { ...pMid, stamina: pMid.stamina - attackStamina };
    const upgradeBonus = (save.weaponLevel - 1) * T.progression.weaponDmgPerLvl;
    let dmg = randInt(T.combat.attackMin, T.combat.attackMax) + upgradeBonus + (weapon?.damage ?? 0);

    const randomCrit = Math.random() < (weapon?.critChance ?? 0);
    const crit = pMid.focusReady || randomCrit;
    if (crit) {
      dmg = Math.round(dmg * critMult);
      if (pMid.focusReady) pMid = { ...pMid, focusReady: false };
    }

    if (enemyShielded) {
      dmg = Math.round(dmg * (1 - T.advanced.enemyShieldReduction));
      playerEvents.push({ target: 'enemy', kind: 'blocked', value: dmg });
    }
    playerEvents.push({ target: 'enemy', kind: crit ? 'crit' : 'damage', value: dmg });
    eMid = { ...eMid, hp: Math.max(0, eMid.hp - dmg) };
    if (weapon?.burn) eMid = { ...eMid, burnTurns: T.advanced.burnTurns };
  } else if (action === 'shield') {
    pMid = { ...pMid, stamina: pMid.stamina - T.combat.shieldStamina, shielding: true };
  } else {
    const heal = T.combat.focusHp + (relic?.focusHpBonus ?? 0);
    const st = Math.min(pMid.maxStamina, pMid.stamina + T.combat.focusStamina);
    const hp = Math.min(pMid.maxHp, pMid.hp + heal);
    pMid = { ...pMid, stamina: st, hp, focusReady: true };
    playerEvents.push({ target: 'player', kind: 'stamina', value: T.combat.focusStamina });
    playerEvents.push({ target: 'player', kind: 'heal', value: heal });
  }

  // -- Enemy action --
  let pEnd: FighterState = pMid;
  let eEnd: FighterState = eMid;

  if (enemyAction === 'attack') {
    let dmg = randInt(T.combat.enemyAtkMin, T.combat.enemyAtkMax);
    if (pMid.shielding) {
      const absorbed = dmg * T.combat.shieldReduction;
      dmg = dmg * (1 - T.combat.shieldReduction);
      enemyEvents.push({ target: 'player', kind: 'blocked', value: Math.round(dmg) });
      const reflect = armor?.reflect ?? 0;
      if (reflect > 0) {
        const reflected = Math.round(absorbed * reflect);
        eEnd = { ...eEnd, hp: Math.max(0, eEnd.hp - reflected) };
        enemyEvents.push({ target: 'enemy', kind: 'reflect', value: reflected });
      }
    }
    dmg = Math.round(dmg * (1 - (armor?.resistance ?? 0)));
    enemyEvents.push({ target: 'player', kind: 'damage', value: dmg });
    pEnd = { ...pMid, hp: Math.max(0, pMid.hp - dmg) };
  } else if (enemyAction === 'focus') {
    const hp = Math.min(eMid.maxHp, eMid.hp + T.advanced.enemyHeal);
    eEnd = { ...eMid, hp };
    enemyEvents.push({ target: 'enemy', kind: 'heal', value: T.advanced.enemyHeal });
  }
  // enemyAction === 'shield': already applied during the player phase.

  return {
    enemyAction,
    playerMid: pMid,
    enemyMid: eMid,
    playerEnd: pEnd,
    enemyEnd: eEnd,
    playerEvents,
    enemyEvents,
  };
}

export function tickBurn(enemy: FighterState): { enemy: FighterState; damage: number } {
  if (enemy.burnTurns <= 0) return { enemy, damage: 0 };
  const dmg = T.advanced.burnDamage;
  return {
    enemy: { ...enemy, hp: Math.max(0, enemy.hp - dmg), burnTurns: enemy.burnTurns - 1 },
    damage: dmg,
  };
}

export function defaultSave(): SaveData {
  return {
    gold: 0,
    victories: 0,
    weaponLevel: 1,
    armorLevel: 1,
    owned: [...DEFAULT_OWNED],
    equipped: { ...DEFAULT_EQUIPPED },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const base = defaultSave();
      return {
        ...base,
        ...parsed,
        owned: parsed.owned?.length ? parsed.owned : base.owned,
        equipped: { ...base.equipped, ...(parsed.equipped ?? {}) },
      };
    }
  } catch {
    /* ignore */
  }
  return defaultSave();
}

export function persistSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}
