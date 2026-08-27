import { EquippedGear } from './gear';

export type GemId = 'ruby' | 'sapphire' | 'emerald';

export interface GemDef {
  id: GemId;
  nameKey: string;
  descKey: string;
  icon: string;
  shardCost: number;
  critDamageBonus?: number;
  resistance?: number;
  maxHp?: number;
}

export const GEMS: GemDef[] = [
  { id: 'ruby', nameKey: 'gem_ruby', descKey: 'gem_ruby_d', icon: '🔴', shardCost: 2, critDamageBonus: 0.15 },
  { id: 'sapphire', nameKey: 'gem_sapphire', descKey: 'gem_sapphire_d', icon: '🔵', shardCost: 2, resistance: 0.08 },
  { id: 'emerald', nameKey: 'gem_emerald', descKey: 'gem_emerald_d', icon: '🟢', shardCost: 2, maxHp: 60 },
];

export function socketsForTier(tier: number): number {
  if (tier <= 0) return 0;
  if (tier === 1) return 1;
  if (tier === 4) return 3;
  return 2;
}

export function getGem(id: string): GemDef | undefined {
  return GEMS.find((g) => g.id === id);
}

export function emptyGems(): Record<GemId, number> {
  return { ruby: 0, sapphire: 0, emerald: 0 };
}

export interface GemBonuses {
  critDamageBonus: number;
  resistance: number;
  maxHp: number;
}

export function socketBonuses(itemId: string, sockets: Record<string, GemId[]>): GemBonuses {
  const list = sockets?.[itemId] ?? [];
  const b: GemBonuses = { critDamageBonus: 0, resistance: 0, maxHp: 0 };
  for (const gid of list) {
    const g = getGem(gid);
    if (!g) continue;
    b.critDamageBonus += g.critDamageBonus ?? 0;
    b.resistance += g.resistance ?? 0;
    b.maxHp += g.maxHp ?? 0;
  }
  return b;
}

export function totalGemBonuses(equipped: EquippedGear, sockets: Record<string, GemId[]>): GemBonuses {
  const w = socketBonuses(equipped.weapon, sockets);
  const a = socketBonuses(equipped.armor, sockets);
  return {
    critDamageBonus: w.critDamageBonus + a.critDamageBonus,
    resistance: w.resistance + a.resistance,
    maxHp: w.maxHp + a.maxHp,
  };
}
