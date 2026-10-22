import { pouchFloorLamports, pouchFloorUsd } from '../../../supabase/functions/_shared/chain/solMoney';
import type { SellableEntry } from './items';

// The Gold Pouch price floor (owner decision 2026-10-22): US$ 0.25 per 1,000 Gold of face value, charged in SOL. The per-1,000 constant lives in ONE place, supabase/functions/_shared/chain/solMoney.ts
// (POUCH_FLOOR_USD_MICRO_PER_1000_GOLD): the server enforces it with the server's SOL price and the game imports the same file, so the screen can never show a floor the server would refuse. The server has the
// last word (market_list, migration 0036); this is only what the form shows, pre-fills and blocks on.

export { pouchFloorLamports, pouchFloorUsd };

export interface PouchFloor {
  /** the floor in lamports at the server's SOL price, or null when the server has no price (a pouch cannot be listed then) */
  lamports: number | null;
  /** the floor in US dollars (the dollar value never changes with the SOL price) */
  usd: number;
}

/** The floor of the pouches about to be listed together at ONE price: the highest of them (the pouches of a kind can have different faces: the old certificates keep theirs). null when nothing is a pouch. */
export function pouchFloorOf(entries: readonly SellableEntry[], solUsd: number | null): PouchFloor | null {
  const faces = entries.flatMap((e) => (e.kind === 'gold_pouch' ? [e.goldAmount] : []));
  if (faces.length === 0) return null;
  const gold = Math.max(...faces);
  return { lamports: pouchFloorLamports(gold, solUsd), usd: pouchFloorUsd(gold) };
}
