import { t } from '../locales';
import type { GearItem } from '../game/gear';
import { itemIdentity } from './identityView';

// The strip under an item's description (forge recipe, inventory detail): the piece's weight and the style it counts for, the line of a weapon, and how many abilities it grants. "You are what you wear" only
// works if the player can SEE what each piece is made of before he chooses it. Two short lines at most (each fits the 375 px phone on its own); the words reuse the seal's (affinity.weight / affinity.style) and the
// Taticas screen's (tactics.line). A ring, a relic and the tier 0 starting gear get nothing, and so does every slot that grants no ability: the second line exists only for the weapon and the chestpiece.
export default function ItemIdentity({ item }: { item: GearItem }) {
  const v = itemIdentity(item);
  if (!v) return null;
  const style = t(`affinity.style.${v.cls}`);
  const first = v.line ? t('itemIdentity.weapon', { line: t(`tactics.line.${v.line}`), style }) : t('itemIdentity.armor', { weight: t(`affinity.weight.${v.weight}`), style });
  return (
    <div className="item-identity" data-testid="item-identity" data-weight={v.weight} data-class={v.cls}>
      <span className="item-identity-kind">{first}</span>
      {v.abilities > 0 && (
        <span className="item-identity-abilities" data-testid="item-identity-abilities">
          {v.abilities === 1 ? t('itemIdentity.grantsOne') : t('itemIdentity.grants', { n: v.abilities })}
        </span>
      )}
    </div>
  );
}
