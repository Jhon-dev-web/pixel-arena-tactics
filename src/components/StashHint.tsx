import { useContext } from 'react';
import { fmtNum, t } from '../locales';
import { StackKind, stashHintFor } from '../game/stash';
import { BagContext } from './bagContext';
import { Button } from './ui';

// Recipes, orders and upgrades consume only from the inventory, never from the camp stash. So wherever a screen says "you lack X", this small hint says when
// the Baú holds the missing units ("você tem 40 no Baú") and offers one click to bring them over, when there is room for them.
// The save and the bring-over action come from a context App provides once (bagContext.ts), so no recipe screen needs new props.

export default function StashHint({ kind, id, need }: { kind: StackKind; id: string; need: number }) {
  const ctx = useContext(BagContext);
  if (!ctx) return null;
  const hint = stashHintFor(ctx.save, kind, id, need);
  if (!hint) return null;
  return (
    <span className="stash-hint">
      {t('stash.hintHave', { n: fmtNum(hint.inStash) })}
      {hint.fits ? (
        <Button size="sm" className="stash-hint-btn" onClick={() => ctx.move('take', kind, id, hint.bring)}>
          {t('stash.bring', { n: fmtNum(hint.bring) })}
        </Button>
      ) : (
        <span className="stash-hint-full">{t('stash.noRoomToBring')}</span>
      )}
    </span>
  );
}
