import { fmtDec } from '../../locales';
import { parseUsdtAmount } from '../../../supabase/functions/_shared/chain/money';

// Small formatters of the market screens. All money is whole US cents (1000 = 10.00 USDT) until it is printed.

/** 1000 -> "10,00" (pt) / "10.00" (en) */
export const fmtUsdt = (cents: number): string => fmtDec(cents / 100, 2, true);

/** "0x1234...abcd" */
export const shortAddress = (a: string): string => (a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

/** What the player typed in the price box -> cents, or null. Accepts "10", "10.5", "10,50". */
export function parsePriceInput(text: string): number | null {
  return parseUsdtAmount(text.trim().replace(',', '.'));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const msLeft = (iso: string, now: number): number => Math.max(0, Date.parse(iso) - now);
export const clock = (ms: number): { m: string; s: string } => ({ m: String(Math.floor(ms / 60000)), s: String(Math.floor((ms % 60000) / 1000)).padStart(2, '0') });
