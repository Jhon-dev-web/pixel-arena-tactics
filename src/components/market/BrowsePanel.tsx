import { useMemo, useState } from 'react';
import { INSTANCED_SLOTS, getGear } from '../../game/gear';
import { fmtNum, t } from '../../locales';
import { mt } from '../../locales/market';
import { PublicListing } from '../../game/market/api';
import { rarityDef, substatNameKey } from '../../game/rarity';
import { splitPrice } from '../../../supabase/functions/_shared/chain/money';
import { fmtSubstat } from '../substatText';
import { ItemArt, ItemLike } from './ItemCard';
import { UsdtIcon } from './icons';
import { fmtUsdt } from './format';
import { itemName } from './names';

type KindFilter = 'all' | 'gear' | 'unique' | 'gold_pouch';
type Sort = 'new' | 'cheap' | 'dear';

/** Listings per page (two rows of four on a wide screen). */
export const PAGE_SIZE = 8;

const itemOfListing = (l: PublicListing): ItemLike => ({ kind: l.kind, templateId: l.template_id, rarity: l.rarity, tier: l.tier, substats: l.substats, goldAmount: l.gold_amount });

/** The page numbers to show: a window of up to five around the current one. */
export function pageWindow(page: number, pages: number): number[] {
  const size = Math.min(5, pages);
  const start = Math.max(0, Math.min(page - Math.floor(size / 2), pages - size));
  return Array.from({ length: size }, (_, i) => start + i);
}

// The public listings (the one view anon may read): the item as its certificate describes it and its price in USDT. A search box, filters by kind, slot, tier and rarity, a sort, pages of cards. "Comprar"
// opens the item's detail (its substats, the game's fee and the seller's share); "Reservar e pagar" there reserves it and moves to the payment step.
export default function BrowsePanel({ listings, feePercent, busyId, failure, onReserve }: { listings: PublicListing[]; feePercent: number; busyId: string | null; failure: string | null; onReserve: (listing: PublicListing) => void }) {
  const [kind, setKind] = useState<KindFilter>('all');
  const [slot, setSlot] = useState('');
  const [tier, setTier] = useState('');
  const [rarity, setRarity] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false); // a phone keeps the selects folded away: the listings come first

  // any change of filter goes back to the first page and closes the open card
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(0);
      setOpen(null);
    };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = listings.filter((l) => {
      if (kind !== 'all' && l.kind !== kind) return false;
      if (l.kind !== 'gold_pouch') {
        if (slot && getGear(l.template_id)?.slot !== slot) return false;
        if (tier && String(l.tier ?? '') !== tier) return false;
        if (rarity && l.rarity !== rarity) return false;
      } else if (slot || tier || rarity) return false;
      if (q && !itemName({ kind: l.kind, templateId: l.template_id }).toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list].sort((a, b) => (sort === 'cheap' ? a.price_cents - b.price_cents : sort === 'dear' ? b.price_cents - a.price_cents : Date.parse(b.created_at) - Date.parse(a.created_at)));
  }, [listings, kind, slot, tier, rarity, sort, search]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageItems = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const kinds: { id: KindFilter; label: string }[] = [
    { id: 'all', label: mt('browse.all') },
    { id: 'gear', label: mt('browse.gear') },
    { id: 'unique', label: mt('browse.unique') },
    { id: 'gold_pouch', label: mt('browse.pouch') },
  ];
  const noGear = kind === 'gold_pouch';

  return (
    <div className="mk-panel">
      <div className="mk-toolbar">
        <div className="mk-searchrow">
          <label className="mk-search">
            <span className="mk-search-ico" aria-hidden>
              {'🔍'}
            </span>
            <input type="search" aria-label={mt('browse.search')} placeholder={mt('browse.search')} value={search} onChange={(e) => change(setSearch)(e.target.value)} maxLength={40} autoComplete="off" spellCheck={false} />
          </label>
          <button className={`mk-btn small mk-filters-toggle${filtersOpen ? ' active' : ''}`} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen} data-ui>
            {mt('browse.filters')}
          </button>
        </div>
        <div className={`mk-selects${filtersOpen ? ' open' : ''}`}>
          <select aria-label={mt('browse.slot')} value={slot} onChange={(e) => change(setSlot)(e.target.value)} disabled={noGear}>
            <option value="">{mt('browse.allCategories')}</option>
            {INSTANCED_SLOTS.map((s) => (
              <option key={s} value={s}>
                {mt(`slots.${s}`)}
              </option>
            ))}
          </select>
          <select aria-label={mt('browse.rarity')} value={rarity} onChange={(e) => change(setRarity)(e.target.value)} disabled={noGear}>
            <option value="">{mt('browse.rarity')}</option>
            <option value="rare">{t('rarity.rar_rare')}</option>
            <option value="epic">{t('rarity.rar_epic')}</option>
            <option value="legendary">{t('rarity.rar_legendary')}</option>
          </select>
          <select aria-label={mt('browse.tier')} value={tier} onChange={(e) => change(setTier)(e.target.value)} disabled={noGear}>
            <option value="">{mt('browse.tier')}</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={String(n)}>
                {mt('browse.tierN', { n })}
              </option>
            ))}
          </select>
          <select aria-label={mt('browse.sort')} value={sort} onChange={(e) => change(setSort)(e.target.value as Sort)}>
            <option value="new">{mt('browse.sortNew')}</option>
            <option value="cheap">{mt('browse.sortCheap')}</option>
            <option value="dear">{mt('browse.sortDear')}</option>
          </select>
        </div>
      </div>
      <div className="mk-chips" role="radiogroup">
        {kinds.map((k) => (
          <button key={k.id} className={`mk-chip${kind === k.id ? ' active' : ''}`} onClick={() => change(setKind)(k.id)} aria-pressed={kind === k.id} data-ui>
            {k.label}
          </button>
        ))}
      </div>
      {failure && (
        <p className="mk-status error" role="alert">
          {failure}
        </p>
      )}
      {shown.length === 0 && <p className="mk-note">{mt('browse.empty')}</p>}
      <ul className="mk-grid">
        {pageItems.map((l) => {
          const split = splitPrice(l.price_cents);
          const expanded = open === l.id;
          const item = itemOfListing(l);
          const reserved = l.status === 'reserved';
          const rar = l.rarity ?? 'common';
          return (
            <li key={l.id} className={`mk-card${reserved ? ' reserved' : ''}${expanded ? ' open' : ''}`}>
              <div className="mk-card-top">
                <ItemArt item={item} qty={1} />
                <span className="mk-card-id">
                  <span className={`mk-item-name r-${l.kind === 'gold_pouch' ? 'common' : rar}`}>{itemName(item)}</span>
                  {l.kind !== 'gold_pouch' && l.rarity ? <span className={`rarity-line r-${rar}`}>{t(`rarity.${rarityDef(rar).nameKey}`)}</span> : l.gold_amount !== null ? <span className="rarity-line r-common">{mt('browse.pouchWorth', { g: fmtNum(l.gold_amount) })}</span> : null}
                </span>
                <span className="mk-card-tags">
                  {l.kind === 'unique' && <span className="mk-tag">{mt('browse.unique')}</span>}
                  {l.tier ? <span className="mk-tag">{mt('browse.tierN', { n: l.tier })}</span> : null}
                  <span className="mk-cert" title={mt('browse.certificateHint')}>
                    {'✓ '}
                    <span className="mk-cert-text">{mt('browse.certificate')}</span>
                  </span>
                  {reserved && <span className="mk-tag warn">{mt('browse.reserved')}</span>}
                </span>
              </div>
              <div className="mk-card-price">
                <span>{mt('browse.price')}</span>
                <b>
                  <UsdtIcon /> {fmtUsdt(l.price_cents)} <small>USDT</small>
                </b>
              </div>
              <button className="mk-btn mk-card-buy" onClick={() => setOpen(expanded ? null : l.id)} aria-expanded={expanded} disabled={reserved} data-ui>
                {expanded ? mt('browse.back') : mt('browse.buy')}
              </button>
              {expanded && (
                <div className="mk-card-more">
                  {item.substats.length > 0 && (
                    <span className="substat-list">
                      {item.substats.map((s, i) => (
                        <span className="substat-line" key={i}>
                          +{fmtSubstat(s as never)} {t(`rarity.${substatNameKey(s.type as never)}`)}
                        </span>
                      ))}
                    </span>
                  )}
                  <p className="mk-note">
                    {mt('rules.fee', { pct: feePercent })}: {fmtUsdt(split.feeCents)} USDT. {mt('pay.toSeller')}: {fmtUsdt(split.sellerCents)} USDT.
                  </p>
                  <button className="mk-btn primary" disabled={reserved || busyId !== null} onClick={() => onReserve(l)} data-ui>
                    {busyId === l.id ? mt('loading') : mt('browse.reserve')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {pages > 1 && (
        <nav className="mk-pager" aria-label={mt('browse.page', { n: current + 1 })}>
          <button className="mk-page" onClick={() => setPage(0)} disabled={current === 0} aria-label={mt('browse.first')} data-ui>
            {'«'}
          </button>
          {pageWindow(current, pages).map((p) => (
            <button key={p} className={`mk-page${p === current ? ' active' : ''}`} onClick={() => setPage(p)} aria-current={p === current ? 'page' : undefined} data-ui>
              {p + 1}
            </button>
          ))}
          <button className="mk-page" onClick={() => setPage(pages - 1)} disabled={current === pages - 1} aria-label={mt('browse.last')} data-ui>
            {'»'}
          </button>
        </nav>
      )}
    </div>
  );
}
