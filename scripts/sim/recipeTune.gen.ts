// Rodada 9: solves the Hunting-material quantities of every gear recipe so a full same-tier set takes the intended hours of hunting (B2 of docs/MATERIAL_FLOW.md),
// and prints them as JSON (`npm run sim:recipes`). The numbers are then pasted into gear.ts by hand / by a one-off patch; this file only computes.
// Method: tiers are solved in order; for each Hunting material the cumulative need of the set (previous-tier pieces included, through the real chain) has to equal
// hours x rate; the tier's own quantity per piece is that gap spread over the seven slots by weight.
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { GEAR, getGear, Recipe } from '../../src/game/gear';
import { chainNeed, huntRate, isHuntMat, SET_SLOTS, setHours, STAGE_FARM } from './setCost';
import { HUNTING_ZONES } from '../../src/game/huntingZones';

// intended hunting hours of a full set, cumulative, per tier
export const TARGET_HOURS = [2.8, 4.5, 10.5, 22, 32, 42];
// the first tier whose recipes ask for the material
const FIRST_TIER: Record<string, number> = { leather_scrap: 1, demon_claw: 2, bone_fragment: 3, concentrated_blood: 3, demon_core: 3, corrupted_crystal: 3, rift_shard: 5, fiend_horn: 5, abyssal_marrow: 5, blood_heart: 5 };
const SLOT_WEIGHT: Record<string, number> = { weapon: 1.5, armor: 1.5, helmet: 0.75, gloves: 0.75, boots: 0.75, ring: 0.75, shield: 0.75 };
// share of the tier's hunting hours spent in each zone (the zone of a tier's materials is the best unlocked one that has them)
const ZONE_SHARE: Record<number, Record<string, number>> = {
  1: { demon_glade: 1 },
  2: { demon_glade: 1 },
  3: { demon_glade: 0.5, blood_marsh: 0.5 },
  4: { demon_rift: 0.5, blood_marsh: 0.5 },
  5: { demon_rift: 0.5, blood_abyss: 0.5 },
  6: { demon_rift: 0.5, blood_abyss: 0.5 },
};
const K: Record<string, number> = { common: 0.85, uncommon: 0.9, rare: 1 };
const rarityOf = (m: string): string => HUNTING_ZONES.flatMap((z) => z.drops).find((d) => d.material === m)!.rarity;

// round numbers read better in a recipe: units up to 12, then steps of 2 (to 30), 5 (to 100) and 10
const nice = (x: number): number => (x < 12 ? Math.round(x) : x < 30 ? Math.round(x / 2) * 2 : x < 100 ? Math.round(x / 5) * 5 : Math.round(x / 10) * 10);
const HUNT_KEYS = Object.keys(FIRST_TIER);
const LEATHER_SLOTS = ['weapon', 'armor', 'shield'];

const slotOf = (tpl: string): string => getGear(tpl).slot;
// the sword line and its axe twin share one recipe (gear.ts says so); the tuner works on the sword line
const AXE_TWIN: Record<string, string> = { bronze_dagger: 'bronze_hatchet', iron_short_sword: 'iron_battleaxe', steel_greatsword: 'steel_greataxe', gilded_warblade: 'gilded_waraxe', voidsteel_blade: 'voidsteel_cleaver', abyssal_greatblade: 'abyssal_reaver' };

export function solve(): { newMats: Record<string, Record<string, number>>; recipeOf: (tpl: string) => Recipe | undefined } {
  const newMats: Record<string, Record<string, number>> = {};
  const baseMats = (tpl: string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [m, n] of Object.entries(getGear(tpl).recipe?.materials ?? {}) as [string, number][]) if (!HUNT_KEYS.includes(m) && m !== 'leather') out[m] = n;
    return out;
  };
  const recipeOf = (tpl: string): Recipe | undefined => {
    const r = getGear(tpl)?.recipe;
    if (!r) return undefined;
    const sword = Object.entries(AXE_TWIN).find(([, axe]) => axe === tpl)?.[0];
    const key = sword ?? tpl;
    if (!newMats[key]) return r;
    return { ...r, materials: { ...baseMats(tpl), ...newMats[key] } as Recipe['materials'] };
  };
  for (let t = 1; t <= 6; t++) {
    const st = STAGE_FARM[t - 1];
    const pieces = Object.values(SET_SLOTS).map((l) => l[t - 1]);
    for (const p of pieces) newMats[p] = newMats[p] ?? {};
    for (const m of HUNT_KEYS) {
      if (t < FIRST_TIER[m]) continue;
      const r = huntRate(m, st);
      const share = ZONE_SHARE[t][r.zone];
      if (!share) continue;
      const target = TARGET_HOURS[t - 1] * share * K[rarityOf(m)] * r.perHour;
      // what the set already needs of m with this tier's own quantity of m at zero
      const own0: Record<string, number> = {};
      for (const p of pieces) {
        own0[p] = newMats[p][m] ?? 0;
        delete newMats[p][m];
      }
      let have = 0;
      for (const p of pieces) have += chainNeed(p, recipeOf)[m] ?? 0;
      const gap = Math.max(0, target - have);
      const wSum = pieces.reduce((a, p) => a + SLOT_WEIGHT[slotOf(p)], 0);
      for (const p of pieces) {
        const q = nice((gap * SLOT_WEIGHT[slotOf(p)]) / wSum);
        if (q > 0) newMats[p][m] = q;
      }
    }
  }
  // leather: weapon / armor / shield take their scrap as tanned leather (3 scrap each)
  for (const [p, mats] of Object.entries(newMats)) {
    if (LEATHER_SLOTS.includes(slotOf(p)) && mats.leather_scrap) {
      mats.leather = Math.max(1, Math.round(mats.leather_scrap / 3));
      delete mats.leather_scrap;
    }
  }
  return { newMats, recipeOf };
}

describe('recipe tuning', () => {
  it('prints the solved hunting quantities', () => {
    const { newMats, recipeOf } = solve();
    const lines: string[] = [];
    for (const [p, m] of Object.entries(newMats)) lines.push(`${p}: ${JSON.stringify(m)}`);
    console.log(lines.join('\n'));
    for (let t = 1; t <= 6; t++) {
      const h = setHours(t, 1, recipeOf);
      console.log(`T${t}: caça ${h.hunt.toFixed(1)} h (alvo ${TARGET_HOURS[t - 1]}) mineração ${h.mine.toFixed(1)} lenha ${h.wood.toFixed(1)} · zonas ${JSON.stringify(Object.fromEntries(Object.entries(h.zoneHours).map(([z, v]) => [z, +v.toFixed(1)])))} · por material ${JSON.stringify(Object.fromEntries(Object.entries(h.huntByMat).map(([z, v]) => [z, +v.toFixed(1)])))}`);
    }
    if (process.env.TUNE_OUT) writeFileSync(process.env.TUNE_OUT, JSON.stringify(newMats, null, 1));
    void GEAR;
    void isHuntMat;
  });
});
