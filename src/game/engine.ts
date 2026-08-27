import T from './tunables';
import { EquippedGear, DEFAULT_EQUIPPED, DEFAULT_INVENTORY, durabilityFactor, effectiveCrit, effectiveDamage, effectiveMaxHp, effectiveResistance, getEquipped, getGear, MAX_DURABILITY, refineLevel, sanitizeSaveInventory } from './gear';
import { EnemyDef, getEnemyDef, EnemyKind } from './enemies';
import { Materials, emptyMaterials } from './materials';
import { ActiveExpedition, getExpedition } from './expedition';
import { ConsumableId, emptyConsumables } from './consumables';
import { GemId, emptyGems, getGem, totalGemBonuses } from './gems';

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

export interface SaveData {
  gold: number;
  victories: number;
  shards: number;
  xp: number;
  weaponLevel: number;
  armorLevel: number;
  inventory: Record<string, number>;
  equipped: EquippedGear;
  upgrades: Record<string, number>;
  highestFloor: number;
  heroName: string;
  str: number;
  vit: number;
  agi: number;
  res: number;
  materials: Materials;
  potions: { hp: number; stamina: number; elixir: number };
  consumables: Record<ConsumableId, number>;
  expedition: ActiveExpedition | null;
  durability: Record<string, number>;
  gems: Record<GemId, number>;
  sockets: Record<string, GemId[]>;
  blessed: boolean;
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

const SAVE_KEY = 'arena-rpg-save-v1';

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

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
  if ((r -= focusW) < 0) return { action: 'focus', charging: false };
  return { action: 'attack', charging: false };
}

export const MAX_LEVEL = 100;

export function xpForNextLevel(level: number): number {
  return Math.round(T.progression.xpBase * Math.pow(T.progression.xpGrowth, level - 1));
}

export function xpToReachLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForNextLevel(l);
  return total;
}

export function playerLevel(xp: number): number {
  let level = 1;
  let total = 0;
  while (level < MAX_LEVEL) {
    const need = xpForNextLevel(level);
    if (xp < total + need) return level;
    total += need;
    level++;
  }
  return MAX_LEVEL;
}

export function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return trimDec(n / 1e9) + 'B';
  if (abs >= 1e6) return trimDec(n / 1e6) + 'M';
  if (abs >= 1e3) return trimDec(n / 1e3) + 'K';
  return String(Math.floor(n));
}

function trimDec(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function playerMaxHp(save: SaveData): number {
  const { armor } = getEquipped(save.equipped);
  const armorLvl = refineLevel(save.upgrades, save.equipped.armor);
  const aDur = save.durability?.[save.equipped.armor] ?? MAX_DURABILITY;
  const gems = totalGemBonuses(save.equipped, save.sockets ?? {});
  return Math.round(
    T.progression.playerBaseHp +
      (save.armorLevel - 1) * T.progression.armorHpPerLvl +
      effectiveMaxHp(armor, armorLvl) * durabilityFactor(aDur) +
      (playerLevel(save.xp) - 1) * T.progression.levelHpBonus +
      save.vit * T.advanced.vitHpPerPoint +
      gems.maxHp,
  );
}

export function computeCP(save: SaveData): number {
  const { weapon, armor } = getEquipped(save.equipped);
  const wLvl = refineLevel(save.upgrades, save.equipped.weapon);
  const aLvl = refineLevel(save.upgrades, save.equipped.armor);
  const wDur = save.durability?.[save.equipped.weapon] ?? MAX_DURABILITY;
  const aDur = save.durability?.[save.equipped.armor] ?? MAX_DURABILITY;
  const gems = totalGemBonuses(save.equipped, save.sockets ?? {});
  const totalDamage =
    (T.combat.attackMin + T.combat.attackMax) / 2 +
    effectiveDamage(weapon, wLvl) * durabilityFactor(wDur) +
    save.str * T.advanced.strDmgPerPoint;
  const totalMaxHp = playerMaxHp(save);
  const totalDefense =
    (effectiveResistance(armor, aLvl) * durabilityFactor(aDur) + save.res * T.advanced.resResistPerPoint + gems.resistance) * 100;
  const totalCrit = effectiveCrit(weapon, wLvl) * durabilityFactor(wDur) * 100;
  return Math.floor(totalDamage * 1.5 + totalMaxHp * 0.2 + totalDefense * 2 + totalCrit * 3 + gems.critDamageBonus * 300);
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

export function defaultSave(): SaveData {
  return {
    gold: 0,
    victories: 0,
    shards: 0,
    xp: 0,
    weaponLevel: 1,
    armorLevel: 1,
    inventory: { ...DEFAULT_INVENTORY },
    equipped: { ...DEFAULT_EQUIPPED },
    upgrades: {},
    highestFloor: 1,
    heroName: 'Hero',
    str: 0,
    vit: 0,
    agi: 0,
    res: 0,
    materials: emptyMaterials(),
    potions: { hp: 0, stamina: 0, elixir: 0 },
    consumables: emptyConsumables(),
    expedition: null,
    durability: {},
    gems: emptyGems(),
    sockets: {},
    blessed: false,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const base = defaultSave();
      const legacyOwned = (parsed as { owned?: string[] }).owned;
      const inventory =
        parsed.inventory ??
        (legacyOwned ? Object.fromEntries(legacyOwned.map((id) => [id, 1])) : base.inventory);
      const gear = sanitizeSaveInventory(inventory, parsed.equipped ?? base.equipped);
      let xp = typeof parsed.xp === 'number' && Number.isFinite(parsed.xp) && parsed.xp >= 0 ? parsed.xp : 0;
      if (xp >= xpToReachLevel(MAX_LEVEL + 1)) xp = 0;
      const upgrades: Record<string, number> = {};
      for (const [id, lvl] of Object.entries(parsed.upgrades ?? {})) {
        const n = Math.floor(Number(lvl));
        if (getGear(id) && Number.isFinite(n) && n > 0) upgrades[id] = Math.min(8, n);
      }
      const highestFloor = Math.max(1, Math.min(4, Math.floor(Number(parsed.highestFloor ?? 1)) || 1));
      const exp = parsed.expedition;
      const expedition =
        exp && typeof exp.id === 'string' && getExpedition(exp.id) && typeof exp.endsAt === 'number' && Number.isFinite(exp.endsAt)
          ? { id: exp.id, endsAt: exp.endsAt }
          : null;
      const durability: Record<string, number> = {};
      for (const [id, d] of Object.entries(parsed.durability ?? {})) {
        if (!getGear(id)) continue;
        const n = Math.floor(Number(d));
        if (Number.isFinite(n)) durability[id] = Math.max(0, Math.min(MAX_DURABILITY, n));
      }
      const gems = { ...emptyGems() };
      for (const k of Object.keys(gems) as GemId[]) {
        const n = Math.floor(Number((parsed.gems ?? {})[k]));
        gems[k] = Number.isFinite(n) && n > 0 ? n : 0;
      }
      const sockets: Record<string, GemId[]> = {};
      for (const [id, list] of Object.entries(parsed.sockets ?? {})) {
        if (!getGear(id) || !Array.isArray(list)) continue;
        sockets[id] = (list as string[]).filter((g) => getGem(g)).slice(0, 4) as GemId[];
      }
      return {
        ...base,
        ...parsed,
        xp,
        inventory: gear.inventory,
        equipped: gear.equipped,
        upgrades,
        highestFloor,
        materials: { ...emptyMaterials(), ...(parsed.materials ?? {}) },
        potions: { hp: 0, stamina: 0, elixir: 0, ...(parsed.potions ?? {}) },
        consumables: { ...emptyConsumables(), ...(parsed.consumables ?? {}) },
        expedition,
        durability,
        gems,
        sockets,
        blessed: !!parsed.blessed,
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
