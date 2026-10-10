import type { SaveData } from './engine';
import { getGear } from './gear';
import { createGearInstance } from './gearInstances';
import { RARITIES, Rarity, Rng, SUBSTATS, Substat, rollRarity, rollSubstats } from './rarity';
import T from './tunables';

// Unique pieces (gear.ts `unique: true`) are drop-only: a Hunting zone rolls them per victory (huntingZones.ts `uniques`, huntCombat.ts) and a Dungeon
// biome boss rolls one on each victory over it (rollBossUniques below, called by waves.ts waveRewards). A drop is decided WHEN it happens: the rarity (the
// normal 60 / 25 / 12 / 3 table) and the substats (one extra slot) are rolled right there and stored with the drop, so a Hunting preview is stable and
// the reward that is claimed later is exactly what was shown. The piece itself only becomes a GearInstance when it is delivered (gearInstances.ts /
// huntLifecycle.applyHuntClaim / App.finishRun).

export interface UniqueDrop {
  templateId: string;
  rarity: Rarity;
  substats: Substat[];
}

// Biome-boss floor -> the unique pieces that boss can drop (gear.ts UNIQUE_DEFS `source.bossFloor`). Each is rolled on its own, T.battle.uniqueBossChance per victory.
export const UNIQUE_BOSS_DROPS: Record<number, string[]> = {
  25: ['goblin_king_crown'],
  50: ['warchief_gauntlets', 'warden_bulwark'],
  75: ['lich_soul_ring'],
  100: ['overlord_greataxe'],
};

// Biome-boss floor -> the stackable relic that boss can drop (gear.ts boss relics, `source.bossFloor`).
export const BOSS_RELIC_DROPS: Record<number, string> = {
  25: 'goblin_lucky_coin',
  50: 'warchief_totem',
  75: 'lich_phylactery',
  100: 'overlord_sigil',
};

// One drop of a unique: rarity from the normal table, substats for that rarity and tier plus the guaranteed extra slot.
export function rollUniqueDrop(templateId: string, rng: Rng = Math.random): UniqueDrop {
  const item = getGear(templateId);
  const rarity = rollRarity(rng);
  return { templateId, rarity, substats: rollSubstats(rarity, item?.tier ?? 0, 1, rng) };
}

// The unique(s) a cleared Dungeon stage can drop: only the biome-boss floors, T.battle.uniqueBossChance each time for each unique of that boss.
export function rollBossUniques(stage: number, rng: Rng = Math.random): UniqueDrop[] {
  const out: UniqueDrop[] = [];
  for (const id of UNIQUE_BOSS_DROPS[stage] ?? []) if (rng() < T.battle.uniqueBossChance) out.push(rollUniqueDrop(id, rng));
  return out;
}

// The relic(s) (template ids) a cleared Dungeon stage can drop: only the biome-boss floors, T.battle.relicBossChance each time, independent of the uniques.
// Relics are stackable: a second copy simply adds to the stack (inventory.ts addForced), and a defeat keeps them like the boss gem.
export function rollBossRelics(stage: number, rng: Rng = Math.random): string[] {
  const id = BOSS_RELIC_DROPS[stage];
  return id && rng() < T.battle.relicBossChance ? [id] : [];
}

// Boss relics from a saved / tampered list (never trusted): only known boss relic ids survive.
export function sanitizeRelicDrops(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(Object.values(BOSS_RELIC_DROPS));
  return (raw as unknown[]).filter((id): id is string => typeof id === 'string' && known.has(id)).slice(0, 50);
}

// Delivers boss relics into the stackable gear stock (the Dungeon never refuses its loot, see App.finishRun).
export function addRelics(save: SaveData, relics: string[]): SaveData {
  if (relics.length === 0) return save;
  const inventory = { ...save.inventory };
  for (const id of relics) inventory[id] = (inventory[id] ?? 0) + 1;
  return { ...save, inventory };
}

// A delivered unique drop as a stored (unequipped) gear instance. The id is derived from `seed` and the first free counter, so it is stable for a given
// reward and can never collide with another instance. The caller decides about bag room (a Hunting claim checks it, a Dungeon boss drop does not).
export function addUniqueInstance(save: SaveData, drop: UniqueDrop, seed: string, createdAt = 0): SaveData {
  let n = 0;
  while (`gd_${seed}:${n}` in save.gearInstances) n++;
  const id = `gd_${seed}:${n}`;
  const instance = createGearInstance(drop.templateId, { id, origin: 'drop', rarity: drop.rarity, substats: drop.substats, createdAt });
  return { ...save, gearInstances: { ...save.gearInstances, [id]: instance } };
}

const SUBSTAT_TYPES = SUBSTATS.map((s) => s.type as string);
const RARITY_IDS = RARITIES.map((r) => r.id as string);

// Drops from a saved / tampered pending reward: unknown or non-unique templates dropped, rarity defaulted, substats cleaned (max 4 = a legendary unique).
export function sanitizeUniqueDrops(raw: unknown): UniqueDrop[] {
  if (!Array.isArray(raw)) return [];
  const out: UniqueDrop[] = [];
  for (const d of raw as Partial<UniqueDrop>[]) {
    if (!d || typeof d.templateId !== 'string' || !getGear(d.templateId)?.unique) continue;
    const substats = Array.isArray(d.substats)
      ? d.substats
          .filter((s) => s && SUBSTAT_TYPES.includes(s.type) && typeof s.value === 'number' && Number.isFinite(s.value))
          .slice(0, 4)
          .map((s) => ({ type: s.type, value: s.value }))
      : [];
    out.push({ templateId: d.templateId, rarity: RARITY_IDS.includes(d.rarity as string) ? (d.rarity as Rarity) : 'common', substats });
  }
  return out.slice(0, 50);
}
