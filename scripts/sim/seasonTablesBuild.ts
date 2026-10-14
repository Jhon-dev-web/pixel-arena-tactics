// The game numbers the server needs (see seasonTables.gen.ts, which writes them to supabase/functions/_shared/progress/tables.ts).
import { dungeonRunXp, milestoneXpBonus } from '../../src/game/dungeon';
import { MAX_LEVEL, xpForNextLevel, xpToReachLevel } from '../../src/game/engine';
import { GEAR, GearItem } from '../../src/game/gear';
import { HUNTING_ZONES } from '../../src/game/huntingZones';
import { skillXpToReachLevel } from '../../src/game/skills';
import T from '../../src/game/tunables';

// Highest hero level a piece cannot exist below: a crafted piece needs its recipe's requiredLevel (a piece made from a previous piece inherits that one's gate); a
// unique takes its twin's. Pieces with no gate (starters, tier 1) are left out.
export function gearLevelGate(g: GearItem, byId: Map<string, GearItem>): number {
  let gate = g.recipe?.requiredLevel ?? 0;
  for (const inputId of Object.keys(g.recipe?.items ?? {})) {
    const input = byId.get(inputId);
    if (input) gate = Math.max(gate, gearLevelGate(input, byId));
  }
  if (g.salvageLike) {
    const twin = byId.get(g.salvageLike);
    if (twin) gate = Math.max(gate, gearLevelGate(twin, byId));
  }
  return gate;
}

export function buildTables() {
  const byId = new Map(GEAR.map((g) => [g.id, g]));
  const levelGates: Record<string, number> = {};
  const floorGates: Record<string, number> = {};
  for (const g of GEAR) {
    if (g.slot === 'relic') continue; // relics are stackable inventory entries, not instances
    const gate = gearLevelGate(g, byId);
    if (gate > 0) levelGates[g.id] = gate;
    const src = g.source as { zone?: string; bossFloor?: number } | undefined;
    if (g.unique && src?.bossFloor) floorGates[g.id] = src.bossFloor;
    else if (g.unique && src?.zone) floorGates[g.id] = HUNTING_ZONES.find((z) => z.id === src.zone)?.unlockFloor ?? 0;
  }
  const xpToLevel: number[] = [];
  for (let l = 1; l <= MAX_LEVEL; l++) xpToLevel.push(xpToReachLevel(l));
  // XP of one Dungeon run that clears floors 1..f (index f); the last entry also adds 40 Profundezas depths, the most any sim seed reached (about 44).
  const dungeonRunXp_: number[] = [];
  for (let f = 0; f <= 100; f++) dungeonRunXp_.push(f === 0 ? 0 : dungeonRunXp(1, f) + milestoneXpBonus(1, f) + (f === 100 ? dungeonRunXp(101, 40) : 0));
  // XP at which each profession level begins (index l - 1), levels 1..maxLevel. Mining and Woodcutting share one curve, Gardening has its own.
  const professionXpToLevel = (id: 'mining' | 'woodcutting' | 'gardening'): number[] => Array.from({ length: T.skills.maxLevel }, (_, i) => skillXpToReachLevel(i + 1, id));
  return {
    professionXpToLevel: { mining: professionXpToLevel('mining'), woodcutting: professionXpToLevel('woodcutting'), gardening: professionXpToLevel('gardening') },
    dungeonRunXp: dungeonRunXp_,
    xpToLevel, // xpToLevel[l - 1] = XP at which hero level l begins (level 1 = 0, level 100 = paragon start)
    paragonFirstXp: xpForNextLevel(MAX_LEVEL - 1) * T.paragon.xpShare, // unrounded; paragon level n costs round(this * growth^(n-1))
    paragonGrowth: T.paragon.xpGrowth,
    levelGates,
    floorGates,
    zoneFloors: HUNTING_ZONES.map((z) => ({ id: z.id, unlockFloor: z.unlockFloor, xpPerHour: z.xpPerHour })),
  };
}

