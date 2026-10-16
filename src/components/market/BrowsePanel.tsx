import { useMemo, useState } from 'react';
import { INSTANCED_SLOTS, getGear } from '../../game/gear';
import { t } from '../../locales';
import { mt } from '../../locales/market';
import { PublicListing } from '../../game/market/api';
import { splitPrice } from '../../../supabase/functions/_shared/chain/money';
import ItemCard from './ItemCard';
import { fmtUsdt } from './format';

type KindFilter = 'all' | 'gear' | 'unique' | 'gold_pouch';
type Sort = 'new' | 'cheap' | 'dear';

// The public listings (the one view anon may read): the item as its certificate describes it and its price. Filter by kind, slot, tier and rarity; reserve to pay.
export default function BrowsePanel({ listings, feePercent, busyId, failure, onReserve }: { listings: PublicListing[]; feePercent: number; busyId: string | null; failure: string | null; onReserve: (listing: PublicListing) => void }) {
  const [kind, setKind] = useState<KindFilter>('all');
  const [slot, setSlot] = useState('');
  const [tier, setTier] = useState('');
  const [rarity, setRarity] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [open, setOpen] = useState<string | null>(null);

  const shown = useMemo(() => {
    const list = listings.filter((l) => {
      if (kind !== 'all' && l.kind !== kind) return false;
      if (l.kind !== 'gold_pouch') {
        if (slot && getGear(l.template_id)?.slot !== slot) return false;
        if (tier && String(l.tier ?? '') !== tier) return false;
        if (rarity && l.rarity !== rarity) return false;
      } else if (slot || tier || rarity) return false;
      return true;
    });
    return [...list].sort((a, b) => (sort === 'cheap' ? a.price_cents - b.price_cents : sort === 'dear' ? b.price_cents - a.price_cents : Date.parse(b.created_at) - Date.parse(a.created_at)));
  }, [listings, kind, slot, tier, rarity, sort]);

  const kinds: { id: KindFilter; label: string }[] = [
    { id: 'all', label: mt('browse.all') },
    { id: 'gear', label: mt('browse.gear') },
    { id: 'unique', label: mt('browse.unique') },
    { id: 'gold_pouch', label: mt('browse.pouch') },
  ];

  return (
    <div className="mk-panel">
      <div className="mk-chips" role="radiogroup">
        {kinds.map((k) => (
          <button key={k.id} className={`mk-chip${kind === k.id ? ' active' : ''}`} onClick={() => setKind(k.id)} aria-pressed={kind === k.id} data-ui>
            {k.label}
          </button>
        ))}
      </div>
      <div className="mk-filters">
        <label>
          <span>{mt('browse.slot')}</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value)} disabled={kind === 'gold_pouch'}>
            <option value="">{mt('browse.anySlot')}</option>
            {INSTANCED_SLOTS.map((s) => (
              <option key={s} value={s}>
                {mt(`slots.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{mt('browse.tier')}</span>
          <select value={tier} onChange={(e) => setTier(e.target.value)} disabled={kind === 'gold_pouch'}>
            <option value="">{mt('browse.anyTier')}</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{mt('browse.rarity')}</span>
          <select value={rarity} onChange={(e) => setRarity(e.target.value)} disabled={kind === 'gold_pouch'}>
            <option value="">{mt('browse.anyRarity')}</option>
            <option value="rare">{t('rarity.rar_rare')}</option>
            <option value="epic">{t('rarity.rar_epic')}</option>
            <option value="legendary">{t('rarity.rar_legendary')}</option>
          </select>
        </label>
        <label>
          <span>{'↕'}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="new">{mt('browse.sortNew')}</option>
            <option value="cheap">{mt('browse.sortCheap')}</option>
            <option value="dear">{mt('browse.sortDear')}</option>
          </select>
        </label>
      </div>
      {failure && (
        <p className="mk-status error" role="alert">
          {failure}
        </p>
      )}
      {shown.length === 0 && <p className="mk-note">{mt('browse.empty')}</p>}
      <ul className="mk-list">
        {shown.map((l) => {
          const split = splitPrice(l.price_cents);
          const expanded = open === l.id;
          return (
            <li key={l.id} className={`mk-listing${l.status === 'reserved' ? ' reserved' : ''}`}>
              <button className="mk-listing-head" onClick={() => setOpen(expanded ? null : l.id)} aria-expanded={expanded} data-ui>
                <ItemCard item={{ kind: l.kind, templateId: l.template_id, rarity: l.rarity, tier: l.tier, substats: l.substats, goldAmount: l.gold_amount }} compact={!expanded} />
                <span className="mk-price">
                  {fmtUsdt(l.price_cents)} <small>USDT</small>
                  {l.status === 'reserved' && <span className="mk-tag warn">{mt('browse.reserved')}</span>}
                </span>
              </button>
              {expanded && (
                <div className="mk-listing-more">
                  <p className="mk-note">
                    {mt('rules.fee', { pct: feePercent })}: {fmtUsdt(split.feeCents)} USDT. {mt('pay.toSeller')}: {fmtUsdt(split.sellerCents)} USDT.
                  </p>
                  <button className="mk-btn primary" disabled={l.status === 'reserved' || busyId !== null} onClick={() => onReserve(l)} data-ui>
                    {busyId === l.id ? mt('loading') : mt('browse.reserve')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
