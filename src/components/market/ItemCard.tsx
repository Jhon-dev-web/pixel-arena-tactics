import { fmtNum, t } from '../../locales';
import { mt } from '../../locales/market';
import { getConsumable } from '../../game/consumables';
import { getGear } from '../../game/gear';
import { getMaterial, MaterialId } from '../../game/materials';
import MaterialIcon from '../MaterialIcon';
import { rarityDef, substatNameKey } from '../../game/rarity';
import ConsumableIcon from '../ConsumableIcon';
import GearIcon from '../GearIcon';
import { fmtSubstat } from '../substatText';
import { Chip, ItemFrame } from '../ui';
import { itemName, materialFrame } from './names';
import { fmtUnitPrice } from './format';

// One market item, as the SERVER's certificate describes it (template, rarity, tier, the rolled substats). Used by the listings, the sell list and the history.
export interface ItemLike {
  /** 'material' = a lot of one tradeable material (templateId is the material id) */
  kind: 'gear' | 'unique' | 'gold_pouch' | 'material';
  templateId: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | null;
  tier: number | null;
  substats: { type: string; value: number }[];
  goldAmount: number | null;
  /** a lot of a material: how many units, and the price of one unit in micro-SOL */
  quantity?: number;
  unitPriceMicro?: number;
}

/** The frame colour of an item: a lot takes its material's class, a pouch is plain, everything else its own rarity. */
export const frameOf = (item: ItemLike): 'common' | 'rare' | 'epic' | 'legendary' => (item.kind === 'material' ? materialFrame(item.templateId) : item.kind === 'gold_pouch' ? 'common' : item.rarity ?? 'common');

/** The item's icon alone (the frame is the shared ItemFrame around it). */
export function ItemIcon({ item }: { item: ItemLike }) {
  const material = item.kind === 'material' ? getMaterial(item.templateId as MaterialId) : undefined;
  const gear = item.kind === 'gold_pouch' || item.kind === 'material' ? undefined : getGear(item.templateId);
  const pouch = item.kind === 'gold_pouch' ? getConsumable(item.templateId) : undefined;
  return material ? <MaterialIcon item={material} className="inline-icon" /> : gear ? <GearIcon item={gear} /> : pouch ? <ConsumableIcon item={pouch} className="inline-icon" /> : null;
}

/** The item's icon in a frame of its rarity colour, with the quantity badge when one is given. */
export function ItemArt({ item, qty }: { item: ItemLike; qty?: number }) {
  return (
    <ItemFrame rarity={frameOf(item)} qty={qty !== undefined ? `x${fmtNum(qty)}` : undefined}>
      <ItemIcon item={item} />
    </ItemFrame>
  );
}

/** The mark of a certified piece. */
export function CertMark() {
  return (
    <span className="mk-cert" title={mt('browse.certificateHint')}>
      <Chip tone="good">
        {'✓ '}
        {mt('browse.certificate')}
      </Chip>
    </span>
  );
}

/** The rolled substats of a piece, one line each. */
export function Substats({ item }: { item: ItemLike }) {
  if (item.substats.length === 0) return null;
  return (
    <span className="substat-list">
      {item.substats.map((s, i) => (
        <span className="substat-line" key={i}>
          +{fmtSubstat(s as never)} {t(`rarity.${substatNameKey(s.type as never)}`)}
        </span>
      ))}
    </span>
  );
}

export default function ItemCard({ item, compact = false, children }: { item: ItemLike; compact?: boolean; children?: React.ReactNode }) {
  const lot = item.kind === 'material';
  const gear = item.kind === 'gold_pouch' || lot ? undefined : getGear(item.templateId);
  const rarity = frameOf(item);
  return (
    <div className={`mk-item${compact ? ' compact' : ''}`}>
      <ItemArt item={item} qty={lot ? item.quantity : undefined} />
      <span className="mk-item-body">
        <span className={`mk-item-name r-${item.kind === 'gold_pouch' ? 'common' : rarity}`}>{itemName(item)}</span>
        <span className="mk-item-meta">
          {lot && <Chip tone="gold">{mt('browse.tradeable')}</Chip>}
          {lot && item.unitPriceMicro ? <Chip>{mt('browse.perUnit', { p: fmtUnitPrice(item.unitPriceMicro) })}</Chip> : null}
          {item.kind !== 'gold_pouch' && item.rarity && <span className={`ui-item-rarity r-${rarity}`}>{t(`rarity.${rarityDef(rarity).nameKey}`)}</span>}
          {item.kind === 'unique' && <Chip tone="gold">{mt('browse.unique')}</Chip>}
          {item.tier ? <Chip>{mt('browse.tierN', { n: item.tier })}</Chip> : null}
          {gear && item.kind !== 'gold_pouch' && <Chip>{mt(`slots.${gear.slot}`)}</Chip>}
          {item.kind === 'gold_pouch' && item.goldAmount !== null && <Chip>{mt('browse.pouchWorth', { g: fmtNum(item.goldAmount) })}</Chip>}
          {!lot && <CertMark />}
        </span>
        {!compact && <Substats item={item} />}
        {children}
      </span>
    </div>
  );
}
