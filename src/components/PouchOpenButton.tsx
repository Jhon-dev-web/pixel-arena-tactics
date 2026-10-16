import { useEffect, useState } from 'react';
import { fmtNum, t } from '../locales';
import { PouchId, pouchFace } from '../game/goldPouch';
import { Button } from './ui';

// Opening a Gold Pouch is irreversible, so it takes two taps: the first arms the button (it says what is about to happen), the second opens. Used by the shop tab and by the
// inventory detail of a pouch (which passes its own `className` for the inventory's button style).
export default function PouchOpenButton({ id, onOpen, className }: { id: PouchId; onOpen: (id: PouchId) => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  // an armed confirmation never survives a change of pouch
  useEffect(() => setArmed(false), [id]);
  const press = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onOpen(id);
  };
  const label = armed ? t('pouch.confirmOpen', { g: fmtNum(pouchFace(id)) }) : t('pouch.open', { g: fmtNum(pouchFace(id)) });
  if (className) {
    return (
      <button className={`${className}${armed ? ' confirm' : ''}`} onClick={press} data-ui>
        {label}
      </button>
    );
  }
  return (
    <Button block variant={armed ? 'primary' : 'secondary'} onClick={press}>
      {label}
    </Button>
  );
}
