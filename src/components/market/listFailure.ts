import { mt } from '../../locales/market';
import type { SellableEntry } from '../../game/market/items';
import { pouchFloorOf } from '../../game/market/pouchFloor';
import { fmtSol } from './format';

/** The player's text for a refused listing. 'below_pouch_floor' carries the floor the server wants (lamports); an unknown reason falls back to the generic line. */
export function listFailureText(reason: string, floorLamports?: number): string {
  if (reason === 'below_pouch_floor' && floorLamports === undefined) return mt('sell.fail.price');
  const key = `sell.fail.${reason}`;
  const text = mt(key, floorLamports !== undefined ? { min: fmtSol(floorLamports) } : undefined);
  return text === key ? mt('sell.fail.generic') : text;
}

/** What the price box starts with for a Gold Pouch: its floor in SOL (the player raises it from there), or '' when the server has no SOL price yet. */
export function pouchStartPrice(entries: readonly SellableEntry[], solUsd: number | null): string {
  const f = pouchFloorOf(entries, solUsd);
  return f && f.lamports !== null ? fmtSol(f.lamports) : '';
}
