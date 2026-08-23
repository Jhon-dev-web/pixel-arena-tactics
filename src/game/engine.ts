import T from './tunables';

export type PlayerAction = 'attack' | 'shield' | 'focus';
export type EnemyAction = 'attack' | 'shield' | 'focus';

export interface FighterState {
  maxHp: number;
  hp: number;
  stamina: number;
  maxStamina: number;
  shielding: boolean;
  focusReady: boolean;
}

export type CombatEventKind = 'damage' | 'crit' | 'blocked' | 'heal' | 'stamina';

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
  return T.progression.playerBaseHp + (save.armorLevel - 1) * T.progression.armorHpPerLvl;
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
  };
}

export function makeEnemy(round: number): FighterState {
  const maxHp = enemyHpForRound(round);
  return { maxHp, hp: maxHp, stamina: 0, maxStamina: 0, shielding: false, focusReady: false };
}

export function resolveTurn(
  action: PlayerAction,
  player: FighterState,
  enemy: FighterState,
  save: SaveData,
): TurnResult {
  const enemyAction = rollEnemyAction();
  const enemyShielded = enemyAction === 'shield';

  const playerEvents: CombatEvent[] = [];
  const enemyEvents: CombatEvent[] = [];

  let pMid: FighterState = { ...player, shielding: false };
  let eMid: FighterState = { ...enemy, shielding: false };

  // -- Player action --
  if (action === 'attack') {
    pMid = { ...pMid, stamina: pMid.stamina - T.combat.attackStamina };
    const bonus = (save.weaponLevel - 1) * T.progression.weaponDmgPerLvl;
    let dmg = randInt(T.combat.attackMin, T.combat.attackMax) + bonus;
    const crit = pMid.focusReady;
    if (crit) {
      dmg = Math.round(dmg * T.combat.critMult);
      pMid = { ...pMid, focusReady: false };
    }
    if (enemyShielded) {
      dmg = Math.round(dmg * (1 - T.advanced.enemyShieldReduction));
      playerEvents.push({ target: 'enemy', kind: 'blocked', value: dmg });
    }
    playerEvents.push({ target: 'enemy', kind: crit ? 'crit' : 'damage', value: dmg });
    eMid = { ...eMid, hp: Math.max(0, eMid.hp - dmg) };
  } else if (action === 'shield') {
    pMid = { ...pMid, stamina: pMid.stamina - T.combat.shieldStamina, shielding: true };
  } else {
    const st = Math.min(pMid.maxStamina, pMid.stamina + T.combat.focusStamina);
    const hp = Math.min(pMid.maxHp, pMid.hp + T.combat.focusHp);
    pMid = { ...pMid, stamina: st, hp, focusReady: true };
    playerEvents.push({ target: 'player', kind: 'stamina', value: T.combat.focusStamina });
    playerEvents.push({ target: 'player', kind: 'heal', value: T.combat.focusHp });
  }

  // -- Enemy action --
  let pEnd: FighterState = pMid;
  let eEnd: FighterState = eMid;

  if (enemyAction === 'attack') {
    let dmg = randInt(T.combat.enemyAtkMin, T.combat.enemyAtkMax);
    if (pMid.shielding) {
      dmg = Math.round(dmg * (1 - T.combat.shieldReduction));
      enemyEvents.push({ target: 'player', kind: 'blocked', value: dmg });
    }
    enemyEvents.push({ target: 'player', kind: 'damage', value: dmg });
    pEnd = { ...pMid, hp: Math.max(0, pMid.hp - dmg) };
  } else if (enemyAction === 'focus') {
    const hp = Math.min(eMid.maxHp, eMid.hp + T.advanced.enemyHeal);
    eEnd = { ...eMid, hp };
    enemyEvents.push({ target: 'enemy', kind: 'heal', value: T.advanced.enemyHeal });
  }
  // enemyAction === 'shield': already applied during player phase.

  return { enemyAction, playerMid: pMid, enemyMid: eMid, playerEnd: pEnd, enemyEnd: eEnd, playerEvents, enemyEvents };
}

export function defaultSave(): SaveData {
  return { gold: 0, victories: 0, weaponLevel: 1, armorLevel: 1 };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...defaultSave(), ...(JSON.parse(raw) as SaveData) };
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
