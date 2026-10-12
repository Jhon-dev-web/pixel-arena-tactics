// Per-slot tier power (docs/ITEM_BALANCE_AUDIT.md, section N): the CP a piece adds to a reference hero over the same hero with the slot empty (the
// starter for weapon / armor), so the number of every tier of a line is measured on the same base and the step from tier N-1 to N is a plain ratio.
import { computeCP, defaultSave, SaveData, xpToReachLevel } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { getGear } from '../../src/game/gear';
import { spendAttributePoints } from './driver';
import { TIER_EXTRAS, TIER_GEAR } from './ladder';

// One chain per line, tier 1 .. 6 (the gilded / dragon fork of tier 4 is one chain, see gear.ts).
export const LINES: Record<string, { slot: string; chain: string[] }> = {
  sword: { slot: 'weapon', chain: ['bronze_dagger', 'iron_short_sword', 'steel_greatsword', 'gilded_warblade', 'dragon_flameblade', 'voidsteel_blade', 'abyssal_greatblade'] },
  axe: { slot: 'weapon', chain: ['bronze_hatchet', 'iron_battleaxe', 'steel_greataxe', 'gilded_waraxe', 'voidsteel_cleaver', 'abyssal_reaver'] },
  armor: { slot: 'armor', chain: ['bronze_leather', 'iron_chainmail', 'steel_plate', 'gilded_aegis', 'dragon_scale_armor', 'voidsteel_plate', 'abyssal_bulwark'] },
  helmet: { slot: 'helmet', chain: ['bronze_helm', 'iron_helm', 'steel_helm', 'gilded_helm', 'voidsteel_helm', 'abyssal_helm'] },
  gloves: { slot: 'gloves', chain: ['leather_gloves', 'iron_gauntlets', 'steel_gauntlets', 'gilded_gauntlets', 'voidsteel_gauntlets', 'abyssal_gauntlets'] },
  boots: { slot: 'boots', chain: ['leather_boots', 'iron_greaves', 'steel_greaves', 'gilded_greaves', 'voidsteel_greaves', 'abyssal_greaves'] },
  ring: { slot: 'ring', chain: ['copper_ring', 'silver_ring', 'gold_ring', 'ruby_ring', 'obsidian_ring', 'abyssal_ring'] },
  shield: { slot: 'shield', chain: ['bronze_buckler', 'iron_shield', 'steel_kite_shield', 'gilded_shield', 'voidsteel_shield', 'abyssal_shield'] },
};

// Reference hero: level 60, the tier-3 set at +4 in every slot but the measured one.
export function referenceHero(): SaveData {
  let h: SaveData = { ...defaultSave(), xp: xpToReachLevel(60), highestDungeonFloor: 1 };
  const instances = { ...h.gearInstances };
  const equipped = { ...h.equipped } as unknown as Record<string, string | null>;
  const pieces: [string, string][] = [['weapon', TIER_GEAR[3][0]], ['armor', TIER_GEAR[3][1]], ...TIER_EXTRAS[3]];
  for (const [slot, tpl] of pieces) {
    const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity: 'common', substats: [], upgrade: 4 });
    instances[inst.id] = inst;
    equipped[slot] = inst.id;
  }
  h = { ...h, gearInstances: instances, equipped: equipped as unknown as SaveData['equipped'] };
  return spendAttributePoints(h);
}

// CP gain of wearing `tpl` (common +4) in its slot over the empty slot, on the reference hero.
export function pieceGain(tpl: string): number {
  const base = referenceHero();
  const slot = getGear(tpl).slot;
  const emptyEq = { ...base.equipped } as unknown as Record<string, string | null>;
  const starterId = slot === 'weapon' || slot === 'armor' ? base.equipped[slot as 'weapon' | 'armor'] : null;
  void starterId;
  const instances = { ...base.gearInstances };
  const inst = createGearInstance(tpl, { id: `gi_m_${tpl}`, origin: 'craft', rarity: 'common', substats: [], upgrade: 4 });
  instances[inst.id] = inst;
  const withPiece: SaveData = { ...base, gearInstances: instances, equipped: { ...emptyEq, [slot]: inst.id } as unknown as SaveData['equipped'] };
  // empty slot: weapon / armor fall back to the zero-stat starter
  const without: SaveData = { ...base, equipped: { ...emptyEq, [slot]: null } as unknown as SaveData['equipped'] };
  return computeCP(withPiece) / computeCP(without) - 1;
}
