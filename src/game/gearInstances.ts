import T from './tunables';
import { GEAR, GearItem, INSTANCED_SLOTS, gearRequiredLevel, InstancedSlot, durabilityFactor, effectiveCrit, effectiveDamage, effectiveMaxHp, effectiveResistance, isInstancedSlot, MAX_DURABILITY, MAX_REFINE, BASE_MAX_REFINE, getGear, maxRefineFor, upgradeChance, upgradeCost, upgradeFailDrop } from './gear';
import { GEMS, GemBonuses, GemId, addGemBonuses, gemListBonuses, getGem, hasGems, socketsForTier } from './gems';
import { MaterialId, hasMaterials } from './materials';
import { GOLD_BONUS_CAP, RARITIES, Rarity, Substat, SubstatTotals, addSubstatTotals, rarityStatMult, rollRarity, rollRarityAtLeast, FORGE_SEAL_MIN_RARITY, rollSubstats, substatListTotals } from './rarity';
import { SALVAGE_BONUS_CHANCE, getSalvageReturn, hasSalvageValue } from './salvage';
import { addWithOverflow, fitsBag, stockIsEmpty } from './inventory';
import { TRADEABLE_CONSUMABLES } from './consumables';
import { setBonuses } from './setBonuses';
import type { SaveData } from './engine';
import { recordForge, recordRefine } from './stats';
import { isServerItemAuthority } from './itemAuthority';
import { playerLevel } from './heroLevel';

// Gear instances: every weapon / armor / helmet / gloves / boots / ring / shield is its OWN object (rarity, substats, refine level, sockets, durability,
// reforge count). Materials, consumables, gems, relics and tools stay stackable counters keyed by id.
//
// Every mutation below is a pure reducer `(save, ...) -> save | null` (null = rejected, nothing charged, no RNG
// consumed). Callers pass the RNG in (defaults to Math.random) so a server can later replace the reducer body
// without touching the UI. Instance ids are opaque strings: never derive meaning from them.

export type GearInstanceId = string;

export const GEAR_SCHEMA_VERSION = 2;

export { INSTANCED_SLOTS, isInstancedSlot };
export type { InstancedSlot };

// What an empty weapon / armor slot resolves to ("bare hands"): the zero-stat starter templates. Helmet, gloves, boots, ring and shield have no starter:
// an empty one is simply empty and adds nothing.
export const STARTER_TEMPLATES: Partial<Record<InstancedSlot, string>> = { weapon: 'wooden_club', armor: 'ragged_clothes' };

// The slots that exist for a v1 save (before the extra slots): the only ones a legacy migration can fill.
const LEGACY_SLOTS = ['weapon', 'armor'] as const;

export type GearOrigin = 'craft' | 'starter' | 'migration' | 'recovery' | 'admin' | 'drop';

export interface GearInstance {
  id: GearInstanceId;
  templateId: string;
  rarity: Rarity;
  substats: Substat[];
  upgrade: number;
  sockets: GemId[];
  durability: number;
  reforgeCount: number;
  // Lapidations done on this piece (lapidar.ts); absent = none. Each one makes the next dearer.
  lapidarCount?: number;
  createdAt: number;
  origin: GearOrigin;
  // Bind on equip: set for good the first time the piece is worn (applyEquipInstance); unequipping never clears it. Forging, salvaging, refining, reforging and
  // repairing neither set nor need it. A bound piece can never be listed on the player market (isTradeable). Absent = not bound.
  bound?: boolean;
  // The server certificate of this piece (supabase/functions/mint-item, docs/MARKET_FOUNDATION.md). Present ONLY when the server rolled the piece (forge, unique drop) and issued one; the
  // game shows "Certificado" only when this id matches a certificate the server lists for the account (itemCerts.ts). A piece that has none is usable but never tradeable.
  certificateId?: string;
  // Set on a piece the DEVICE rolled itself (the offline / desktop build, itemAuthority.ts): it has no certificate and never will. Absent on old saves (same effect: no certificate id).
  certified?: false;
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
  bound?: boolean;
  certificateId?: string;
  certified?: false;
}

export function createGearInstance(templateId: string, opts: CreateGearInstanceOpts): GearInstance {
  const item = getGear(templateId);
  if (!item || !isInstancedItem(item)) throw new Error(`Not an instanced gear template: ${templateId}`);
  const rarity = opts.rarity ?? rollRarity();
  return {
    id: opts.id ?? newGearInstanceId(),
    templateId,
    rarity,
    substats: opts.substats ?? rollSubstats(rarity, item.tier ?? 0, item.unique ? 1 : 0),
    upgrade: clampInt(opts.upgrade ?? 0, 0, maxRefineFor(item), 0),
    sockets: sanitizeSockets(opts.sockets ?? []),
    durability: clampInt(opts.durability ?? MAX_DURABILITY, 0, MAX_DURABILITY, MAX_DURABILITY),
    reforgeCount: clampInt(opts.reforgeCount ?? 0, 0, Number.MAX_SAFE_INTEGER, 0),
    createdAt: Number.isFinite(opts.createdAt) ? (opts.createdAt as number) : 0,
    origin: opts.origin,
    ...(opts.bound ? { bound: true } : {}),
    ...(isCertificateId(opts.certificateId) ? { certificateId: opts.certificateId } : {}),
    ...(opts.certified === false && !isCertificateId(opts.certificateId) ? { certified: false as const } : {}),
  };
}

// A certificate id is the uuid the database gave it. Anything else in a save is not one.
const CERT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isCertificateId = (v: unknown): v is string => typeof v === 'string' && CERT_ID_RE.test(v);

const ORIGINS: GearOrigin[] = ['craft', 'starter', 'migration', 'recovery', 'admin', 'drop'];

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
    upgrade: clampInt(r.upgrade, 0, maxRefineFor(item), 0),
    sockets: sanitizeSockets(r.sockets),
    durability: clampInt(r.durability, 0, MAX_DURABILITY, MAX_DURABILITY),
    reforgeCount: clampInt(r.reforgeCount, 0, Number.MAX_SAFE_INTEGER, 0),
    ...(clampInt(r.lapidarCount, 0, 1e6, 0) > 0 ? { lapidarCount: clampInt(r.lapidarCount, 0, 1e6, 0) } : {}),
    createdAt: Number.isFinite(Number(r.createdAt)) ? Number(r.createdAt) : 0,
    origin: ORIGINS.includes(r.origin as GearOrigin) ? (r.origin as GearOrigin) : 'migration',
    ...(r.bound === true ? { bound: true } : {}),
    ...(isCertificateId(r.certificateId) ? { certificateId: r.certificateId } : r.certified === false ? { certified: false as const } : {}),
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

// Old saves (and any save): every instance that is currently worn counts as bound; what sits in the bag stays as it was.
export function bindEquipped(
  instances: Record<GearInstanceId, GearInstance>,
  equippedIds: (GearInstanceId | null | undefined)[],
): Record<GearInstanceId, GearInstance> {
  let out = instances;
  for (const id of equippedIds) {
    const inst = id ? out[id] : undefined;
    if (inst && !inst.bound) out = { ...out, [id as string]: { ...inst, bound: true } };
  }
  return out;
}

// ONE rule decides what can be sold on the player market (the player market will call this and nothing else), in two parts.
//   KIND (isTradeableKind): a gear instance is tradeable when it is NOT bound AND (it is Epic or Legendary OR its template is a unique drop). Everything else is not tradeable: common and
//   rare forged gear, bound pieces, and everything that is not a gear instance (stackable relics, materials, consumables). Standing decision of the owner: only forged gear of high rarity and
//   rare / unique drops are sellable, common materials never. Round 18: ONE exception that is not a gear instance, the Gold Pouch (TRADEABLE_CONSUMABLES), a consumable that is unbound by
//   nature (it cannot be worn, so nothing ever binds it). It is asked as { kind: 'consumable', id }; a material asked the same way, and every other consumable, is never tradeable.
//   CERTIFICATE (isTradeable): the kind rule AND the piece carries the id of a certificate the server issued for it (certificateId). The server rolled it and checked it was plausible; a piece the
//   save made up, one an older build rolled on the device, or one made offline has none and can NEVER be sold. The game ALSO checks the id against the server's own list before it says
//   "Certificado" (itemCerts.ts), and the market checks the certificate itself: this function is the cheap local half.
export interface TradeRef {
  kind: 'material' | 'consumable';
  id: string;
  // A Gold Pouch is tradeable only as a certified one: the certificate of THAT pouch.
  certificateId?: string;
}
export function isTradeableKind(item: GearInstance | TradeRef): boolean {
  if (!('templateId' in item)) return item.kind === 'consumable' && (TRADEABLE_CONSUMABLES as readonly string[]).includes(item.id);
  const instance = item;
  if (instance.bound) return false;
  return instance.rarity === 'epic' || instance.rarity === 'legendary' || !!getGear(instance.templateId)?.unique;
}
export function isTradeable(item: GearInstance | TradeRef): boolean {
  if (!isTradeableKind(item)) return false;
  return isCertificateId(item.certificateId) && !('certified' in item && item.certified === false);
}

// An equipped instance pointer is only valid if that instance exists and belongs to that slot.
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
    const templateId = STARTER_TEMPLATES[slot] as string;
    const id = `st_${templateId}`;
    // the starters are worn from the first second, so they load as bound like every worn piece
    instances[id] = { ...createGearInstance(templateId, { id, origin: 'starter', rarity: 'common', substats: [] }), bound: true };
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

function slotView(save: GearState, slot: 'weapon' | 'armor'): EquippedView {
  const hit = resolveGearInstance(save, save.equipped[slot]);
  if (hit && hit.item.slot === slot) return { item: hit.item, instance: hit.instance };
  return { item: getGear(STARTER_TEMPLATES[slot] as string), instance: null };
}

// An extra slot (helmet / gloves / boots / ring / shield): the equipped piece, or null when the slot is empty.
function extraView(save: GearState, slot: InstancedSlot): EquippedView | null {
  const hit = resolveGearInstance(save, save.equipped[slot]);
  return hit && hit.item.slot === slot ? { item: hit.item, instance: hit.instance } : null;
}

export const EXTRA_SLOTS = ['helmet', 'gloves', 'boots', 'ring', 'shield'] as const;
export type ExtraSlot = (typeof EXTRA_SLOTS)[number];

export function resolveEquipped(save: GearState) {
  const eq = save.equipped;
  const stack = (id: string | null): GearItem | null => (id ? getGear(id) ?? null : null);
  return {
    weapon: slotView(save, 'weapon'),
    armor: slotView(save, 'armor'),
    helmet: extraView(save, 'helmet'),
    gloves: extraView(save, 'gloves'),
    boots: extraView(save, 'boots'),
    ring: extraView(save, 'ring'),
    shield: extraView(save, 'shield'),
    relic: stack(eq.relic),
  };
}

export const viewRefine = (v: EquippedView): number => clampRefine(v.instance?.upgrade ?? 0);
export const viewDurability = (v: EquippedView): number => (v.instance ? v.instance.durability : MAX_DURABILITY);
export const viewRarity = (v: EquippedView): Rarity => v.instance?.rarity ?? 'common';

// Every EQUIPPED instance of every instanced slot (weapon, armor and the extra slots).
function equippedInstances(save: GearState): GearInstance[] {
  const out: GearInstance[] = [];
  for (const slot of INSTANCED_SLOTS) {
    const hit = resolveGearInstance(save, save.equipped[slot]);
    if (hit && hit.item.slot === slot) out.push(hit.instance);
  }
  return out;
}

// The worn templates of the seven instanced slots (the relic is a stackable template, not one of them): the input of setBonuses (setBonuses.ts).
export function equippedSetItems(save: GearState): GearItem[] {
  const out: GearItem[] = [];
  for (const slot of INSTANCED_SLOTS) {
    const hit = resolveGearInstance(save, save.equipped[slot]);
    if (hit && hit.item.slot === slot) out.push(hit.item);
  }
  return out;
}

export function equippedGemBonuses(save: GearState): GemBonuses {
  return equippedInstances(save).reduce((acc, inst) => addGemBonuses(acc, gemListBonuses(inst.sockets)), gemListBonuses([]));
}

// What the extra slots (helmet, gloves, boots, ring, shield) add to the hero, with the same refine / durability / rarity factors as weapon and armor.
// Only fields the slot's item defines count (a helmet without a crit chance gets no refine crit bonus). The one place these pieces are
// summed: engine.ts buildCombatStats / playerMaxHp read it, so the Dungeon, Hunting and CP all agree.
export interface ExtraSlotStats {
  maxHp: number;
  damage: number;
  critChance: number;
  critMult: number;
  resistance: number;
  reflect: number; // shield: adds to the armor's reflect, scaled by durability only (like the armor's)
}

export function equippedExtraStats(save: GearState): ExtraSlotStats {
  const t: ExtraSlotStats = { maxHp: 0, damage: 0, critChance: 0, critMult: 0, resistance: 0, reflect: 0 };
  const views = resolveEquipped(save);
  for (const slot of EXTRA_SLOTS) {
    const v = views[slot];
    if (!v?.instance) continue;
    const { item, instance } = v;
    const lvl = viewRefine(v);
    const f = durabilityFactor(instance.durability);
    const r = rarityStatMult(instance.rarity);
    if (item.maxHp) t.maxHp += effectiveMaxHp(item, lvl) * f * r;
    if (item.damage) t.damage += effectiveDamage(item, lvl) * f * r;
    if (item.critChance) t.critChance += effectiveCrit(item, lvl) * f;
    if (item.resistance) t.resistance += effectiveResistance(item, lvl) * f * r;
    t.critMult += (item.critMultBonus ?? 0) * f * r;
    t.reflect += (item.reflect ?? 0) * f;
  }
  return t;
}

export function equippedSubstatTotals(save: GearState, includeSet = true): SubstatTotals {
  const total = equippedInstances(save).reduce((acc, inst) => addSubstatTotals(acc, substatListTotals(inst.substats)), substatListTotals([]));
  // The Goblin Lucky Coin (a relic) and the gold bonus of a set go into the same sum, so they count inside the same cap.
  const relicGold = save.equipped.relic ? getGear(save.equipped.relic)?.goldBonusPct ?? 0 : 0;
  const setGold = includeSet ? setBonuses(equippedSetItems(save)).totals.goldBonusPct : 0;
  return { ...total, goldBonus: Math.min(GOLD_BONUS_CAP, total.goldBonus + relicGold + setGold) };
}

export function isInstanceEquipped(save: Pick<SaveData, 'equipped'>, id: GearInstanceId): boolean {
  return INSTANCED_SLOTS.some((slot) => save.equipped[slot] === id);
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

// TECHNICAL safety ceiling only (tunables.gear.maxInstances) — NOT the player-facing inventory capacity
// (that's the shared "Mochila" pool, inventory.ts). Never surfaced in UI as a limit; only ever blocks
// CREATING a new instance as a last-resort guard against unbounded growth. Loading / migrating a save
// never truncates against it.
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

  const equippedTemplate: Record<'weapon' | 'armor', string> = { weapon: STARTER_TEMPLATES.weapon as string, armor: STARTER_TEMPLATES.armor as string };
  for (const slot of LEGACY_SLOTS) {
    const id = legacy.equipped?.[slot];
    if (typeof id === 'string' && getGear(id)?.slot === slot) equippedTemplate[slot] = id;
  }

  const legacyUpgrade = (id: string): number => {
    const n = Math.floor(Number(upgradeMap[id]));
    return Number.isFinite(n) && n > 0 ? Math.min(MAX_REFINE, n) : 0;
  };

  const instances: Record<GearInstanceId, GearInstance> = {};
  const equippedIds: Record<'weapon' | 'armor', GearInstanceId | null> = { weapon: null, armor: null };

  for (const item of GEAR) {
    if (!isInstancedItem(item)) continue;
    const rawCount = Math.floor(Number(legacy.inventory?.[item.id]));
    let count = Number.isFinite(rawCount) && rawCount > 0 ? Math.min(rawCount, ceiling) : 0;
    const slot = item.slot as 'weapon' | 'armor';
    if (!(slot in equippedTemplate)) continue; // a v1 save has no helmet / gloves / boots / ring
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

// Wearing a piece needs the hero level its recipe needs (gear.ts gearRequiredLevel: a unique takes its twin's, tier 1 and the relics need none). Buying or finding a piece above the level is fine
// (it waits in the bag); only putting it on is refused. The same number is what the server judges with (bind-item, the anti-cheat's GEAR_BELOW_GATE).
export interface EquipLevelBlock {
  reason: 'level';
  requiredLevel: number;
  heroLevel: number;
}

/** The level rule for wearing a template (an instanced piece's templateId, or a relic id): null = allowed, otherwise what it needs and what the hero has. */
export function equipLevelBlock(save: Pick<SaveData, 'xp'>, templateId: string): EquipLevelBlock | null {
  const requiredLevel = gearRequiredLevel(templateId);
  if (requiredLevel <= 0) return null;
  const heroLevel = playerLevel(save.xp);
  return heroLevel >= requiredLevel ? null : { reason: 'level', requiredLevel, heroLevel };
}

/** Why this instance cannot be worn right now (null = the level allows it). */
export function equipBlock(save: SaveData, id: GearInstanceId): EquipLevelBlock | null {
  const hit = resolveGearInstance(save, id);
  return hit ? equipLevelBlock(save, hit.item.id) : null;
}

/**
 * OLD SAVES: pieces already worn above the hero's level (worn before the rule existed, or put on by a hand-edited save). They are NOT stripped (nobody loses gear silently): they stay on, the
 * character sheet and the bag flag them, and the anti-cheat (GEAR_BELOW_GATE, which looks at WORN pieces) judges the snapshot until they are swapped for a piece the hero can wear.
 */
export function wornAboveLevel(save: SaveData): { slot: InstancedSlot; id: GearInstanceId; templateId: string; requiredLevel: number }[] {
  const out: { slot: InstancedSlot; id: GearInstanceId; templateId: string; requiredLevel: number }[] = [];
  for (const slot of INSTANCED_SLOTS) {
    const hit = resolveGearInstance(save, save.equipped[slot]);
    if (!hit) continue;
    const block = equipLevelBlock(save, hit.item.id);
    if (block) out.push({ slot, id: hit.instance.id, templateId: hit.item.id, requiredLevel: block.requiredLevel });
  }
  return out;
}

// `skipLevelGate` exists for the balance simulation's probes (what would this piece add to the CP?), never for a player action.
export function applyEquipInstance(save: SaveData, id: GearInstanceId, opts: { skipLevelGate?: boolean } = {}): SaveData | null {
  const hit = resolveGearInstance(save, id);
  if (!hit || !isInstancedSlot(hit.item.slot)) return null;
  if (save.equipped[hit.item.slot] === id) return null;
  if (!opts.skipLevelGate && equipLevelBlock(save, hit.item.id)) return null;
  // Wearing a piece binds it for good (the UI asks first when the piece is tradeable, see needsBindConfirm).
  const gearInstances = hit.instance.bound ? save.gearInstances : { ...save.gearInstances, [id]: { ...hit.instance, bound: true } };
  return { ...save, gearInstances, equipped: { ...save.equipped, [hit.item.slot]: id } };
}

// True when equipping this instance would bind a piece that could otherwise be sold: the one case the UI must confirm.
export function needsBindConfirm(save: SaveData, id: GearInstanceId): boolean {
  const inst = save.gearInstances[id];
  return !!inst && isTradeable(inst);
}

// Slot -> null (weapon / armor: "bare hands", the zero-stat starter template; the extra slots: simply empty).
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
  sealUsed?: boolean; // a Blacksmith's Seal was spent on this forge
}

// What the SERVER rolled for a forge (supabase/functions/mint-item): the rarity, the substats, whether the Blacksmith's Seal made it (born bound) and, for an Epic / Legendary, the id of its
// certificate. Applied as it came; the client adds nothing to it and cannot change it.
export interface ForgeRoll {
  rarity: Rarity;
  substats: Substat[];
  bound?: boolean;
  certificateId?: string;
}

export function applyForge(
  save: SaveData,
  templateId: string,
  // `roll`: the server's roll (itemAuthority.ts). In the web build a forge WITHOUT a roll rolls nothing: it is a preview (can I afford it, does it fit the bag) and, if it were ever applied, it
  // yields a plain Common with no substats, never a piece worth selling. Offline there is no server: the device rolls, and an Epic / Legendary it makes is marked `certified: false`.
  opts: { level: number; consumedIds?: GearInstanceId[]; idFactory?: () => string; now?: number; seal?: boolean; rng?: () => number; roll?: ForgeRoll },
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
  // Technical safety ceiling first (never player-facing); the real, player-facing check (the shared inventory) runs on the result below.
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
  // Blacksmith's Seal: only a gear piece (never a relic), only when one is held, and only now that every check above passed - a refused forge keeps the seal.
  const sealUsed = !!opts.seal && instanced && (save.consumables.forge_seal ?? 0) > 0;
  if (sealUsed) next = { ...next, consumables: { ...next.consumables, forge_seal: (next.consumables.forge_seal ?? 0) - 1 } };
  if (instanced) {
    const given = opts.roll;
    const online = isServerItemAuthority();
    const fresh: { rarity?: Rarity; substats?: Substat[] } = given
      ? { rarity: given.rarity, substats: given.substats }
      : online
        ? { rarity: 'common', substats: [] }
        : sealUsed
          ? { rarity: rollRarityAtLeast(FORGE_SEAL_MIN_RARITY, opts.rng) }
          : {};
    instance = createGearInstance(templateId, {
      id: uniqueId(next.gearInstances, opts.idFactory ?? newGearInstanceId),
      origin: 'craft',
      createdAt: opts.now ?? Date.now(),
      ...fresh,
      ...(given?.certificateId ? { certificateId: given.certificateId } : {}),
    });
    // A piece made with the Blacksmith's Seal is born BOUND: the Seal is a season reward, so its better roll must not become a tradeable good (isTradeable).
    if (sealUsed || given?.bound) instance = { ...instance, bound: true };
    // Rolled on this device (no server): the piece is usable but can never be sold.
    if (!online && !given && (instance.rarity === 'epic' || instance.rarity === 'legendary')) instance = { ...instance, certified: false };
    next = { ...next, gearInstances: { ...next.gearInstances, [instance.id]: instance } };
  } else {
    next = { ...next, inventory: { ...next.inventory, [templateId]: (next.inventory[templateId] ?? 0) + 1 } };
  }
  // The craft nets +1 piece minus the ingredients it eats (instances, and the stacks the materials come out of): it must not take more slots than the
  // inventory has (a bag that is already over the limit may still craft, as long as the bag does not grow).
  if (!fitsBag(save, next)) return { ok: false, reason: 'capacity' };
  return { ok: true, save: recordForge(next, instance ? instance.rarity : null), instance, consumed, sealUsed };
}

// --- upgrade

export function applyUpgrade(
  save: SaveData,
  id: GearInstanceId,
  useCatalyst: boolean,
  rng: () => number = Math.random,
): { save: SaveData; success: boolean; level: number; dropped?: boolean } | null {
  const hit = resolveGearInstance(save, id);
  if (!hit) return null;
  const lvl = clampRefine(hit.instance.upgrade);
  if (lvl >= maxRefineFor(hit.item)) return null;
  // The Catalyst guarantees the climb up to +8; the chase past it (round 16) has to be won.
  if (useCatalyst && lvl >= BASE_MAX_REFINE) return null;
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
  // Past +8 a failed attempt may also take the piece one level down (never below +8, never destroyed); the second draw happens only then.
  const dropChance = success ? 0 : upgradeFailDrop(lvl);
  const dropped = dropChance > 0 && rng() < dropChance;
  const nextLevel = success ? lvl + 1 : dropped ? lvl - 1 : lvl;
  const counters = { ...save.quests.counters };
  if (success) counters.maxRefineEver = Math.max(Math.floor(Number(counters.maxRefineEver ?? 0)) || 0, lvl + 1);
  return {
    save: recordRefine({
      ...save,
      gold: save.gold - cost.gold,
      materials,
      shards: save.shards - (cost.shards ?? 0),
      consumables: useCatalyst ? { ...save.consumables, refine_catalyst: (save.consumables.refine_catalyst ?? 0) - 1 } : save.consumables,
      gearInstances: nextLevel !== lvl ? { ...save.gearInstances, [id]: { ...hit.instance, upgrade: nextLevel } } : save.gearInstances,
      quests: { ...save.quests, counters, daily: { ...save.quests.daily, forge: (save.quests.daily.forge ?? 0) + 1 } },
    }, success),
    success,
    level: lvl,
    ...(dropped ? { dropped } : {}),
  };
}

// (Reforge lives in reforge.ts, per instance.)

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

export type SalvageBlock = 'equipped' | 'missing' | 'noValue' | 'bag' | null;

// `target` is an instance id (any instanced slot) or a stackable gear template id (relic).
export function salvageBlockReason(save: SaveData, target: string): SalvageBlock {
  const hit = resolveGearInstance(save, target);
  if (hit) {
    if (isInstanceEquipped(save, target)) return 'equipped';
    if (!hasSalvageValue(hit.item)) return 'noValue';
    return salvageFits(save, target) ? null : 'bag';
  }
  const item = getGear(target);
  if (!item || isInstancedItem(item) || (save.inventory[target] ?? 0) <= 0) return 'missing';
  if (Object.values(save.equipped).includes(target)) return 'equipped';
  if (!hasSalvageValue(item)) return 'noValue';
  return salvageFits(save, target) ? null : 'bag';
}

// The refund is a deliberate action's result: it must fit the inventory once the salvaged piece is gone (worst case: the chance of the bonus Essence is
// counted as if it had rolled). Otherwise the salvage is blocked and nothing happens.
function salvageFits(save: SaveData, target: string): boolean {
  const hit = resolveGearInstance(save, target);
  const item = hit ? hit.item : getGear(target);
  if (!item) return false;
  const rarity: Rarity = hit ? hit.instance.rarity : 'common';
  const refund: Partial<Record<MaterialId, number>> = { ...getSalvageReturn(item).materials };
  if ((SALVAGE_BONUS_CHANCE[rarity] ?? 0) > 0) refund.essence = (refund.essence ?? 0) + 1;
  const placed = addWithOverflow(withoutPiece(save, target, !!hit), { materials: refund });
  return stockIsEmpty(placed.leftover);
}

function withoutPiece(save: SaveData, target: string, instance: boolean): SaveData {
  if (instance) return removeInstances(save, [target]);
  const inv = { ...save.inventory, [target]: (save.inventory[target] ?? 0) - 1 };
  if (inv[target] <= 0) delete inv[target];
  return { ...save, inventory: inv };
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

  // salvageBlockReason already checked that the refund (bonus included) fits the inventory once the piece is gone.
  let next: SaveData = withoutPiece(save, target, !!hit);
  next = addWithOverflow(next, { materials: getSalvageReturn(item).materials }).save;
  let gems = next.gems;
  let bonusGranted = false;
  const bonusChance = SALVAGE_BONUS_CHANCE[rarity] ?? 0;
  if (bonusChance > 0 && rng() < bonusChance) {
    bonusGranted = true;
    if (rng() < 0.5) {
      next = addWithOverflow(next, { materials: { essence: 1 } }).save;
    } else {
      const gid = GEMS[Math.floor(rng() * GEMS.length)].id;
      gems = { ...next.gems, [gid]: (next.gems[gid] ?? 0) + 1 };
    }
  }
  return { save: { ...next, gems }, bonusGranted };
}

export function applyDiscardInstance(save: SaveData, id: GearInstanceId): SaveData | null {
  if (!save.gearInstances[id] || isInstanceEquipped(save, id)) return null;
  return removeInstances(save, [id]);
}
