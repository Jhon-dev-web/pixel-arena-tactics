import { useContext } from 'react';
import { t } from '../locales';
import { BagContext } from './bagContext';
import { isBagFull } from '../game/inventory';
import { stashFreeSlots } from '../game/stash';
import { wholesaleUnlocked } from '../game/wholesale';
import { Button } from './ui';

// The "Atacadista" button the full-bag warnings and the welcome-back summary carry. It only OPENS the wholesale tab (a shop screen): nothing is ever sold from here. Shown only
// once the merchant is unlocked (wholesale.ts), and nothing at all outside the BagContext. `show="ifFull"`: only while the bag or the stash has no room.
export default function WholesaleLink({ hint = false, show = 'always' }: { hint?: boolean; show?: 'always' | 'ifFull' }) {
  const bag = useContext(BagContext);
  if (!bag || !wholesaleUnlocked(bag.save)) return null;
  if (show === 'ifFull' && !isBagFull(bag.save) && stashFreeSlots(bag.save) > 0) return null;
  return (
    <span className="ws-link-wrap">
      {hint && <span className="ws-link-hint">{t('wholesale.fullHint')}</span>}
      <Button size="sm" onClick={bag.openWholesale}>
        {t('wholesale.link')}
      </Button>
    </span>
  );
}
