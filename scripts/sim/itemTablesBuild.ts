// The game numbers the item server needs (see itemTables.gen.ts, which writes them to supabase/functions/_shared/items/tables.ts): the rarity table, the substat ranges, which templates
// can be forged and which are drop-only, the chances of every unique, the Gold Pouch denominations and the farm hours per forged piece. The Edge Function runs in Deno and cannot import
// the game, so the numbers are copied here by a script; src/game/__tests__/itemCertificates.test.ts fails when the copy is stale.
import { GEAR } from '../../src/game/gear';
import { DEPTH_BOSS_POOLS } from '../../src/game/dungeon';
import { BATTLE_PASS_TRACK } from '../../src/game/battlepass';
import { HUNTING_ZONES } from '../../src/game/huntingZones';
import { POUCH_IDS, pouchFace, pouchPerDay } from '../../src/game/goldPouch';
import { FORGE_SEAL_MIN_RARITY, RARITIES, SUBSTATS } from '../../src/game/rarity';
import { UNIQUE_BOSS_DROPS } from '../../src/game/uniques';
import T from '../../src/game/tunables';
import { setHoursOwn } from './farmHours';
import { gearLevelGate } from './seasonTablesBuild';

/**
 * Economic rolls per hour a unique drop is SIZED for, by Hunting zone: the comment in huntingZones.ts (Rodada 9, docs/BALANCE_CHANGES.md) says the unique chances are sized for "~224 / 165 / 140 / 140
 * economic rolls/h (glade / marsh / rift / abyss) for a hero past the zone's recommended CP". The server rolls with these (never with the hero's real kill rate, which it cannot see), so a unique
 * is exactly as rare online as the balance intends. MAX_ROLLS_PER_HOUR below is the most any build can ever reach (reference kills/h x roll cap, sub-level 1): the test keeps these under it.
 */
export const UNIQUE_ROLLS_PER_HOUR: Record<string, number> = { demon_glade: 224, blood_marsh: 165, demon_rift: 140, blood_abyss: 140 };

export function buildItemTables() {
  const byId = new Map(GEAR.map((g) => [g.id, g]));
  const instanced = (slot: string) => slot !== 'relic';

  const forge: Record<string, { tier: number; slot: string; levelGate: number }> = {};
  const unique: Record<string, { tier: number; slot: string }> = {};
  for (const g of GEAR) {
    if (!instanced(g.slot)) continue;
    if (g.unique) unique[g.id] = { tier: g.tier ?? 0, slot: g.slot };
    else if (g.recipe) forge[g.id] = { tier: g.tier ?? 0, slot: g.slot, levelGate: gearLevelGate(g, byId) };
  }

  // Farm hours of ONE forged piece of a tier, the whole chain (sim:cost model, scripts/sim/farmHours.ts): the hunting hours of the 7 pieces of a set through that tier, over 7.
  const farmHoursPerPiece: Record<number, number> = {};
  for (let t = 1; t <= 6; t++) farmHoursPerPiece[t] = Math.round((setHoursOwn(t) / 7) * 1000) / 1000;

  const seals = BATTLE_PASS_TRACK.filter((l) => l.premium.kind === 'consumable' && l.premium.id === 'forge_seal').length;

  return {
    rarities: RARITIES.map((r) => ({ id: r.id, chance: r.chance, substatCount: r.substatCount })),
    substats: SUBSTATS.map((s) => ({ type: s.type, min: s.min, max: s.max, perTier: s.perTier, ranges: s.ranges ?? null, decimals: s.decimals ?? 0 })),
    sealMinRarity: FORGE_SEAL_MIN_RARITY,
    forge,
    unique,
    farmHoursPerPiece,
    zones: HUNTING_ZONES.map((z) => ({ id: z.id, unlockFloor: z.unlockFloor, unlockLevel: z.unlockLevel ?? 0, offlineCapHours: z.offlineCapHours, rollsPerHour: UNIQUE_ROLLS_PER_HOUR[z.id] ?? 0, uniques: (z.uniques ?? []).map((u) => ({ itemId: u.itemId, chance: u.chance })) })),
    maxRollsPerHour: T.hunting.economicReferenceKillsPerHour * T.hunting.economicRollCap,
    boss: {
      biomePools: UNIQUE_BOSS_DROPS,
      depthPools: [...DEPTH_BOSS_POOLS],
      maxFloor: 100,
      biomeChance: T.battle.uniqueBossChance,
      depthBossEvery: T.depths.bossEvery,
      depthChanceBase: T.depths.uniqueChanceBase,
      depthChancePerDepth: T.depths.uniqueChancePerDepth,
      depthChanceCap: T.depths.uniqueChanceCap,
      bossEvery: T.battle.bossEvery,
    },
    luck: { hunt: T.heroSkills.luckHuntUnique, boss: T.heroSkills.luckBossDrop },
    pouch: { perDay: pouchPerDay(), faces: Object.fromEntries(POUCH_IDS.map((id) => [id, pouchFace(id)])) },
    seal: { perSeason: seals, seasonDays: T.battlePass.seasonDays },
    passCapHours: T.battlePass.capHours,
  };
}
