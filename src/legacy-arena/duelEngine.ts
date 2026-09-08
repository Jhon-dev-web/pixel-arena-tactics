/* Legacy 1v1 duel combat engine.
   Archived from src/game/engine.ts when the Camp/Dungeon loop replaced this mode
   as the game's main loop. Kept intact for a possible future standalone arena
   (e.g. a multiplayer/minigame mode) — not wired into the current app. */
import T from '../game/tunables';
import { effectiveCrit, effectiveDamage, effectiveResistance, getEquipped, refineLevel } from '../game/gear';
import { EnemyDef, EnemyKind, getEnemyDef } from '../game/enemies';
import { SaveData, playerMaxHp } from '../game/engine';

export type PlayerAction = 'attack' | 'shield' | 'focus';
export type EnemyAction = 'attack' | 'shield' | 'focus' | 'slam' | 'charge';

export interface FighterState {
  maxHp: number;
  hp: number;
  stamina: number;
  maxStamina: number;
  shielding: boolean;
  focusReady: boolean;
  burnTurns: number;
  poisonTurns: number;
  charging: boolean;
}

export type CombatEventKind =
  | 'damage'
  | 'crit'
  | 'blocked'
  | 'heal'
  | 'stamina'
  | 'reflect'
  | 'burn'
  | 'poison'
  | 'dodge'
  | 'curse'
  | 'slam';

export interface CombatEvent {
  target: 'player' | 'enemy';
  kind: CombatEventKind;
  value: number;
}

export interface Cheats {
  godMode?: boolean;
  oneHitKill?: boolean;
  elixir?: boolean;
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

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export function enemyKindForDuel(duel: number): EnemyKind {
  if (duel % 5 === 0) return 'boss';
  const rotation: EnemyKind[] = ['goblin', 'goblin', 'orc', 'warlock'];
  return rotation[(duel - 1) % rotation.length];
}

export function effectiveAttackStamina(save: SaveData): number {
  const { relic } = getEquipped(save.equipped);
  return Math.max(0, T.combat.attackStamina - (relic?.attackStaminaReduction ?? 0));
}

export function enemyHpForRound(def: EnemyDef, round: number): number {
  return Math.round(T.advanced.enemyBaseHp * def.hpMult * (1 + T.advanced.enemyHpScale * (round - 1)));
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
    poisonTurns: 0,
    charging: false,
  };
}

export function makeEnemy(kind: EnemyKind, round: number): FighterState {
  const def = getEnemyDef(kind);
  const maxHp = enemyHpForRound(def, round);
  return {
    maxHp,
    hp: maxHp,
    stamina: 0,
    maxStamina: 0,
    shielding: false,
    focusReady: false,
    burnTurns: 0,
    poisonTurns: 0,
    charging: false,
  };
}

function rollEnemyAction(def: EnemyDef, wasCharging: boolean): { action: EnemyAction; charging: boolean } {
  if (def.slam && wasCharging) return { action: 'slam', charging: false };

  const attackW = 0.5;
  const shieldW = def.shieldWeight ?? 0;
  const focusW = def.focusWeight ?? 0;
  const chargeW = def.chargeWeight ?? 0;
  const total = attackW + shieldW + focusW + chargeW;

  let r = Math.random() * total;
  if ((r -= chargeW) < 0) return { action: 'charge', charging: true };
  if ((r -= shieldW) < 0) return { action: 'shield', charging: false };
  if (r - focusW < 0) return { action: 'focus', charging: false };
  return { action: 'attack', charging: false };
}

export function resolveTurn(
  action: PlayerAction,
  player: FighterState,
  enemy: FighterState,
  save: SaveData,
  enemyDef: EnemyDef,
  cheats?: Cheats,
): TurnResult {
  const roll = rollEnemyAction(enemyDef, enemy.charging);
  const enemyAction = roll.action;
  const enemyShielded = enemyAction === 'shield';

  const { weapon, armor, relic } = getEquipped(save.equipped);
  const attackStamina = Math.max(0, T.combat.attackStamina - (relic?.attackStaminaReduction ?? 0));
  const critMult = T.combat.critMult + (relic?.critMultBonus ?? 0);
  const wLvl = refineLevel(save.upgrades, save.equipped.weapon);
  const aLvl = refineLevel(save.upgrades, save.equipped.armor);

  const playerEvents: CombatEvent[] = [];
  const enemyEvents: CombatEvent[] = [];

  let pMid: FighterState = { ...player, shielding: false };
  let eMid: FighterState = { ...enemy, shielding: false, charging: roll.charging };

  // -- Player action --
  if (action === 'attack') {
    pMid = { ...pMid, stamina: pMid.stamina - attackStamina };
    const oneHitKill = !!cheats?.oneHitKill;
    const dodged = !oneHitKill && (enemyDef.dodge ?? 0) > 0 && Math.random() < (enemyDef.dodge ?? 0);

    if (dodged) {
      playerEvents.push({ target: 'enemy', kind: 'dodge', value: 0 });
    } else {
      let dmg: number;
      let crit = false;
      if (oneHitKill) {
        dmg = enemy.maxHp;
      } else {
        const upgradeBonus = (save.weaponLevel - 1) * T.progression.weaponDmgPerLvl;
        dmg =
          randInt(T.combat.attackMin, T.combat.attackMax) +
          upgradeBonus +
          effectiveDamage(weapon, wLvl) +
          save.str * T.advanced.strDmgPerPoint;
        if (cheats?.elixir) dmg = Math.round(dmg * (1 + T.advanced.elixirDamageBonus));
        const randomCrit = Math.random() < effectiveCrit(weapon, wLvl);
        crit = pMid.focusReady || randomCrit;
        if (crit) {
          dmg = Math.round(dmg * critMult);
          if (pMid.focusReady) pMid = { ...pMid, focusReady: false };
        }
      }

      if (enemyShielded && !oneHitKill) {
        dmg = Math.round(dmg * (1 - T.advanced.enemyShieldReduction));
        playerEvents.push({ target: 'enemy', kind: 'blocked', value: dmg });
      }
      playerEvents.push({ target: 'enemy', kind: crit ? 'crit' : 'damage', value: dmg });
      eMid = { ...eMid, hp: Math.max(0, eMid.hp - dmg) };
      if (weapon?.burn && !oneHitKill) eMid = { ...eMid, burnTurns: T.advanced.burnTurns };
    }
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

  const applyIncoming = (dmg: number, kind: CombatEventKind): number => {
    if (cheats?.godMode) return 0;
    const dodgeChance = Math.min(0.5, save.agi * T.advanced.agiDodgePerPoint);
    if (dodgeChance > 0 && Math.random() < dodgeChance) {
      enemyEvents.push({ target: 'player', kind: 'dodge', value: 0 });
      return 0;
    }
    let d = dmg;
    if (pMid.shielding) {
      const absorbed = d * T.combat.shieldReduction;
      d = d * (1 - T.combat.shieldReduction);
      enemyEvents.push({ target: 'player', kind: 'blocked', value: Math.round(d) });
      const reflect = armor?.reflect ?? 0;
      if (reflect > 0) {
        const reflected = Math.round(absorbed * reflect);
        eEnd = { ...eEnd, hp: Math.max(0, eEnd.hp - reflected) };
        enemyEvents.push({ target: 'enemy', kind: 'reflect', value: reflected });
      }
    }
    d = Math.round(d * (1 - (effectiveResistance(armor, aLvl) + save.res * T.advanced.resResistPerPoint)));
    enemyEvents.push({ target: 'player', kind, value: d });
    return d;
  };

  if (enemyAction === 'attack') {
    const dmg = applyIncoming(
      randInt(
        Math.round(T.combat.enemyAtkMin * enemyDef.atkMult),
        Math.round(T.combat.enemyAtkMax * enemyDef.atkMult),
      ),
      'damage',
    );
    pEnd = { ...pMid, hp: Math.max(0, pMid.hp - dmg) };
    if (enemyDef.poison && !cheats?.godMode) {
      pEnd = { ...pEnd, poisonTurns: T.advanced.poisonTurns };
      enemyEvents.push({ target: 'player', kind: 'curse', value: 0 });
    }
  } else if (enemyAction === 'slam') {
    const dmg = applyIncoming(randInt(enemyDef.slamMin ?? 40, enemyDef.slamMax ?? 55), 'slam');
    pEnd = { ...pMid, hp: Math.max(0, pMid.hp - dmg) };
  } else if (enemyAction === 'focus') {
    const heal = Math.round(T.advanced.enemyHeal * enemyDef.healMult);
    const hp = Math.min(eMid.maxHp, eMid.hp + heal);
    eEnd = { ...eMid, hp };
    enemyEvents.push({ target: 'enemy', kind: 'heal', value: heal });
  }
  // 'charge' / 'shield': no further damage this turn.

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

export function tickPoison(player: FighterState): { player: FighterState; damage: number } {
  if (player.poisonTurns <= 0) return { player, damage: 0 };
  const dmg = T.advanced.poisonDamage;
  return {
    player: { ...player, hp: Math.max(0, player.hp - dmg), poisonTurns: player.poisonTurns - 1 },
    damage: dmg,
  };
}
