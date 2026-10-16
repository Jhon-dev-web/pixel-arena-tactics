import { fmtNum, t } from '../../locales';
import { mt } from '../../locales/market';
import { getConsumable } from '../../game/consumables';
import { getGear } from '../../game/gear';
import { rarityDef, substatNameKey } from '../../game/rarity';
import ConsumableIcon from '../ConsumableIcon';
import GearIcon from '../GearIcon';
import { fmtSubstat } from '../substatText';
import { itemName } from './names';

// One market item, as the SERVER's certificate describes it (template, rarity, tier, the rolled substats). Used by the listings, the sell list and the history.
export interface ItemLike {
  kind: 'gear' | 'unique' | 'gold_pouch';
  templateId: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | null;
  tier: number | null;
  substats: { type: string; value: number }[];
  goldAmount: number | null;
}

export default function ItemCard({ item, compact = false, children }: { item: ItemLike; compact?: boolean; children?: React.ReactNode }) {
  const gear = item.kind === 'gold_pouch' ? undefined : getGear(item.templateId);
  const pouch = item.kind === 'gold_pouch' ? getConsumable(item.templateId) : undefined;
  const rarity = item.rarity ?? 'common';
  return (
    <div className={`mk-item${compact ? ' compact' : ''}`}>
      <span className="mk-item-art" aria-hidden>
        {gear ? <GearIcon item={gear} /> : pouch ? <ConsumableIcon item={pouch} className="inline-icon" /> : null}
      </span>
      <span className="mk-item-body">
        <span className="mk-item-name">{itemName(item)}</span>
        <span className="mk-item-meta">
          {item.kind !== 'gold_pouch' && item.rarity && <span className={`rarity-line r-${rarity}`}>{t(`rarity.${rarityDef(rarity).nameKey}`)}</span>}
          {item.kind === 'unique' && <span className="mk-tag">{mt('browse.unique')}</span>}
          {item.tier ? <span className="mk-tag">{mt('browse.tierN', { n: item.tier })}</span> : null}
          {gear && item.kind !== 'gold_pouch' && <span className="mk-tag">{mt(`slots.${gear.slot}`)}</span>}
          {item.kind === 'gold_pouch' && item.goldAmount !== null && <span className="mk-tag">{mt('browse.pouchWorth', { g: fmtNum(item.goldAmount) })}</span>}
          <span className="mk-cert" title={mt('browse.certificateHint')}>
            {mt('browse.certificate')}
          </span>
        </span>
        {!compact && item.substats.length > 0 && (
          <span className="substat-list">
            {item.substats.map((s, i) => (
              <span className="substat-line" key={i}>
                +{fmtSubstat(s as never)} {t(`rarity.${substatNameKey(s.type as never)}`)}
              </span>
            ))}
          </span>
        )}
        {children}
      </span>
    </div>
  );
}
