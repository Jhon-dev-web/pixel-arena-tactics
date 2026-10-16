import { activeLocale, fmtDec, fmtNum } from '../../locales';
import { formatSol, formatUnitPrice, formatUsdc, parseSolAmount } from '../../../supabase/functions/_shared/chain/solMoney';

// Small formatters of the market screens. All SOL money is whole lamports (1 SOL = 1,000,000,000) until it is printed; the Pass is USDC base units (1 USDC = 1,000,000).

const decimalMark = (): string => (activeLocale === 'pt' ? ',' : '.');

/** 1_500_000 -> "0,0015" (pt) / "0.0015" (en): SOL with the decimals it needs, at least two. */
export const fmtSol = (lamports: number): string => {
  const [whole, frac = ''] = formatSol(lamports).split('.');
  return frac ? `${fmtNum(Number(whole))}${decimalMark()}${frac}` : fmtNum(Number(whole));
};

/** The price of ONE unit of a material, in micro-SOL: 2500 -> "0,0025" (pt) / "0.0025" (en); up to 6 decimals. */
export const fmtUnitPrice = (micro: number): string => {
  const [whole, frac = ''] = formatUnitPrice(micro).split('.');
  return frac ? `${fmtNum(Number(whole))}${decimalMark()}${frac}` : fmtNum(Number(whole));
};

/** 10_000_000 -> "10,00" (pt) / "10.00" (en) */
export const fmtUsdc = (units: number): string => {
  const [whole, frac = '00'] = formatUsdc(units).split('.');
  return `${fmtNum(Number(whole))}${decimalMark()}${frac}`;
};

/** "about US$ 148,25": the dollar value of a SOL amount at the SERVER's price. null when the server has no price (then the screen shows no dollar line). */
export const fmtUsdAround = (lamports: number, solUsd: number | null): string | null => {
  if (solUsd === null || !Number.isFinite(solUsd)) return null;
  const usd = (lamports / 1_000_000_000) * solUsd;
  return fmtDec(usd < 0.01 ? Math.max(usd, 0.001) : usd, usd < 0.1 ? 3 : 2, true);
};

/** "7xKXtg...ab12" */
export const shortAddress = (a: string): string => (a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

/** What the player typed in the price box -> lamports, or null. Accepts "1", "0.5", "0,125" (up to 3 decimals). */
export function parsePriceInput(text: string): number | null {
  return parseSolAmount(text.trim().replace(',', '.'));
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
