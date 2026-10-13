import type { SaveData } from './engine';
import { GEAR, GearItem, SET_FAMILIES, getGear } from './gear';
import { DropRarity, MATERIALS, MaterialId } from './materials';
import { HUNTING_ZONES, HuntingEnemyId, HuntingZoneDef, huntingEnemyNameKey } from './huntingZones';
import { DEPTH_BOSS_POOLS, MAX_DUNGEON_FLOOR, stageOfDepth } from './dungeon';
import T from './tunables';
import { BOSS_RELIC_DROPS, UNIQUE_BOSS_DROPS } from './uniques';
import { dungeonEnemyVisualForFloor } from './sprites';
import { ORE_TIERS } from './ores';
import { WOOD_TIERS } from './woodcutting';
import { PLANTS } from './garden';
import { REFINING_RECIPES } from './refining';

// The codex ("Códice"): what the hero has ever owned, held or defeated, as three lists (gear, materials, monsters). An entry is a silhouette until it is
// discovered. Discovery is permanent and monotonic: it is read from the save (the bag, the stash, the gear, the lifetime kill counters, the highest floor)
// every time the save changes (statsTracking.trackSave), and an old save is backfilled from what it holds today (normalizeCodex).

export interface CodexState {
  items: string[]; // gear template ids
  materials: string[]; // material ids
  monsters: string[]; // monster ids (see codexMonsters)
}

export const emptyCodex = (): CodexState => ({ items: [], materials: [], monsters: [] });

export type CodexTab = 'items' | 'materials' | 'monsters';
export const CODEX_TABS: CodexTab[] = ['items', 'materials', 'monsters'];

// ---- the catalog ----------------------------------------------------------------------------------------------------------------------------------------

// Every piece a hero can really get: forged (a recipe) or dropped (a unique or a boss relic). The two starter pieces and the Season Emblem (Pass only, no way
// to earn it in play) are not listed, so 100 % is reachable by everybody.
export const CODEX_ITEMS: GearItem[] = GEAR.filter((g) => !!g.recipe || !!g.source);

const hasSource = (id: MaterialId): boolean => materialSources(id).length > 0;

export type MaterialSource =
  | { kind: 'hunt'; zoneId: string; rarity: DropRarity }
  | { kind: 'mining' }
  | { kind: 'woodcutting' }
  | { kind: 'garden' }
  | { kind: 'refining' };

// Where a material comes from, as the game's own tables say it (zone drop lists, ore / wood tiers, garden plants, refining outputs).
export function materialSources(id: MaterialId): MaterialSource[] {
  const out: MaterialSource[] = [];
  for (const zone of HUNTING_ZONES) {
    const drop = zone.drops.find((d) => d.material === id);
    if (drop) out.push({ kind: 'hunt', zoneId: zone.id, rarity: drop.rarity });
  }
  if (ORE_TIERS.some((o) => o.id === id)) out.push({ kind: 'mining' });
  if (WOOD_TIERS.some((w) => w.id === id)) out.push({ kind: 'woodcutting' });
  if (PLANTS.some((p) => p.material === id)) out.push({ kind: 'garden' });
  if (REFINING_RECIPES.some((r) => r.output === id)) out.push({ kind: 'refining' });
  return out;
}

export const CODEX_MATERIALS: MaterialId[] = MATERIALS.map((m) => m.id).filter(hasSource);

export interface CodexMonster {
  id: string;
  kind: 'hunt' | 'dungeon';
  nameKey: string; // under `enemies.`
  huntEnemy?: HuntingEnemyId;
  zone?: HuntingZoneDef;
  spriteUrl?: string; // dungeon monsters: the sheet
  floors?: [number, number]; // dungeon monsters: first and last floor they appear on
  // Profundezas bosses: the biome boss (25 / 50 / 75 / 100) whose sheet, pieces and relic they borrow, the first depth they appear at and the tint of the borrowed sheet.
  depthPool?: number;
  depth?: number;
  tintClass?: string;
}

// Hunting monsters (one per zone) first, then the dungeon's, in the order the player meets them.
export const CODEX_MONSTERS: CodexMonster[] = (() => {
  const out: CodexMonster[] = HUNTING_ZONES.map((zone) => ({ id: zone.enemyId, kind: 'hunt' as const, nameKey: huntingEnemyNameKey(zone.enemyId), huntEnemy: zone.enemyId, zone }));
  const seen = new Map<string, CodexMonster>();
  for (let floor = 1; floor <= MAX_DUNGEON_FLOOR; floor++) {
    const v = dungeonEnemyVisualForFloor(floor);
    const known = seen.get(v.nameKey);
    if (known) {
      known.floors = [known.floors![0], floor];
    } else {
      const m: CodexMonster = { id: v.nameKey, kind: 'dungeon', nameKey: v.nameKey, spriteUrl: v.spriteUrl, floors: [floor, floor] };
      seen.set(v.nameKey, m);
      out.push(m);
    }
  }
  // The four bosses of the Profundezas (depths.ts): one per borrowed biome boss sheet, found by defeating a depth boss.
  DEPTH_BOSS_POOLS.forEach((pool, i) => {
    const depth = T.depths.bossEvery * (i + 1);
    const v = dungeonEnemyVisualForFloor(stageOfDepth(depth));
    out.push({ id: v.nameKey, kind: 'dungeon', nameKey: v.nameKey, spriteUrl: v.spriteUrl, depthPool: pool, depth, tintClass: v.tintClass });
  });
  return out;
})();

export const codexIds = (tab: CodexTab): string[] =>
  tab === 'items' ? CODEX_ITEMS.map((g) => g.id) : tab === 'materials' ? CODEX_MATERIALS : CODEX_MONSTERS.map((m) => m.id);

// ---- what drops where (display data) ---------------------------------------------------------------------------------------------------------------------

export type DropWording = DropRarity | 'unique';
export interface MonsterDrop {
  kind: 'material' | 'item';
  id: string;
  wording: DropWording; // comum / incomum / raro / muito raro: never an exact percentage
}

// The drop table of a monster: a hunting monster's zone materials and unique pieces; a dungeon monster's boss pieces (the unique pieces and the relic of the
// boss floors inside its floor range). The dungeon itself drops no materials.
export function monsterDrops(m: CodexMonster): MonsterDrop[] {
  const out: MonsterDrop[] = [];
  if (m.zone) {
    for (const d of m.zone.drops) out.push({ kind: 'material', id: d.material, wording: d.rarity });
    for (const u of m.zone.uniques ?? []) out.push({ kind: 'item', id: u.itemId, wording: 'unique' });
  } else if (m.depthPool) {
    for (const id of UNIQUE_BOSS_DROPS[m.depthPool] ?? []) out.push({ kind: 'item', id, wording: 'unique' });
    const relic = BOSS_RELIC_DROPS[m.depthPool];
    if (relic) out.push({ kind: 'item', id: relic, wording: 'unique' });
  } else if (m.floors) {
    for (let f = m.floors[0]; f <= m.floors[1]; f++) {
      for (const id of UNIQUE_BOSS_DROPS[f] ?? []) out.push({ kind: 'item', id, wording: 'unique' });
      const relic = BOSS_RELIC_DROPS[f];
      if (relic) out.push({ kind: 'item', id: relic, wording: 'unique' });
    }
  }
  return out;
}

// ---- discovery ------------------------------------------------------------------------------------------------------------------------------------------

const unionInOrder = (all: readonly string[], ...sets: Iterable<string>[]): string[] => {
  const have = new Set<string>();
  for (const s of sets) for (const id of s) have.add(id);
  return all.filter((id) => have.has(id));
};

// Everything the save proves has been owned / held / defeated right now (a union with what the codex already remembers is the caller's job).
export function discoveredFromSave(save: SaveData): CodexState {
  const items = new Set<string>();
  for (const inst of Object.values(save.gearInstances ?? {})) items.add(inst.templateId);
  for (const [id, n] of Object.entries(save.inventory ?? {})) if (n > 0) items.add(id);
  for (const [id, n] of Object.entries(save.stash?.gear ?? {})) if (n > 0) items.add(id);
  if (save.equipped?.relic) items.add(save.equipped.relic);

  const mats = new Set<string>();
  for (const [id, n] of Object.entries(save.materials ?? {})) if ((n as number) > 0) mats.add(id);
  for (const [id, n] of Object.entries(save.stash?.materials ?? {})) if ((n ?? 0) > 0) mats.add(id);

  const monsters = new Set<string>();
  const stats = save.stats;
  for (const zone of HUNTING_ZONES) if ((stats?.killsByZone?.[zone.id] ?? 0) > 0) monsters.add(zone.enemyId);
  for (const [id, n] of Object.entries(stats?.dungeonKills ?? {})) if (n > 0) monsters.add(id);
  // A save from before the kill counters: every dungeon floor up to the highest one cleared was fought.
  const cleared = Math.min(MAX_DUNGEON_FLOOR, Math.max(0, save.quests?.counters?.maxFloorCleared ?? 0));
  for (let floor = 1; floor <= cleared; floor++) monsters.add(dungeonEnemyVisualForFloor(floor).nameKey);

  return {
    items: unionInOrder(codexIds('items'), items),
    materials: unionInOrder(codexIds('materials'), mats),
    monsters: unionInOrder(codexIds('monsters'), monsters),
  };
}

// A stored codex (absent, partial, tampered) plus whatever the save proves: only known ids, in catalog order.
export function normalizeCodex(raw: unknown, save: SaveData): CodexState {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Record<CodexTab, unknown>>) : {};
  const stored = (tab: CodexTab): string[] => (Array.isArray(r[tab]) ? (r[tab] as unknown[]).filter((id): id is string => typeof id === 'string') : []);
  const found = discoveredFromSave(save);
  return {
    items: unionInOrder(codexIds('items'), stored('items'), found.items),
    materials: unionInOrder(codexIds('materials'), stored('materials'), found.materials),
    monsters: unionInOrder(codexIds('monsters'), stored('monsters'), found.monsters),
  };
}

// The save with whatever it newly proves added to its codex (the same object back when nothing is new, and when nothing that feeds the codex changed).
export function updateCodex(prev: SaveData, next: SaveData): SaveData {
  const known = next.codex;
  if (
    known &&
    prev.gearInstances === next.gearInstances &&
    prev.inventory === next.inventory &&
    prev.materials === next.materials &&
    prev.stash === next.stash &&
    prev.stats === next.stats &&
    prev.quests.counters === next.quests.counters &&
    prev.equipped.relic === next.equipped.relic
  ) {
    return next;
  }
  const base = known ?? emptyCodex();
  const found = discoveredFromSave(next);
  const merged: CodexState = {
    items: unionInOrder(codexIds('items'), base.items, found.items),
    materials: unionInOrder(codexIds('materials'), base.materials, found.materials),
    monsters: unionInOrder(codexIds('monsters'), base.monsters, found.monsters),
  };
  const same = merged.items.length === base.items.length && merged.materials.length === base.materials.length && merged.monsters.length === base.monsters.length;
  return known && same ? next : { ...next, codex: merged };
}

// ---- completion -----------------------------------------------------------------------------------------------------------------------------------------

export interface CodexProgress {
  found: number;
  total: number;
  pct: number; // whole percent, rounded down (100 only when everything is found)
}

const progressOf = (found: number, total: number): CodexProgress => ({ found, total, pct: total <= 0 ? 0 : Math.floor((found / total) * 100) });

export function codexProgress(codex: CodexState | undefined): Record<CodexTab | 'overall', CodexProgress> {
  const c = codex ?? emptyCodex();
  const items = progressOf(c.items.length, CODEX_ITEMS.length);
  const materials = progressOf(c.materials.length, CODEX_MATERIALS.length);
  const monsters = progressOf(c.monsters.length, CODEX_MONSTERS.length);
  const overall = progressOf(items.found + materials.found + monsters.found, items.total + materials.total + monsters.total);
  return { items, materials, monsters, overall };
}

export const codexPct = (codex: CodexState | undefined): number => codexProgress(codex).overall.pct;

// Display helpers ---------------------------------------------------------------------------------------------------------------------------------------

export const isUniqueItem = (id: string): boolean => !!getGear(id)?.unique;

// The set family name key of a piece, if it has one ('dragon' pieces also count for gilded in set bonuses but are listed under dragon).
export const itemFamily = (item: GearItem): (typeof SET_FAMILIES)[number] | undefined => item.setFamily;

// The order the gear tab lists its slots in.
export const GEAR_SLOT_ORDER = ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'ring', 'shield', 'relic'] as const;
