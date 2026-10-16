import { mt } from '../../locales/market';
import { fmtUsdAround } from './format';

/** "≈ US$ 148,25" next to a SOL price: ONLY when the server sent a SOL price (the optional SOL_USD_PRICE_URL); without one nothing is rendered. The pixel font has no "≈", so the sign gets a font that does. */
export default function UsdLine({ lamports, solUsd, className = '' }: { lamports: number; solUsd: number | null; className?: string }) {
  const value = fmtUsdAround(lamports, solUsd);
  if (value === null) return null;
  return (
    <small className={`mk-usd${className ? ` ${className}` : ''}`} aria-label={mt('browse.aroundLabel', { a: value })}>
      <span className="mk-approx" aria-hidden>
        {'≈'}
      </span>{' '}
      US$ {value}
    </small>
  );
}
