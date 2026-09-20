import T from './tunables';
import { GEAR, GearItem, INSTANCED_SLOTS, InstancedSlot, isInstancedSlot, MAX_DURABILITY, MAX_REFINE, getGear, upgradeChance, upgradeCost } from './gear';
import { GEMS, GemBonuses, GemId, addGemBonuses, gemListBonuses, getGem, hasGems, socketsForTier } from './gems';
import { MaterialId, hasMaterials } from './materials';
import { RARITIES, Rarity, Substat, SubstatTotals, addSubstatTotals, rollRarity, rollSubstats, substatListTotals } from './rarity';
import { SALVAGE_BONUS_CHANCE, getSalvageReturn, hasSalvageValue } from './salvage';
import type { SaveData } from './engine';

// Gear instances: every weapon / armor is its OWN object (rarity, substats, refine level, sockets, durability,
// reforge count). Materials, consumables, gems, relics and tools stay stackable counters keyed by id.
//
// Every mutation below is a pure reducer `(save, ...) -> save | null` (null = rejected, nothing charged, no RNG
// consumed). Callers pass the RNG in (defaults to Math.random) so a server can later replace the reducer body
// without touching the UI. Instance ids are opaque strings: never derive meaning from them.

export type GearInstanceId = string;

export const GEAR_SCHEMA_VERSION = 2;

export { INSTANCED_SLOTS, isInstancedSlot };
export type { InstancedSlot };

// What an empty weapon / armor slot resolves to ("bare hands"): the zero-stat starter templates.
export const STARTER_TEMPLATES: Record<InstancedSlot, string> = { weapon: 'wooden_club', armor: 'ragged_clothes' };

export type GearOrigin = 'craft' | 'starter' | 'migration' | 'recovery' | 'admin';

export interface GearInstance {
  id: GearInstanceId;
  templateId: string;
  rarity: Rarity;
  substats: Substat[];
  upgrade: number;
  sockets: GemId[];
  durability: number;
  reforgeCount: number;
  createdAt: number;
  origin: GearOrigin;
}

export function isInstancedItem(item: GearItem | undefined | null): boolean {
  return !!item && isInstancedSlot(item.slot);
}

// ---------------------------------------------------------------------------------------------------------
// ids

// New items: crypto.randomUUID(), falling back to getRandomValues. There is deliberately NO Math.random
// fallback: a predictable id is worse than a refused craft. Migration ids are deterministic instead
// (`mg_<templateId>_<n>`, see migrateGearV1toV2).
export function newGearInstanceId(): GearInstanceId {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return 'gi_' + c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return 'gi_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('No secure random source available to create a gear instance id');
}

function uniqueId(existing: Record<string, unknown>, factory: () => string): string {
  for (let i = 0; i < 8; i++) {
    const id = factory();
    if (!(id in existing)) return id;
  }
  throw new Error('Could not generate a unique gear instance id');
}

// ---------------------------------------------------------------------------------------------------------
// creation / sanitizing

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function clampRefine(n: number): number {
  return Math.max(0, Math.min(MAX_REFINE, n));
}

const RARITY_IDS = RARITIES.map((r) => r.id as string);
const isRarity = (r: unknown): r is Rarity => typeof r === 'string' && RARITY_IDS.includes(r);

function sanitizeSubstats(list: unknown): Substat[] {
  if (!Array.isArray(list)) return [];
  return (list as Substat[])
    .filter((s) => s && typeof s.value === 'number' && Number.isFinite(s.value))
    .slice(0, 4)
    .map((s) => ({ type: s.type, value: s.value }));
}

function sanitizeSockets(list: unknown): GemId[] {
  if (!Array.isArray(list)) return [];
  return (list as string[]).filter((g) => getGem(g)).slice(0, 4) as GemId[];
}

export interface CreateGearInstanceOpts {
  id?: GearInstanceId;
  origin: GearOrigin;
  // Omitted rarity is rolled (rollRarity), omitted substats are rolled for that rarity/tier — exactly what the
  // forge did for a fresh weapon/armor.
  rarity?: Rarity;
  substats?: Substat[];
  upgrade?: number;
  sockets?: GemId[];
  durability?: number;
  reforgeCount?: number;
  createdAt?: number;
}

export function createGearInstance(templateId: string, opts: CreateGearInstanceOpts): GearInstance {
  const item = getGear(templateId);
  if (!item || !isInstancedItem(item)) throw new Error(`Not an instanced gear template: ${templateId}`);
  const rarity = opts.rarity ?? rollRarity();
  return {
    id: opts.id ?? newGearInstanceId(),
    templateId,
    rarity,
    substats: opts.substats ?? rollSubstats(rarity, item.tier ?? 0),
    upgrade: clampInt(opts.upgrade ?? 0, 0, MAX_REFINE, 0),
    sockets: sanitizeSockets(opts.sockets ?? []),
    durability: clampInt(opts.durability ?? MAX_DURABILITY, 0, MAX_DURABILITY, MAX_DURABILITY),
    reforgeCount: clampInt(opts.reforgeCount ?? 0, 0, Number.MAX_SAFE_INTEGER, 0),
    createdAt: Number.isFinite(opts.createdAt) ? (opts.createdAt as number) : 0,
    origin: opts.origin,
  };
}

const ORIGINS: GearOrigin[] = ['craft', 'starter', 'migration', 'recovery', 'admin'];

export function sanitizeGearInstance(raw: unknown, key: string): GearInstance | null {
  const r = raw as Partial<GearInstance> | null | undefined;
  if (!r || typeof r !== 'object' || typeof key !== 'string' || key.length === 0) return null;
  if (typeof r.templateId !== 'string') return null;
  const item = getGear(r.templateId);
  if (!item || !isInstancedItem(item)) return null;
  return {
    id: key,
    templateId: r.templateId,
    rarity: isRarity(r.rarity) ? r.rarity : 'common',
    substats: sanitizeSubstats(r.substats),
    upgrade: clampInt(r.upgrade, 0, MAX_REFINE, 0),
    sockets: sanitizeSockets(r.sockets),
    durability: clampInt(r.durability, 0, MAX_DURABILITY, MAX_DURABILITY),
    reforgeCount: clampInt(r.reforgeCount, 0, Number.MAX_SAFE_INTEGER, 0),
    createdAt: Number.isFinite(Number(r.createdAt)) ? Number(r.createdAt) : 0,
    origin: ORIGINS.includes(r.origin as GearOrigin) ? (r.origin as GearOrigin) : 'migration',
  };
}

export function sanitizeGearInstances(raw: unknown): Record<GearInstanceId, GearInstance> {
  const out: Record<GearInstanceId, GearInstance> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const inst = sanitizeGearInstance(value, key);
    if (inst) out[key] = inst;
  }
  return out;
}

// An equipped weapon / armor pointer is only valid if that instance exists and belongs to that slot.
export function sanitizeEquippedInstance(
  id: unknown,
  slot: InstancedSlot,
  instances: Record<GearInstanceId, GearInstance>,
): GearInstanceId | null {
  if (typeof id !== 'string') return null;
  const inst = instances[id];
  return inst && getGear(inst.templateId)?.slot === slot ? id : null;
}

// ---------------------------------------------------------------------------------------------------------
// starters

export function createStarterGear(): { instances: Record<GearInstanceId, GearInstance>; weaponId: GearInstanceId; armorId: GearInstanceId } {
  const instances: Record<GearInstanceId, GearInstance> = {};
  const mk = (slot: InstancedSlot): GearInstanceId => {
    const templateId = STARTER_TEMPLATES[slot];
    const id = `st_${templateId}`;
    instances[id] = createGearInstance(templateId, { id, origin: 'starter', rarity: 'common', substats: [] });
    return id;
  };
  return { instances, weaponId: mk('weapon'), armorId: mk('armor') };
}

// ---------------------------------------------------------------------------------------------------------
// resolving

type GearState = Pick<SaveData, 'gearInstances' | 'equipped'>;

export interface EquippedView {
  item: GearItem;
  instance: GearInstance | null;
}

export function resolveGearInstance(
  save: Pick<SaveData, 'gearInstances'>,
  id: string | null | undefined,
): { instance: GearInstance; item: GearItem } | null {
  if (!id) return null;
  const instance = save.gearInstances?.[id];
  if (!instance) return null;
  const item = getGear(instance.templateId);
  return item ? { instance, item } : null;
}

function slotView(save: GearState, slot: InstancedSlot): EquippedView {
  const hit = resolveGearInstance(save, save.equipped[slot]);
  if (hit && hit.item.slot === slot) return { item: hit.item, instance: hit.instance };
  return { item: getGear(STARTER_TEMPLATES[slot]), instance: null };
}

export function resolveEquipped(save: GearState) {
  const eq = save.equipped;
  const stack = (id: string | null): GearItem | null => (id ? getGear(id) ?? null : null);
  return {
    weapon: slotView(save, 'weapon'),
    armor: slotView(save, 'armor'),
    relic: stack(eq.relic),
    shield: stack(eq.shield),
    helmet: stack(eq.helmet),
    pickaxe: stack(eq.pickaxe),
    axe: stack(eq.axe),
    rod: stack(eq.rod),
  };
}

export const viewRefine = (v: EquippedView): number => clampRefine(v.instance?.upgrade ?? 0);
export const viewDurability = (v: EquippedView): number => (v.instance ? v.instance.durability : MAX_DURABILITY);
export const viewRarity = (v: EquippedView): Rarity => v.instance?.rarity ?? 'common';

export function equippedGemBonuses(save: GearState): GemBonuses {
  const { weapon, armor } = resolveEquipped(save);
  return addGemBonuses(gemListBonuses(weapon.instance?.sockets), gemListBonuses(armor.instance?.sockets));
}

export function equippedSubstatTotals(save: GearState): SubstatTotals {
  const { weapon, armor } = resolveEquipped(save);
  return addSubstatTotals(substatListTotals(weapon.instance?.substats), substatListTotals(armor.instance?.substats));
}

export function isInstanceEquipped(save: Pick<SaveData, 'equipped'>, id: GearInstanceId): boolean {
  return save.equipped.weapon === id || save.equipped.armor === id;
}

// ---------------------------------------------------------------------------------------------------------
// listing / labels / capacity

const rarityRank = (r: Rarity): number => Math.max(0, RARITY_IDS.indexOf(r));
const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Display order: weapons before armors, higher tier first, then more refined / rarer, then oldest, then id.
export function compareForDisplay(a: GearInstance, b: GearInstance): number {
  const ia = getGear(a.templateId);
  const ib = getGear(b.templateId);
  const slotA = INSTANCED_SLOTS.indexOf(ia.slot as InstancedSlot);
  const slotB = INSTANCED_SLOTS.indexOf(ib.slot as InstancedSlot);
  return (
    slotA - slotB ||
    (ib.tier ?? 0) - (ia.tier ?? 0) ||
    cmpStr(a.templateId, b.templateId) ||
    b.upgrade - a.upgrade ||
    rarityRank(b.rarity) - rarityRank(a.rarity) ||
    a.createdAt - b.createdAt ||
    cmpStr(a.id, b.id)
  );
}

export function listGearInstances(save: Pick<SaveData, 'gearInstances'>): GearInstance[] {
  return Object.values(save.gearInstances ?? {}).sort(compareForDisplay);
}

export function instancesOfTemplate(save: Pick<SaveData, 'gearInstances'>, templateId: string): GearInstance[] {
  return listGearInstances(save).filter((i) => i.templateId === templateId);
}

// Instances of a template that a recipe could consume (everything except the equipped piece).
export function countUsableInstances(save: SaveData, templateId: string): number {
  return Object.values(save.gearInstances).filter((i) => i.templateId === templateId && !isInstanceEquipped(save, i.id)).length;
}

export function gearInstanceCount(save: Pick<SaveData, 'gearInstances'>): number {
  return Object.keys(save.gearInstances ?? {}).length;
}

// TECHNICAL default, not a balance decision (tunables.gear.maxInstances). Only ever blocks CREATING a new
// instance; loading / migrating a save never truncates.
export function maxGearInstances(): number {
  return Math.max(1, Math.floor(T.gear.maxInstances));
}

// Highest refine level ever reached: the persisted counter (survives destroying the piece) or anything owned now.
export function questMaxRefine(save: Pick<SaveData, 'gearInstances' | 'quests'>): number {
  let max = Math.max(0, Math.floor(Number(save.quests?.counters?.maxRefineEver ?? 0)) || 0);
  for (const inst of Object.values(save.gearInstances ?? {})) max = Math.max(max, inst.upgrade);
  return max;
}

// ---------------------------------------------------------------------------------------------------------
// migration v1 (per-itemId maps) -> v2 (instances)

export interface LegacyGearInput {
  // Legacy inventory, ALREADY passed through sanitizeLegacyInventory (valid ids, floored, starters present).
  inventory: Record<string, number>;
  equipped: { weapon?: string | null; armor?: string | null };
  itemRarity?: unknown;
  itemSubstats?: unknown;
  upgrades?: unknown;
  durability?: unknown;
  sockets?: unknown;
  reforgeCount?: unknown;
}

export interface GearMigrationResult {
  gearInstances: Record<GearInstanceId, GearInstance>;
  weaponId: GearInstanceId | null;
  armorId: GearInstanceId | null;
  maxRefineEver: number;
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

// Pure and deterministic (no clock, no RNG): the same legacy input always yields the same ids, so a migration
// interrupted before it was persisted simply produces the identical result on the next load.
//
// N copies of one template -> N instances `mg_<templateId>_<1..N>`, each with a copy of the shared metadata.
// SOCKETS are the exception: gems are a paid resource and one legacy socket list was one physical set of gems,
// so only instance _1 (the one that becomes the equipped piece, or the first copy if none was equipped) keeps
// them — copying would mint gems.
export function migrateGearV1toV2(legacy: LegacyGearInput): GearMigrationResult {
  const rarityMap = asRecord(legacy.itemRarity);
  const substatMap = asRecord(legacy.itemSubstats);
  const upgradeMap = asRecord(legacy.upgrades);
  const durabilityMap = asRecord(legacy.durability);
  const socketMap = asRecord(legacy.sockets);
  const reforgeMap = asRecord(legacy.reforgeCount);
  const ceiling = Math.max(1, Math.floor(T.gear.migrationSafetyCeiling));

  const equippedTemplate: Record<InstancedSlot, string> = { weapon: STARTER_TEMPLATES.weapon, armor: STARTER_TEMPLATES.armor };
  for (const slot of INSTANCED_SLOTS) {
    const id = legacy.equipped?.[slot];
    if (typeof id === 'string' && getGear(id)?.slot === slot) equippedTemplate[slot] = id;
  }

  const legacyUpgrade = (id: string): number => {
    const n = Math.floor(Number(upgradeMap[id]));
    return Number.isFinite(n) && n > 0 ? Math.min(MAX_REFINE, n) : 0;
  };

  const instances: Record<GearInstanceId, GearInstance> = {};
  const equippedIds: Record<InstancedSlot, GearInstanceId | null> = { weapon: null, armor: null };

  for (const item of GEAR) {
    if (!isInstancedItem(item)) continue;
    const rawCount = Math.floor(Number(legacy.inventory?.[item.id]));
    let count = Number.isFinite(rawCount) && rawCount > 0 ? Math.min(rawCount, ceiling) : 0;
    const slot = item.slot as InstancedSlot;
    const isEquippedTemplate = equippedTemplate[slot] === item.id;
    const recovery = count === 0 && isEquippedTemplate;
    if (recovery) count = 1;
    if (count === 0) continue;

    const rarity = isRarity(rarityMap[item.id]) ? (rarityMap[item.id] as Rarity) : 'common';
    const substats = sanitizeSubstats(substatMap[item.id]);
    const upgrade = legacyUpgrade(item.id);
    const durability = clampInt(durabilityMap[item.id], 0, MAX_DURABILITY, MAX_DURABILITY);
    const reforgeCount = clampInt(reforgeMap[item.id], 0, Number.MAX_SAFE_INTEGER, 0);
    const sockets = sanitizeSockets(socketMap[item.id]);

    for (let n = 1; n <= count; n++) {
      const id = `mg_${item.id}_${n}`;
      instances[id] = createGearInstance(item.id, {
        id,
        origin: recovery ? 'recovery' : 'migration',
        rarity,
        substats: substats.map((s) => ({ ...s })),
        upgrade,
        sockets: n === 1 ? sockets : [],
        durability,
        reforgeCount,
        createdAt: 0,
      });
    }
    if (isEquippedTemplate) equippedIds[slot] = `mg_${item.id}_1`;
  }

  let maxRefineEver = 0;
  for (const id of Object.keys(upgradeMap)) if (getGear(id)) maxRefineEver = Math.max(maxRefineEver, legacyUpgrade(id));

  return { gearInstances: instances, weaponId: equippedIds.weapon, armorId: equippedIds.armor, maxRefineEver };
}

// ---------------------------------------------------------------------------------------------------------
// reducers

const withoutKey = <V>(rec: Record<string, V>, key: string): Record<string, V> => {
  const rest = { ...rec };
  delete rest[key];
  return rest;
};

function returnGems(gems: Record<GemId, number>, list: GemId[]): Record<GemId, number> {
  const out = { ...gems };
  for (const g of list) out[g] = (out[g] ?? 0) + 1;
  return out;
}

// Removes instances, giving every socketed gem back to the stock (never destroyed silently).
function removeInstances(save: SaveData, ids: GearInstanceId[]): SaveData {
  let instances = save.gearInstances;
  let gems = save.gems;
  for (const id of ids) {
    const inst = instances[id];
    if (!inst) continue;
    gems = returnGems(gems, inst.sockets);
    instances = withoutKey(instances, id);
  }
  return { ...save, gearInstances: instances, gems };
}

// --- equip

export function applyEquipInstance(save: SaveData, id: GearInstanceId): SaveData | null {
  const hit = resolveGearInstance(save, id);
  if (!hit || !isInstancedSlot(hit.item.slot)) return null;
  if (save.equipped[hit.item.slot] === id) return null;
  return { ...save, equipped: { ...save.equipped, [hit.item.slot]: id } };
}

// Weapon / armor slot -> null ("bare hands", the zero-stat starter template).
export function applyUnequipSlot(save: SaveData, slot: InstancedSlot): SaveData {
  return { ...save, equipped: { ...save.equipped, [slot]: null } };
}

// --- recipe ingredients

export const isRelevantInstance = (i: GearInstance): boolean => i.upgrade > 0 || i.sockets.length > 0 || i.rarity !== 'common';

// Cheapest first: lowest refine, then lowest rarity, then fewest sockets, then oldest, then id (stable).
export function compareIngredientValue(a: GearInstance, b: GearInstance): number {
  return (
    a.upgrade - b.upgrade ||
    rarityRank(a.rarity) - rarityRank(b.rarity) ||
    a.sockets.length - b.sockets.length ||
    a.createdAt - b.createdAt ||
    cmpStr(a.id, b.id)
  );
}

// Unequipped instances of the template, cheapest first. null when there are not enough.
export function selectIngredientInstances(
  save: SaveData,
  templateId: string,
  count: number,
  exclude: ReadonlySet<GearInstanceId> = new Set(),
): GearInstance[] | null {
  const pool = Object.values(save.gearInstances)
    .filter((i) => i.templateId === templateId && !isInstanceEquipped(save, i.id) && !exclude.has(i.id))
    .sort(compareIngredientValue);
  return pool.length >= count ? pool.slice(0, count) : null;
}

// The exact instances a craft would consume. `chosen` (a confirmed selection) is validated, never trusted.
export function planForgeIngredients(save: SaveData, item: GearItem, chosen?: GearInstanceId[]): GearInstance[] | null {
  const need = Object.entries(item.recipe?.items ?? {}) as [string, number][];
  const picked: GearInstance[] = [];
  const used = new Set<GearInstanceId>();
  for (const [templateId, count] of need) {
    let part: GearInstance[] | null;
    if (chosen) {
      part = chosen
        .map((id) => save.gearInstances[id])
        .filter((i) => i && i.templateId === templateId && !isInstanceEquipped(save, i.id));
      if (part.length !== count || new Set(part.map((i) => i.id)).size !== count) return null;
    } else {
      part = selectIngredientInstances(save, templateId, count, used);
    }
    if (!part) return null;
    for (const i of part) used.add(i.id);
    picked.push(...part);
  }
  if (chosen && chosen.length !== picked.length) return null;
  return picked;
}

// --- forge

export type ForgeFailure = 'unknown' | 'gold' | 'level' | 'materials' | 'gems' | 'ingredients' | 'shards' | 'capacity';

// Flat on purpose (tsconfig is not strict, so a discriminated union would not narrow): ok=false => reason is set,
// ok=true => save / instance / consumed are set.
export interface ForgeResult {
  ok: boolean;
  reason?: ForgeFailure;
  save?: SaveData;
  instance?: GearInstance | null;
  consumed?: GearInstance[];
}

export function applyForge(
  save: SaveData,
  templateId: string,
  opts: { level: number; consumedIds?: GearInstanceId[]; idFactory?: () => string; now?: number },
): ForgeResult {
  const item = getGear(templateId);
  if (!item || !item.recipe) return { ok: false, reason: 'unknown' };
  const recipe = item.recipe;
  if (save.gold < item.cost) return { ok: false, reason: 'gold' };
  if (opts.level < (recipe.requiredLevel ?? 0)) return { ok: false, reason: 'level' };
  if (!hasMaterials(save.materials, recipe.materials)) return { ok: false, reason: 'materials' };
  if (!hasGems(save.gems, recipe.gems)) return { ok: false, reason: 'gems' };
  const consumed = planForgeIngredients(save, item, opts.consumedIds);
  if (!consumed) return { ok: false, reason: 'ingredients' };
  if ((recipe.shards ?? 0) > 0 && save.shards < (recipe.shards ?? 0)) return { ok: false, reason: 'shards' };
  const instanced = isInstancedItem(item);
  if (instanced && gearInstanceCount(save) - consumed.length + 1 > maxGearInstances()) return { ok: false, reason: 'capacity' };

  const materials = { ...save.materials };
  for (const [mid, count] of Object.entries(recipe.materials ?? {})) {
    materials[mid as MaterialId] = (materials[mid as MaterialId] ?? 0) - (count as number);
  }
  const gems = { ...save.gems };
  for (const [gid, count] of Object.entries(recipe.gems ?? {})) gems[gid as GemId] = (gems[gid as GemId] ?? 0) - (count as number);

  let next: SaveData = {
    ...save,
    gold: save.gold - item.cost,
    materials,
    gems,
    shards: save.shards - (recipe.shards ?? 0),
    quests: { ...save.quests, daily: { ...save.quests.daily, forge: (save.quests.daily.forge ?? 0) + 1 } },
  };
  next = removeInstances(next, consumed.map((i) => i.id));

  let instance: GearInstance | null = null;
  if (instanced) {
    instance = createGearInstance(templateId, {
      id: uniqueId(next.gearInstances, opts.idFactory ?? newGearInstanceId),
      origin: 'craft',
      createdAt: opts.now ?? Date.now(),
    });
    next = { ...next, gearInstances: { ...next.gearInstances, [instance.id]: instance } };
  } else {
    next = { ...next, inventory: { ...next.inventory, [templateId]: (next.inventory[templateId] ?? 0) + 1 } };
  }
  return { ok: true, save: next, instance, consumed };
}

// --- upgrade

export function applyUpgrade(
  save: SaveData,
  id: GearInstanceId,
  useCatalyst: boolean,
  rng: () => number = Math.random,
): { save: SaveData; success: boolean; level: number } | null {
  const hit = resolveGearInstance(save, id);
  if (!hit) return null;
  const lvl = clampRefine(hit.instance.upgrade);
  if (lvl >= MAX_REFINE) return null;
  const cost = upgradeCost(hit.item, lvl);
  if (save.gold < cost.gold) return null;
  if (!hasMaterials(save.materials, cost.materials)) return null;
  if ((cost.shards ?? 0) > 0 && save.shards < (cost.shards ?? 0)) return null;
  if (useCatalyst && (save.consumables.refine_catalyst ?? 0) < 1) return null;

  const materials = { ...save.materials };
  for (const [mid, count] of Object.entries(cost.materials ?? {})) {
    materials[mid as MaterialId] = (materials[mid as MaterialId] ?? 0) - (count as number);
  }
  const success = useCatalyst || rng() < upgradeChance(lvl);
  const counters = { ...save.quests.counters };
  if (success) counters.maxRefineEver = Math.max(Math.floor(Number(counters.maxRefineEver ?? 0)) || 0, lvl + 1);
  return {
    save: {
      ...save,
      gold: save.gold - cost.gold,
      materials,
      shards: save.shards - (cost.shards ?? 0),
      consumables: useCatalyst ? { ...save.consumables, refine_catalyst: (save.consumables.refine_catalyst ?? 0) - 1 } : save.consumables,
      gearInstances: success ? { ...save.gearInstances, [id]: { ...hit.instance, upgrade: lvl + 1 } } : save.gearInstances,
      quests: { ...save.quests, counters, daily: { ...save.quests.daily, forge: (save.quests.daily.forge ?? 0) + 1 } },
    },
    success,
    level: lvl,
  };
}

// --- reforge (current rules: 1 shard + escalating gold, per INSTANCE)

export function applyReforgeInstance(save: SaveData, id: GearInstanceId, goldCostFor: (count: number) => number): SaveData | null {
  const hit = resolveGearInstance(save, id);
  if (!hit) return null;
  const gold = goldCostFor(hit.instance.reforgeCount);
  if (save.shards < 1 || save.gold < gold) return null;
  const substats = rollSubstats(hit.instance.rarity, hit.item.tier ?? 0);
  return {
    ...save,
    shards: save.shards - 1,
    gold: save.gold - gold,
    gearInstances: { ...save.gearInstances, [id]: { ...hit.instance, substats, reforgeCount: hit.instance.reforgeCount + 1 } },
  };
}

// --- repair / durability

export function applyRepair(save: SaveData, id: GearInstanceId, blessed: boolean, goldCost: number): SaveData | null {
  const hit = resolveGearInstance(save, id);
  if (!hit) return null;
  if (save.gold < goldCost) return null;
  if (blessed && save.shards < 1) return null;
  return {
    ...save,
    gold: save.gold - goldCost,
    shards: blessed ? save.shards - 1 : save.shards,
    gearInstances: { ...save.gearInstances, [id]: { ...hit.instance, durability: MAX_DURABILITY } },
    blessed: blessed ? true : save.blessed,
  };
}

// Only the EQUIPPED instances wear down; every other copy is untouched.
export function applyDurabilityLoss(save: SaveData, amount: number): SaveData {
  if (amount <= 0) return save;
  let instances = save.gearInstances;
  for (const slot of INSTANCED_SLOTS) {
    const id = save.equipped[slot];
    const inst = id ? instances[id] : undefined;
    if (inst) instances = { ...instances, [id as string]: { ...inst, durability: Math.max(0, inst.durability - amount) } };
  }
  return instances === save.gearInstances ? save : { ...save, gearInstances: instances };
}

// --- sockets

export function applySocketGem(save: SaveData, id: GearInstanceId, gemId: GemId): SaveData | null {
  const hit = resolveGearInstance(save, id);
  if (!hit || !getGem(gemId)) return null;
  if ((save.gems?.[gemId] ?? 0) <= 0) return null;
  if (hit.instance.sockets.length >= socketsForTier(hit.item.tier ?? 0)) return null;
  return {
    ...save,
    gems: { ...save.gems, [gemId]: (save.gems[gemId] ?? 0) - 1 },
    gearInstances: { ...save.gearInstances, [id]: { ...hit.instance, sockets: [...hit.instance.sockets, gemId] } },
  };
}

export function applyUnsocketGem(save: SaveData, id: GearInstanceId, index: number): SaveData | null {
  const hit = resolveGearInstance(save, id);
  if (!hit) return null;
  const gemId = hit.instance.sockets[index];
  if (!gemId) return null;
  const sockets = hit.instance.sockets.filter((_, i) => i !== index);
  return {
    ...save,
    gems: { ...save.gems, [gemId]: (save.gems[gemId] ?? 0) + 1 },
    gearInstances: { ...save.gearInstances, [id]: { ...hit.instance, sockets } },
  };
}

// --- salvage / discard

export type SalvageBlock = 'equipped' | 'missing' | 'noValue' | null;

// `target` is an instance id (weapon / armor) or a stackable gear template id (relic).
export function salvageBlockReason(save: SaveData, target: string): SalvageBlock {
  const hit = resolveGearInstance(save, target);
  if (hit) {
    if (isInstanceEquipped(save, target)) return 'equipped';
    return hasSalvageValue(hit.item) ? null : 'noValue';
  }
  const item = getGear(target);
  if (!item || isInstancedItem(item) || (save.inventory[target] ?? 0) <= 0) return 'missing';
  if (Object.values(save.equipped).includes(target)) return 'equipped';
  return hasSalvageValue(item) ? null : 'noValue';
}

export function applySalvage(
  save: SaveData,
  target: string,
  rng: () => number = Math.random,
): { save: SaveData; bonusGranted: boolean } | null {
  if (salvageBlockReason(save, target) !== null) return null;
  const hit = resolveGearInstance(save, target);
  const item = hit ? hit.item : getGear(target);
  const rarity: Rarity = hit ? hit.instance.rarity : 'common';

  let next: SaveData = save;
  if (hit) next = removeInstances(next, [target]);
  else {
    const inv = { ...next.inventory, [target]: (next.inventory[target] ?? 0) - 1 };
    if (inv[target] <= 0) delete inv[target];
    next = { ...next, inventory: inv };
  }

  const materials = { ...next.materials };
  for (const [mid, qty] of Object.entries(getSalvageReturn(item).materials)) {
    materials[mid as MaterialId] = (materials[mid as MaterialId] ?? 0) + (qty as number);
  }
  let gems = next.gems;
  let bonusGranted = false;
  const bonusChance = SALVAGE_BONUS_CHANCE[rarity] ?? 0;
  if (bonusChance > 0 && rng() < bonusChance) {
    bonusGranted = true;
    if (rng() < 0.5) {
      materials.essence = (materials.essence ?? 0) + 1;
    } else {
      const gid = GEMS[Math.floor(rng() * GEMS.length)].id;
      gems = { ...next.gems, [gid]: (next.gems[gid] ?? 0) + 1 };
    }
  }
  return { save: { ...next, materials, gems }, bonusGranted };
}

export function applyDiscardInstance(save: SaveData, id: GearInstanceId): SaveData | null {
  if (!save.gearInstances[id] || isInstanceEquipped(save, id)) return null;
  return removeInstances(save, [id]);
}
