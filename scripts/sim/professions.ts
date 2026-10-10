// Profession helpers shared by the progression report and the profession audit: what Mining / Woodcutting / Gardening level
// (and character level) each gear recipe needs once its whole chain (lower-tier pieces, Furnace / Carpentry outputs) is
// walked down to raw ore, wood and plants. Pure data walk over src/game, nothing here is mirrored.
import { GEAR, getGear } from '../../src/game/gear';
import { MaterialId } from '../../src/game/materials';
import { ORE_TIERS } from '../../src/game/ores';
import { PLANTS } from '../../src/game/garden';
import { REFINING_RECIPES } from '../../src/game/refining';
import { WOOD_TIERS } from '../../src/game/woodcutting';

export interface GearGate {
  id: string;
  slot: string;
  tier: number;
  charLevel: number; // highest recipe requiredLevel in the chain (recipe + refining stations)
  mining: number;
  woodcutting: number;
  gardening: number;
  mineTier: string | null; // highest ore id the chain consumes
  woodTier: string | null;
}

const oreLevel = new Map<string, number>(ORE_TIERS.map((o) => [o.id, o.requiredLevel]));
const woodLevel = new Map<string, number>(WOOD_TIERS.map((o) => [o.id, o.requiredLevel]));
const plantLevel = new Map<string, number>(PLANTS.map((p) => [p.material, p.requiredLevel]));

export function gearGate(id: string): GearGate {
  const g = getGear(id);
  const out: GearGate = { id, slot: g.slot, tier: g.tier ?? 0, charLevel: 0, mining: 0, woodcutting: 0, gardening: 0, mineTier: null, woodTier: null };
  const raw = (m: MaterialId) => {
    if (oreLevel.has(m) && (oreLevel.get(m) as number) >= out.mining) {
      out.mining = oreLevel.get(m) as number;
      out.mineTier = m;
    }
    if (woodLevel.has(m) && (woodLevel.get(m) as number) >= out.woodcutting) {
      out.woodcutting = woodLevel.get(m) as number;
      out.woodTier = m;
    }
    if (plantLevel.has(m)) out.gardening = Math.max(out.gardening, plantLevel.get(m) as number);
  };
  const material = (m: MaterialId) => {
    const rec = REFINING_RECIPES.find((r) => r.output === m && r.station !== 'dust');
    if (!rec) return raw(m);
    out.charLevel = Math.max(out.charLevel, rec.requiredLevel);
    for (const k of Object.keys(rec.input) as MaterialId[]) material(k);
  };
  const walk = (tpl: string) => {
    const r = getGear(tpl).recipe;
    if (!r) return;
    out.charLevel = Math.max(out.charLevel, r.requiredLevel ?? 0);
    for (const m of Object.keys(r.materials ?? {}) as MaterialId[]) material(m);
    for (const sub of Object.keys(r.items ?? {})) walk(sub);
  };
  walk(id);
  return out;
}

// Every forgeable piece that follows the tier ladder (not the Battle Pass dragon line, which needs no profession tier... it still has
// wood handles, so it stays in).
export function allGearGates(): GearGate[] {
  return GEAR.filter((g) => g.recipe && g.slot !== 'relic' && (g.tier ?? 0) > 0).map((g) => gearGate(g.id));
}
