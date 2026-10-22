// The game numbers the server needs (see seasonTables.gen.ts, which writes them to supabase/functions/_shared/progress/tables.ts).
import { MAX_LEVEL, xpForNextLevel, xpToReachLevel } from '../../src/game/engine';
import { GEAR, GearItem, gearRequiredLevel } from '../../src/game/gear';
import { HUNTING_ZONES, zoneReferenceXpPerHour } from '../../src/game/huntingZones';
import { huntingXpPaceCap } from '../../src/game/huntEconomy';
import { LEAGUE_EVENT_SLOTS } from '../../src/game/leagueEvents';
import { skillXpToReachLevel } from '../../src/game/skills';
import T from '../../src/game/tunables';

// Highest hero level a piece cannot exist below: src/game/gear.ts gearRequiredLevel (the same number the equip rule uses). Pieces with no gate (starters, tier 1) are left out.
export function gearLevelGate(g: GearItem): number {
  return gearRequiredLevel(g);
}

export function buildTables() {
  const levelGates: Record<string, number> = {};
  const floorGates: Record<string, number> = {};
  for (const g of GEAR) {
    if (g.slot === 'relic') continue; // relics are stackable inventory entries, not instances
    const gate = gearLevelGate(g);
    if (gate > 0) levelGates[g.id] = gate;
    const src = g.source as { zone?: string; bossFloor?: number } | undefined;
    if (g.unique && src?.bossFloor) floorGates[g.id] = src.bossFloor;
    else if (g.unique && src?.zone) floorGates[g.id] = HUNTING_ZONES.find((z) => z.id === src.zone)?.unlockFloor ?? 0;
  }
  const xpToLevel: number[] = [];
  for (let l = 1; l <= MAX_LEVEL; l++) xpToLevel.push(xpToReachLevel(l));
  // XP at which each profession level begins (index l - 1), levels 1..maxLevel. Mining and Woodcutting share one curve, Gardening has its own.
  const professionXpToLevel = (id: 'mining' | 'woodcutting' | 'gardening'): number[] => Array.from({ length: T.skills.maxLevel }, (_, i) => skillXpToReachLevel(i + 1, id));
  return {
    professionXpToLevel: { mining: professionXpToLevel('mining'), woodcutting: professionXpToLevel('woodcutting'), gardening: professionXpToLevel('gardening') },
    xpToLevel, // xpToLevel[l - 1] = XP at which hero level l begins (level 1 = 0, level 100 = paragon start)
    paragonFirstXp: xpForNextLevel(MAX_LEVEL - 1) * T.paragon.xpShare, // unrounded; paragon level n costs round(this * growth^(n-1))
    paragonGrowth: T.paragon.xpGrowth,
    levelGates,
    floorGates,
    eventSlots: LEAGUE_EVENT_SLOTS.map((s) => ({ id: s.id, kind: s.kind, startHour: s.startHour, hours: s.hours })),
    zoneFloors: HUNTING_ZONES.map((z) => ({ id: z.id, unlockFloor: z.unlockFloor, unlockLevel: z.unlockLevel ?? 0, xpPerHour: Math.round(zoneReferenceXpPerHour(z) * huntingXpPaceCap()), xpPerSubLevel: z.xpPerSubLevel ?? 0 })),
  };
}

