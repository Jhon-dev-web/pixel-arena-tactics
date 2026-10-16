import { useMemo, useState } from 'react';
import { INSTANCED_SLOTS, getGear } from '../../game/gear';
import { usableAtLevel } from '../../game/market/levelNote';
import { fmtNum, t } from '../../locales';
import { mt } from '../../locales/market';
import { PublicListing } from '../../game/market/api';
import { rarityDef } from '../../game/rarity';
import { splitLamports } from '../../../supabase/functions/_shared/chain/solMoney';
import { CertMark, ItemIcon, ItemLike, Substats, frameOf } from './ItemCard';
import { SolIcon } from './icons';
import { fmtSol } from './format';
import UsdLine from './UsdLine';
import { itemName } from './names';
import LotCard from './LotCard';
import { Button, Chip, ChipRow, ItemCard as UiItemCard, Panel, SearchField, SelectField } from '../ui';

type KindFilter = 'all' | 'gear' | 'unique' | 'gold_pouch' | 'material';
type Sort = 'new' | 'cheap' | 'dear';

/** Listings per page (two rows of four on a wide screen). */
export const PAGE_SIZE = 8;

const itemOfListing = (l: PublicListing): ItemLike => ({ kind: l.kind, templateId: l.template_id, rarity: l.rarity, tier: l.tier, substats: l.substats, goldAmount: l.gold_amount, ...(l.kind === 'material' ? { quantity: l.material_qty ?? 0, unitPriceMicro: l.unit_price_micro ?? 0 } : {}) });

/** The page numbers to show: a window of up to five around the current one. */
export function pageWindow(page: number, pages: number): number[] {
  const size = Math.min(5, pages);
  const start = Math.max(0, Math.min(page - Math.floor(size / 2), pages - size));
  return Array.from({ length: size }, (_, i) => start + i);
}

// The public listings (the one view anon may read): the item as its certificate describes it and its price in SOL (with an optional "about US$" line when the server has a price). A search box, filters by kind, slot, tier and rarity, a sort, pages of cards. "Comprar"
// opens the item's detail (its substats, the game's fee and the seller's share); "Reservar e pagar" there reserves it and moves to the payment step.
export default function BrowsePanel({ listings, feePercent, solUsd, busyId, failure, onReserve, heroLevel }: { listings: PublicListing[]; feePercent: number; solUsd: number | null; busyId: string | null; failure: string | null; onReserve: (listing: PublicListing) => void; heroLevel?: number }) {
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
      if (l.kind !== 'gold_pouch' && l.kind !== 'material') {
        if (slot && getGear(l.template_id)?.slot !== slot) return false;
        if (tier && String(l.tier ?? '') !== tier) return false;
        if (rarity && l.rarity !== rarity) return false;
      } else if (slot || tier || rarity) return false;
      if (q && !itemName({ kind: l.kind, templateId: l.template_id }).toLowerCase().includes(q)) return false;
      return true;
    });
    // Lots of different sizes are compared by the price of ONE unit (the whole lot's price says nothing about which is the better deal); everything else by its price.
    const price = (l: PublicListing): number => (l.kind === 'material' && l.unit_price_micro ? l.unit_price_micro * 1000 : l.price_lamports);
    return [...list].sort((a, b) => (sort === 'cheap' ? price(a) - price(b) : sort === 'dear' ? price(b) - price(a) : Date.parse(b.created_at) - Date.parse(a.created_at)));
  }, [listings, kind, slot, tier, rarity, sort, search]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageItems = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const kinds: { id: KindFilter; label: string }[] = [
    { id: 'all', label: mt('browse.all') },
    { id: 'gear', label: mt('browse.gear') },
    { id: 'unique', label: mt('browse.unique') },
    { id: 'gold_pouch', label: mt('browse.pouch') },
    { id: 'material', label: mt('browse.material') },
  ];
  const noGear = kind === 'gold_pouch' || kind === 'material';

  return (
    <Panel className="mk-panel">
      <div className="mk-toolbar">
        <div className="mk-searchrow">
          <SearchField label={mt('browse.search')} placeholder={mt('browse.search')} value={search} onChange={(e) => change(setSearch)(e.target.value)} maxLength={40} />
          <Button className="mk-filters-toggle" variant={filtersOpen ? 'primary' : 'secondary'} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
            {mt('browse.filters')}
          </Button>
        </div>
        <div className={`mk-selects${filtersOpen ? ' open' : ''}`}>
          <SelectField label={mt('browse.slot')} value={slot} onChange={(e) => change(setSlot)(e.target.value)} disabled={noGear}>
            <option value="">{mt('browse.allCategories')}</option>
            {INSTANCED_SLOTS.map((s) => (
              <option key={s} value={s}>
                {mt(`slots.${s}`)}
              </option>
            ))}
          </SelectField>
          <SelectField label={mt('browse.rarity')} value={rarity} onChange={(e) => change(setRarity)(e.target.value)} disabled={noGear}>
            <option value="">{mt('browse.rarity')}</option>
            <option value="rare">{t('rarity.rar_rare')}</option>
            <option value="epic">{t('rarity.rar_epic')}</option>
            <option value="legendary">{t('rarity.rar_legendary')}</option>
          </SelectField>
          <SelectField label={mt('browse.tier')} value={tier} onChange={(e) => change(setTier)(e.target.value)} disabled={noGear}>
            <option value="">{mt('browse.tier')}</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={String(n)}>
                {mt('browse.tierN', { n })}
              </option>
            ))}
          </SelectField>
          <SelectField label={mt('browse.sort')} value={sort} onChange={(e) => change(setSort)(e.target.value as Sort)}>
            <option value="new">{mt('browse.sortNew')}</option>
            <option value="cheap">{mt('browse.sortCheap')}</option>
            <option value="dear">{mt('browse.sortDear')}</option>
          </SelectField>
        </div>
      </div>
      <ChipRow<KindFilter> items={kinds} value={kind} onChange={change(setKind)} label={mt('browse.all')} className="mk-chips" />
      {failure && (
        <p className="ui-alert bad" role="alert">
          {failure}
        </p>
      )}
      {shown.length === 0 && <p className="ui-note">{mt('browse.empty')}</p>}
      <ul className="mk-grid">
        {pageItems.map((l) => {
          const split = splitLamports(l.price_lamports);
          const expanded = open === l.id;
          const item = itemOfListing(l);
          const reserved = l.status === 'reserved';
          const rar = l.rarity ?? 'common';
          if (l.kind === 'material') {
            return (
              <li key={l.id} className={expanded ? 'open' : undefined}>
                <LotCard listing={l} feePercent={feePercent} solUsd={solUsd} expanded={expanded} busy={busyId !== null} onToggle={() => setOpen(expanded ? null : l.id)} onReserve={() => onReserve(l)} />
              </li>
            );
          }
          return (
            <li key={l.id} className={expanded ? 'open' : undefined}>
              <UiItemCard
                className={`mk-card${l.kind === 'gold_pouch' ? ' pouch' : ''}${reserved ? ' reserved' : ''}${expanded ? ' open' : ''}`}
                icon={<ItemIcon item={item} />}
                rarity={frameOf(item)}
                qty="x1"
                name={itemName(item)}
                rarityLabel={l.kind !== 'gold_pouch' && l.rarity ? t(`rarity.${rarityDef(rar).nameKey}`) : l.gold_amount !== null ? mt('browse.pouchWorth', { g: fmtNum(l.gold_amount) }) : undefined}
                tag={
                  <span className="mk-card-tags">
                    {l.kind === 'unique' && <Chip tone="gold">{mt('browse.unique')}</Chip>}
                    {l.tier ? <Chip>{mt('browse.tierN', { n: l.tier })}</Chip> : null}
                    <CertMark />
                    {reserved && <Chip tone="gold">{mt('browse.reserved')}</Chip>}
                  </span>
                }
                rows={[
                  {
                    label: mt('browse.price'),
                    tone: 'gold',
                    value: (
                      <>
                        <SolIcon /> {fmtSol(l.price_lamports)} <small>SOL</small>
                      </>
                    ),
                  },
                ]}
                action={
                  <Button size="sm" block onClick={() => setOpen(expanded ? null : l.id)} aria-expanded={expanded} disabled={reserved}>
                    {expanded ? mt('browse.back') : mt('browse.buy')}
                  </Button>
                }
              >
                <UsdLine lamports={l.price_lamports} solUsd={solUsd} />
                {expanded && (
                  <div className="mk-card-more">
                    <Substats item={item} />
                    {usableAtLevel(l, heroLevel) !== null && <p className="ui-note mk-level-note">{mt('browse.usableAtLevel', { n: usableAtLevel(l, heroLevel) as number })}</p>}
                    <p className="ui-note">
                      {mt('rules.fee', { pct: feePercent })}: {fmtSol(split.feeLamports)} SOL. {mt('pay.toSeller')}: {fmtSol(split.sellerLamports)} SOL.
                    </p>
                    <Button variant="primary" size="sm" block disabled={reserved || busyId !== null} onClick={() => onReserve(l)}>
                      {busyId === l.id ? mt('loading') : mt('browse.reserve')}
                    </Button>
                  </div>
                )}
              </UiItemCard>
            </li>
          );
        })}
      </ul>
      {pages > 1 && (
        <nav className="mk-pager" aria-label={mt('browse.page', { n: current + 1 })}>
          <Button size="sm" onClick={() => setPage(0)} disabled={current === 0} aria-label={mt('browse.first')}>
            {'«'}
          </Button>
          {pageWindow(current, pages).map((p) => (
            <Button key={p} size="sm" variant={p === current ? 'primary' : 'secondary'} onClick={() => setPage(p)} aria-current={p === current ? 'page' : undefined}>
              {p + 1}
            </Button>
          ))}
          <Button size="sm" onClick={() => setPage(pages - 1)} disabled={current === pages - 1} aria-label={mt('browse.last')}>
            {'»'}
          </Button>
        </nav>
      )}
    </Panel>
  );
}
