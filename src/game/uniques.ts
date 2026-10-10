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

// Biome-boss floor -> the unique that boss can drop (gear.ts UNIQUE_DEFS `source.bossFloor`).
export const UNIQUE_BOSS_DROPS: Record<number, string> = {
  25: 'goblin_king_crown',
  50: 'warchief_gauntlets',
  75: 'lich_soul_ring',
  100: 'overlord_greataxe',
};

// One drop of a unique: rarity from the normal table, substats for that rarity and tier plus the guaranteed extra slot.
export function rollUniqueDrop(templateId: string, rng: Rng = Math.random): UniqueDrop {
  const item = getGear(templateId);
  const rarity = rollRarity(rng);
  return { templateId, rarity, substats: rollSubstats(rarity, item?.tier ?? 0, 1, rng) };
}

// The unique(s) a cleared Dungeon stage can drop: only the biome-boss floors, T.battle.uniqueBossChance each time.
export function rollBossUniques(stage: number, rng: Rng = Math.random): UniqueDrop[] {
  const id = UNIQUE_BOSS_DROPS[stage];
  return id && rng() < T.battle.uniqueBossChance ? [rollUniqueDrop(id, rng)] : [];
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
