import type { HTMLAttributes, ReactNode } from 'react';

export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';

// The square that holds an item's art: a frame in the colour of its rarity and, optionally, a quantity badge at the bottom right ("x50", "+4").
export function ItemFrame({ rarity = 'common', qty, size = 'md', children }: { rarity?: CardRarity; qty?: ReactNode; size?: 'sm' | 'md' | 'lg'; children: ReactNode }) {
  return (
    <span className={`ui-frame r-${rarity} ${size}`}>
      <span className="ui-frame-art">{children}</span>
      {qty !== undefined && qty !== null && qty !== '' && <span className="ui-frame-qty">{qty}</span>}
    </span>
  );
}

export interface ItemRow {
  label: ReactNode;
  value: ReactNode;
  tone?: 'plain' | 'gold' | 'good' | 'bad';
}

type CardProps = {
  icon: ReactNode;
  rarity?: CardRarity;
  qty?: ReactNode;
  name: ReactNode;
  rarityLabel?: ReactNode;
  tag?: ReactNode;
  rows?: ItemRow[];
  children?: ReactNode;
  action?: ReactNode;
  selected?: boolean;
} & Omit<HTMLAttributes<HTMLElement>, 'title'>;

// A card like the market's: the icon in its rarity frame with a quantity badge, the name, the rarity in its colour, label / value rows and a full-width action at the foot. Everything but `name` and `icon` is optional.
// `children` is extra content between the rows and the action (stat lines, a durability bar). `selected` outlines it in gold. The card itself is not a button: its action is.
export default function ItemCard({ icon, rarity = 'common', qty, name, rarityLabel, tag, rows, children, action, selected, className = '', ...rest }: CardProps) {
  return (
    <article className={`ui-item r-${rarity}${selected ? ' selected' : ''}${className ? ` ${className}` : ''}`} {...rest}>
      <div className="ui-item-top">
        <ItemFrame rarity={rarity} qty={qty}>
          {icon}
        </ItemFrame>
        <div className="ui-item-id">
          <h4 className="ui-item-name">{name}</h4>
          {rarityLabel && <span className={`ui-item-rarity r-${rarity}`}>{rarityLabel}</span>}
          {tag}
        </div>
      </div>
      {rows && rows.length > 0 && (
        <dl className="ui-item-rows">
          {rows.map((r, i) => (
            <div className="ui-item-row" key={i}>
              <dt>{r.label}</dt>
              <dd className={r.tone && r.tone !== 'plain' ? r.tone : undefined}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {action && <div className="ui-item-action">{action}</div>}
    </article>
  );
}
