import { fmtNum } from '../../locales';
import { mt } from '../../locales/market';
import { splitLamports } from '../../../supabase/functions/_shared/chain/solMoney';
import { PublicListing } from '../../game/market/api';
import { getMaterial, MaterialId } from '../../game/materials';
import MaterialIcon from '../MaterialIcon';
import { Button, Chip, ItemCard } from '../ui';
import { fmtSol, fmtUnitPrice } from './format';
import { SolIcon } from './icons';
import { itemName, materialFrame } from './names';
import UsdLine from './UsdLine';
import '../../market-materials.css';

// A LOT of one tradeable material on the market, on the card of the new design system (components/ui): the material and how many units, the price of ONE unit (up to 6 decimals), the price of the whole
// lot, and the "Negociavel" mark. A lot is bought WHOLE; the buy button opens the fee split and "Reservar e pagar" (the same reservation as an item).
export default function LotCard({
  listing,
  feePercent,
  solUsd,
  expanded,
  busy,
  onToggle,
  onReserve,
}: {
  listing: PublicListing;
  feePercent: number;
  solUsd: number | null;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onReserve: () => void;
}) {
  const def = getMaterial(listing.template_id as MaterialId);
  const split = splitLamports(listing.price_lamports);
  const reserved = listing.status === 'reserved';
  const quantity = listing.material_qty ?? 0;
  return (
    <ItemCard
      className="mk-lot"
      rarity={materialFrame(listing.template_id)}
      icon={def ? <MaterialIcon item={def} /> : null}
      qty={`x${fmtNum(quantity)}`}
      name={itemName({ kind: 'material', templateId: listing.template_id })}
      tag={
        <span className="mk-lot-tags">
          <Chip tone="gold">{mt('browse.tradeable')}</Chip>
          {reserved && <Chip tone="bad">{mt('browse.reserved')}</Chip>}
        </span>
      }
      rows={[
        {
          label: mt('browse.unitPrice'),
          value: (
            <>
              <SolIcon /> {fmtUnitPrice(listing.unit_price_micro ?? 0)} <small>SOL</small>
            </>
          ),
        },
        {
          label: mt('browse.lotTotal'),
          tone: 'gold',
          value: (
            <>
              <SolIcon /> {fmtSol(listing.price_lamports)} <small>SOL</small>
            </>
          ),
        },
      ]}
      action={
        <Button variant="secondary" size="sm" block onClick={onToggle} aria-expanded={expanded} disabled={reserved}>
          {expanded ? mt('browse.back') : mt('browse.buy')}
        </Button>
      }
    >
      <UsdLine lamports={listing.price_lamports} solUsd={solUsd} />
      {expanded && (
        <div className="mk-lot-more">
          <p className="ui-note">{mt('browse.wholeLot', { n: fmtNum(quantity) })}</p>
          <p className="ui-note">
            {mt('rules.fee', { pct: feePercent })}: {fmtSol(split.feeLamports)} SOL. {mt('pay.toSeller')}: {fmtSol(split.sellerLamports)} SOL.
          </p>
          <Button variant="primary" size="sm" block disabled={reserved || busy} onClick={onReserve}>
            {busy ? mt('loading') : mt('browse.reserve')}
          </Button>
        </div>
      )}
    </ItemCard>
  );
}
