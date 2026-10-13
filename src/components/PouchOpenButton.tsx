import { useEffect, useState } from 'react';
import { fmtNum, t } from '../locales';
import { PouchId, pouchFace } from '../game/goldPouch';

// Opening a Gold Pouch is irreversible, so it takes two taps: the first arms the button (it says what is about to happen), the second opens. Used by the shop tab and by the
// inventory detail of a pouch.
export default function PouchOpenButton({ id, onOpen, className = 'gear-action sell' }: { id: PouchId; onOpen: (id: PouchId) => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  // an armed confirmation never survives a change of pouch
  useEffect(() => setArmed(false), [id]);
  return (
    <button
      className={`${className}${armed ? ' confirm' : ''}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onOpen(id);
      }}
      data-ui
    >
      {armed ? t('pouch.confirmOpen', { g: fmtNum(pouchFace(id)) }) : t('pouch.open', { g: fmtNum(pouchFace(id)) })}
    </button>
  );
}
