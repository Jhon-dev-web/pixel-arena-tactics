import { useState } from 'react';
import { mt } from '../../locales/market';
import type { ChainPublic } from '../../../supabase/functions/_shared/market/types';
import { Button, Panel } from '../ui';
import { Warnings } from './WalletPanel';

/** The standing notices of the market as ONE compact line under the tabs (test network, the game never asks for your key, you pay the seller directly), with "Learn more" for the full texts.
 *  The wallet-link and payment steps do not use this: they carry the full key warning (Warnings) always. */
export default function Notices({ chain }: { chain: ChainPublic | null }) {
  const [open, setOpen] = useState(false);
  const parts = [...(chain && !chain.livemode ? [mt('notices.test')] : []), mt('notices.noKey'), mt('notices.direct')];
  return (
    <Panel tone="inset" className="mk-notices">
      <div className="mk-notices-row">
        <p className={`mk-notices-line${chain && !chain.livemode ? ' test' : ''}`}>{parts.join(' · ')}</p>
        <Button size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? mt('notices.less') : mt('notices.more')}
        </Button>
      </div>
      {open && (
        <div className="mk-notices-full">
          <Warnings chain={chain} />
          <p className="ui-note">{mt('rules.feeExplain', { pct: chain?.feePercent ?? 5 })}</p>
        </div>
      )}
    </Panel>
  );
}
